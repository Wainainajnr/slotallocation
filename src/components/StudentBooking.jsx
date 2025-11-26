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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefreshRef.current) {
      clearTimeout(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }
  }, []);

  // Wrap loadSlots in useCallback to prevent unnecessary recreations
  const loadSlots = useCallback(async () => {
    // Don't start new requests if we're already in a 431 recovery state
    if (autoRefreshRef.current) return;
    
    setLoading(true);
    try {
      const data = await api.getSlots();
      setSlots(data);
      failuresRef.current = 0; // Reset failure count on success
    } catch (err) {
      console.error('[StudentBooking] loadSlots error', err);
      failuresRef.current = (failuresRef.current || 0) + 1;
      
      if (err?.status === 431 || err?.isHeaderTooLarge) {
        showMessage('Session issue detected. Auto-refreshing page in 3 seconds...', 'error');
        
        // Stop all polling immediately
        clearAllIntervals();
        
        // Auto-refresh after delay
        autoRefreshRef.current = setTimeout(() => {
          console.log('Auto-refreshing page due to 431 error');
          window.location.reload();
        }, 3000);
        
      } else if (err?.isNetworkError || err?.status === 0) {
        const hostHint = api.remoteBase || 'http://localhost:3001';
        showMessage(
          `Cannot reach backend at ${hostHint}. Start it with \`npm run start:backend\` and ensure it listens on port 3001.`,
          'error'
        );
      } else {
        showMessage('Error loading available slots', 'error');
      }
      
      // Stop polling after 3 failures of any type
      if (failuresRef.current >= 3 && intervalRef.current) {
        clearAllIntervals();
        showMessage('Stopped auto-refresh due to repeated errors', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showMessage, clearAllIntervals]);

  useEffect(() => {
    loadSlots();
    
    intervalRef.current = setInterval(() => {
      if (failuresRef.current >= 3 || autoRefreshRef.current) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      loadSlots();
    }, 10000);
    
    return () => {
      clearAllIntervals();
    };
  }, [loadSlots, clearAllIntervals]);

  const handleSlotSelect = (slot) => {
    // Don't allow slot selection during 431 recovery
    if (autoRefreshRef.current) return;
    setSelectedSlot(slot);
  };

  const handleBookSlot = async () => {
    // Don't allow booking during 431 recovery
    if (autoRefreshRef.current) {
      showMessage('Page is refreshing due to session issues. Please wait...', 'error');
      return;
    }

    if (!currentStudentName.trim() || !selectedSlot) {
      showMessage('Please enter your name and select a slot.', 'error');
      return;
    }

    // Find the actual slot object
    const slot = selectedSlot && selectedSlot.hour
      ? selectedSlot
      : slots.find((s) => s.id === selectedSlot);

    if (!slot) {
      showMessage('Selected slot not found.', 'error');
      return;
    }

    const name = currentStudentName.trim();
    
    // Validation checks
    if ((slot.students || []).includes(name)) {
      showMessage('You already have this slot booked.', 'info');
      return;
    }

    if ((slot.students || []).length >= (slot.capacity || 4)) {
      showMessage('This slot is already fully booked.', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await api.bookSlot(slot.hour || slot.id, name);
      if (result && result.success) {
        showMessage(`🎉 Booking confirmed for ${name} at ${formatRange(slot.hour)}`, 'success');
        setSelectedSlot(null);
        setCurrentStudentName(""); // Clear name after successful booking
        loadSlots();
      } else {
        showMessage(result?.message || 'Booking failed', 'error');
      }
    } catch (err) {
      console.error('[StudentBooking] book error', err);
      if (err?.status === 431 || err?.isHeaderTooLarge) {
        showMessage('Session issue detected. Page will refresh automatically...', 'error');
        
        // Stop all polling and schedule refresh
        clearAllIntervals();
        autoRefreshRef.current = setTimeout(() => {
          window.location.reload();
        }, 3000);
        
      } else if (err?.isNetworkError || err?.status === 0) {
        const hostHint = api.remoteBase || 'http://localhost:3001';
        showMessage(
          `Network error while booking. Cannot reach backend at ${hostHint}. Start it with \`npm run start:backend\`.`,
          'error'
        );
      } else {
        showMessage('Error making booking', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show a different state when we're in 431 recovery mode
  if (autoRefreshRef.current) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
          BOOK YOUR DRIVING SESSION
        </h2>
        
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-700 mb-2">Resetting session...</p>
          <p className="text-sm text-gray-500">Page will refresh automatically to fix session issues</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-lg w-full sm:max-w-xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
        BOOK YOUR DRIVING SESSION
      </h2>

      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name *
          </label>
          <input
            type="text"
            value={currentStudentName}
            onChange={(e) => setCurrentStudentName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full border-2 border-indigo-100 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            disabled={loading || autoRefreshRef.current}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Select Time
          </label>
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg shadow-md disabled:opacity-50 transition-colors duration-200"
            disabled={!currentStudentName.trim() || !selectedSlot || loading || autoRefreshRef.current}
          >
            {loading ? 'Booking...' : 'Book Selected Slot'}
          </button>
        </div>

        {message && (
          <div
            className={`p-4 mt-2 rounded-lg border ${
              messageType === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : messageType === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-yellow-50 text-yellow-800 border-yellow-200'
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentBooking;