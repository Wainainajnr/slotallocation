import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api.js";
import AvailabilityGrid from "./AvailabilityGrid.jsx";

const StudentBooking = () => {
  const [currentStudentName, setCurrentStudentName] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const failuresRef = useRef(0);
  const intervalRef = useRef(null);
  const autoRefreshRef = useRef(null);

  const formatRange = (hourStr) => {
    if (!hourStr) return "";
    const h = parseInt(hourStr, 10);
    const startH = h % 12 === 0 ? 12 : h % 12;
    const end = (h + 1) % 24;
    const endH = end % 12 === 0 ? 12 : end % 12;
    const startSuffix = h < 12 ? "am" : "pm";
    const endSuffix = (h + 1) < 12 || (h + 1) === 24 ? "am" : "pm";
    return `${startH}${startSuffix}-${endH}${endSuffix}`;
  };

  const showMessage = useCallback((text, type) => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 6000);
  }, []);

  const clearAllIntervals = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current);
    intervalRef.current = null;
    autoRefreshRef.current = null;
  }, []);

  const loadSlots = useCallback(async (preserveSuspended = false) => {
    if (autoRefreshRef.current) return;
    setLoading(true);
    try {
      const data = await api.getSlots();
      
      // Preserve suspended state during auto-refresh (like AdminPanel does)
      const updatedSlots = data.map(newSlot => {
        const existingSlot = slots.find(s => s.id === newSlot.id);
        return preserveSuspended && existingSlot
          ? { ...newSlot, suspended: existingSlot.suspended }
          : newSlot;
      });
      
      setSlots(updatedSlots);
      failuresRef.current = 0;
    } catch (err) {
      console.error('[StudentBooking] loadSlots error', err);
      failuresRef.current += 1;

      if (err?.status === 431 || err?.isHeaderTooLarge) {
        showMessage('Session issue detected. Auto-refreshing page...', 'error');
        clearAllIntervals();
        autoRefreshRef.current = setTimeout(() => window.location.reload(), 3000);
      } else if (err?.isNetworkError || err?.status === 0) {
        showMessage(`Cannot reach backend at ${api.remoteBase || 'http://localhost:3001'}`, 'error');
      } else {
        showMessage('Error loading slots', 'error');
      }

      if (failuresRef.current >= 3) {
        clearAllIntervals();
        showMessage('Stopped auto-refresh due to repeated errors', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showMessage, clearAllIntervals, slots]); // Added slots to dependencies

  useEffect(() => {
    loadSlots();
    intervalRef.current = setInterval(() => loadSlots(true), 10000); // Pass true to preserve suspended state
    return () => clearAllIntervals();
  }, [loadSlots, clearAllIntervals]);

  const handleSlotSelect = (slot) => {
    if (autoRefreshRef.current) return;
    if (slot.suspended) return; // Prevent selecting suspended slot
    setSelectedSlot(slot);
  };

  const handleBookSlot = async () => {
    if (autoRefreshRef.current) return showMessage('Page is refreshing. Please wait...', 'error');
    if (!currentStudentName.trim() || !selectedSlot) return showMessage('Enter name and select a slot', 'error');

    const slot = slots.find((s) => s.id === selectedSlot.id);
    if (!slot) return showMessage('Selected slot not found', 'error');

    if (slot.students.includes(currentStudentName.trim())) return showMessage('You already booked this slot', 'info');
    if (slot.students.length >= slot.capacity) return showMessage('Slot is full', 'error');

    setLoading(true);
    try {
      const result = await api.bookSlot(slot.hour || slot.id, currentStudentName.trim());
      if (result?.success) {
        showMessage(`🎉 Booking confirmed for ${currentStudentName.trim()} at ${formatRange(slot.hour)}`, 'success');
        setSelectedSlot(null);
        setCurrentStudentName("");
        loadSlots(true); // Preserve suspended state after booking
      } else {
        showMessage(result?.message || 'Booking failed', 'error');
      }
    } catch (err) {
      console.error('[StudentBooking] book error', err);
      showMessage('Error making booking', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="student-section">
      {message && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded shadow ${
          messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          {message}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6 text-indigo-900">Book Your Session</h2>

      <div className="form-group">
        <label>Your Name *</label>
        <input
          type="text"
          value={currentStudentName}
          onChange={(e) => setCurrentStudentName(e.target.value)}
          placeholder="Enter your full name"
          disabled={loading || autoRefreshRef.current}
        />
      </div>

      <div className="form-group">
        <label>Select Time</label>
        <AvailabilityGrid
          availability={slots.map(s => ({ ...s, label: formatRange(s.hour) }))}
          selectedSlot={selectedSlot}
          onSlotSelect={handleSlotSelect}
          currentStudentName={currentStudentName.trim()}
          disabled={loading || autoRefreshRef.current}
        />
      </div>

      <div className="mt-6">
        <button
          onClick={handleBookSlot}
          className="btn btn-primary w-full"
          disabled={!currentStudentName.trim() || !selectedSlot || loading || autoRefreshRef.current || selectedSlot?.suspended}
        >
          {loading ? 'Booking...' : 'Book Selected Slot'}
        </button>
      </div>
    </div>
  );
};

export default StudentBooking;