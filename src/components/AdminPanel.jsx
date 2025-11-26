// File: src/components/AdminPanel.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api.js";

const AdminPanel = () => {
  const [slots, setSlots] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ message: "", type: "info", open: false });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, student: null, slotId: null });
  const [suspendDialog, setSuspendDialog] = useState({ open: false, slot: null, action: null });

  const failuresRef = useRef(0);
  const intervalRef = useRef(null);

  // Calculate stats
  const calculateStats = () => {
    const totalSlots = slots.length;
    const suspendedSlots = slots.filter(s => s.suspended).length;
    
    const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 4), 0);
    const totalBooked = slots.reduce((sum, slot) => sum + (Array.isArray(slot.students) ? slot.students.length : 0), 0);
    const totalAvailable = totalCapacity - totalBooked;
    
    const activeSlots = totalSlots - suspendedSlots;
    
    return {
      totalSlots,
      suspendedSlots,
      totalBooked,
      totalAvailable,
      activeSlots,
      totalCapacity
    };
  };

  const stats = calculateStats();

  // Load slots on mount and every 10 seconds
  useEffect(() => {
    loadSlots();
    intervalRef.current = setInterval(() => {
      if (failuresRef.current >= 3) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }
      loadSlots(true); // preserve suspended state
    }, 10000);
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, []);

  const showSnackbar = (message, type = "info", duration = 4000) => {
    setSnackbar({ message, type, open: true });
    setTimeout(() => setSnackbar(s => ({ ...s, open: false })), duration);
  };

  // Load slots, optionally preserving suspended state
  const loadSlots = async (preserveSuspended = false) => {
    try {
      const data = await api.getSlots();
      const updatedSlots = data.map(slot => {
        const existingSlot = slots.find(s => s.id === slot.id);
        return preserveSuspended && existingSlot
          ? { ...slot, suspended: existingSlot.suspended }
          : slot;
      });
      setSlots(updatedSlots);
      failuresRef.current = 0;
    } catch (err) {
      console.error("Error loading slots", err);
      failuresRef.current++;
      showSnackbar(err?.status === 431
        ? 'Request headers too large. Clear cookies or use incognito.'
        : "Failed to load slots from server", 'error');
    }
  };

  const openModal = (slotId) => {
    setSelectedSlotId(slotId);
    setStudentName("");
    setModalOpen(true);
  };

  const handleBooking = async () => {
    if (!studentName.trim()) return showSnackbar("Input name", "error");
    setBookingLoading(true);
    try {
      const result = await api.bookSlot(selectedSlotId, studentName.trim());
      if (result.success) {
        setModalOpen(false);
        loadSlots(true);
        showSnackbar("Student booked successfully!", "success");
      } else {
        showSnackbar(result.message || "Failed to book student", "error");
      }
    } catch (err) {
      console.error(err);
      showSnackbar(err?.status === 431
        ? 'Request headers too large. Clear cookies or use incognito.'
        : "Error booking student", "error");
    } finally {
      setBookingLoading(false);
    }
  };

  const formatRange = (hourStr) => {
    if (!hourStr) return '';
    const h = parseInt(hourStr, 10);
    const startH = h % 12 === 0 ? 12 : h % 12;
    const end = (h + 1) % 24;
    const endH = end % 12 === 0 ? 12 : end % 12;
    const startSuffix = h < 12 ? 'am' : 'pm';
    const endSuffix = (h + 1) < 12 || (h + 1) === 24 ? 'am' : 'pm';
    return `${startH}${startSuffix}-${endH}${endSuffix}`;
  };

  // Open suspend confirmation dialog
  const openSuspendDialog = (slot, action) => {
    setSuspendDialog({ open: true, slot, action });
  };

  // Handle suspend/unsuspend after confirmation
  const handleSuspendConfirmed = async () => {
    const { slot, action } = suspendDialog;
    setSuspendDialog({ open: false, slot: null, action: null });

    const students = Array.isArray(slot.students) ? slot.students : [];

    if (action === 'suspend' && students.length > 0) {
      showSnackbar("Cannot suspend slot with students", "error");
      return;
    }

    try {
      const slotId = slot.id;
      // Persist suspension to backend
      await api.suspendSlot(slotId, action);

      // Optimistic UI update
      setSlots(prev =>
        prev.map(s =>
          s.id === slotId ? { ...s, suspended: action === 'suspend' } : s
        )
      );

      showSnackbar(action === 'suspend' ? 'Slot suspended!' : 'Slot unsuspended!', 'success');
    } catch (err) {
      console.error(err);
      showSnackbar(err.message || "Failed to update slot", "error");
    }
  };

  return (
    <div className="admin-panel">
      <h2 className="text-2xl font-bold mb-6 text-indigo-900 px-4 sm:px-0">Admin Dashboard</h2>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 px-4 sm:px-0">
        {/* Total Slots */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Slots</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSlots}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <span className="text-blue-600 text-lg">⏱️</span>
            </div>
          </div>
        </div>

        {/* Booked Spots */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Booked</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalBooked}</p>
              <p className="text-xs text-gray-500">of {stats.totalCapacity} total</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <span className="text-green-600 text-lg">👥</span>
            </div>
          </div>
        </div>

        {/* Available Spots */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAvailable}</p>
              <p className="text-xs text-gray-500">spots left</p>
            </div>
            <div className="bg-emerald-100 p-3 rounded-lg">
              <span className="text-emerald-600 text-lg">✅</span>
            </div>
          </div>
        </div>

        {/* Suspended Slots */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Suspended</p>
              <p className="text-2xl font-bold text-gray-900">{stats.suspendedSlots}</p>
              <p className="text-xs text-gray-500">of {stats.totalSlots} total</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <span className="text-red-600 text-lg">🔒</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Stats Bar - Simplified for mobile */}
      <div className="bg-indigo-50 p-4 rounded-lg mb-6 mx-4 sm:mx-0 lg:hidden">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-indigo-700">{stats.totalBooked}</div>
            <div className="text-sm text-indigo-600">Booked</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-700">{stats.totalAvailable}</div>
            <div className="text-sm text-indigo-600">Available</div>
          </div>
        </div>
      </div>

      <div className="availability-grid mobile-grid">
        {[...slots].sort((a,b)=>parseInt(a.hour,10)-parseInt(b.hour,10)).map(slot => {
          const students = Array.isArray(slot.students) ? slot.students : [];
          const booked = students.length;
          const capacity = slot.capacity ?? 4;
          const available = Math.max(0, capacity - booked);

          return (
            <div 
              key={slot.id} 
              className={`time-slot p-4 rounded-lg mb-4 border-2 ${
                slot.suspended 
                  ? 'bg-gray-100 border-gray-300 opacity-60' 
                  : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              {/* Header Section */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="text-lg font-semibold text-gray-900">{formatRange(slot.hour)}</div>
                  <div className={`text-sm font-medium ${
                    available === 0 ? 'text-red-600' : 
                    slot.suspended ? 'text-gray-500' : 'text-green-600'
                  }`}>
                    {slot.suspended ? 'Suspended' : `${available} of ${capacity} available`}
                  </div>
                </div>
                {slot.suspended && (
                  <div className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded">
                    🔒 Suspended
                  </div>
                )}
              </div>

              {/* Students List */}
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-2">Students:</div>
                {students.length > 0 ? (
                  <div className="space-y-2">
                    {students.map((student, index) => (
                      <div key={index} className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                        <span className="text-sm text-gray-800 truncate flex-1 mr-2">{student}</span>
                        <button
                          onClick={() => setConfirmDialog({ open: true, student, slotId: slot.id })}
                          className="text-red-600 hover:text-red-800 font-bold text-lg w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                          title="Remove student"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 italic text-sm bg-gray-50 rounded-lg p-3 text-center">
                    No bookings
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                {/* Suspend/Unsuspend Button */}
                {slot.suspended ? (
                  <button
                    onClick={() => openSuspendDialog(slot, 'unsuspend')}
                    className="btn bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300 py-3 sm:py-2 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <span>🔓</span>
                    <span>Unsuspend</span>
                  </button>
                ) : (
                  <button
                    onClick={() => openSuspendDialog(slot, 'suspend')}
                    disabled={students.length > 0}
                    className={`btn py-3 sm:py-2 text-sm font-medium flex items-center justify-center gap-2 ${
                      students.length > 0 
                        ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-800 hover:bg-gray-300 border-gray-300'
                    }`}
                    title={students.length > 0 ? "Cannot suspend slot with students" : "Suspend slot"}
                  >
                    <span>🔒</span>
                    <span>Suspend</span>
                  </button>
                )}

                {/* Add Booking Button */}
                {!slot.suspended && (
                  <button
                    onClick={() => openModal(slot.id)}
                    disabled={available === 0}
                    className={`btn btn-primary py-3 sm:py-2 text-sm font-medium flex items-center justify-center gap-2 ${
                      available === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <span>+</span>
                    <span>Add Booking</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rest of the modals remain the same */}
      {/* Booking Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">Manual Booking</h3>
              <input
                type="text"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder="Enter student name"
                className="w-full p-4 border border-gray-300 rounded-lg text-base mb-6 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setModalOpen(false)} 
                  className="btn bg-gray-200 text-gray-700 hover:bg-gray-300 py-3 px-6 font-medium order-2 sm:order-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBooking} 
                  disabled={bookingLoading}
                  className="btn btn-primary py-3 px-6 font-medium order-1 sm:order-2"
                >
                  {bookingLoading ? "Booking..." : "Confirm Booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Modal */}
      {suspendDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-200">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-3 text-[#4B2E83]">
                {suspendDialog.action === 'suspend' ? 'Suspend Slot' : 'Unsuspend Slot'}
              </h3>
              <p className="mb-6 text-gray-700 text-base">
                Are you sure you want to {suspendDialog.action} the{" "}
                <span className="font-semibold text-[#4B2E83]">
                  {formatRange(suspendDialog.slot?.hour)}
                </span>{" "}
                slot?
                {suspendDialog.action === 'suspend' && (
                  <span className="block mt-3 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                    ⚠️ Students will not be able to book this slot until it's unsuspended.
                  </span>
                )}
                {suspendDialog.action === 'unsuspend' && (
                  <span className="block mt-3 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                    ✅ Students will be able to book this slot again.
                  </span>
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  className="px-6 py-3 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 order-2 sm:order-1"
                  onClick={() => setSuspendDialog({ open: false, slot: null, action: null })}
                >
                  Cancel
                </button>
                <button 
                  className={`px-6 py-3 rounded-lg text-white font-semibold shadow ${
                    suspendDialog.action === 'suspend' 
                      ? 'bg-amber-600 hover:bg-amber-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  } order-1 sm:order-2`}
                  onClick={handleSuspendConfirmed}
                >
                  {suspendDialog.action === 'suspend' ? 'Suspend Slot' : 'Unsuspend Slot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-200">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-3 text-[#4B2E83]">Remove Student</h3>
              <p className="mb-6 text-gray-700 text-base">
                Are you sure you want to remove{" "}
                <span className="font-semibold text-[#4B2E83]">{confirmDialog.student}</span>{" "}
                from this slot? This action cannot be undone.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  className="px-6 py-3 rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 order-2 sm:order-1"
                  onClick={() => setConfirmDialog({ open: false, student: null, slotId: null })}
                >
                  Cancel
                </button>
                <button 
                  className="px-6 py-3 rounded-lg bg-[#4B2E83] text-white font-semibold shadow hover:bg-[#3a2367] order-1 sm:order-2"
                  onClick={async () => {
                    const { slotId, student } = confirmDialog;
                    setConfirmDialog({ open: false, student: null, slotId: null });
                    try {
                      const dateStr = (new Date()).toISOString().split('T')[0];
                      const resp = await api.deleteBooking(slotId, student, dateStr);
                      if (resp?.success) { 
                        loadSlots(true); 
                        showSnackbar("Student removed!", "success"); 
                      } else {
                        showSnackbar(resp?.message || "Error removing student", "error");
                      }
                    } catch (e) { 
                      showSnackbar(e.message || "Error removing student", "error"); 
                    }
                  }}
                >
                  Remove Student
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar */}
      {snackbar.open && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:transform sm:-translate-x-1/2 sm:top-4 sm:bottom-auto z-50 px-6 py-4 rounded-lg shadow text-white bg-[#4B2E83] text-center">
          {snackbar.message}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;