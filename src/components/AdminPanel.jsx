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
  const [suspendDialog, setSuspendDialog] = useState({ open: false, slot: null, action: null }); // NEW: Suspend confirmation

  const failuresRef = useRef(0);
  const intervalRef = useRef(null);

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

  // NEW: Open suspend confirmation dialog
  const openSuspendDialog = (slot, action) => {
    setSuspendDialog({ open: true, slot, action });
  };

  // NEW: Handle suspend/unsuspend after confirmation
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
    <div>
      <h2 className="text-2xl font-bold mb-6 text-indigo-900">Admin Dashboard</h2>

      <div className="availability-grid">
        {[...slots].sort((a,b)=>parseInt(a.hour,10)-parseInt(b.hour,10)).map(slot => {
          const students = Array.isArray(slot.students) ? slot.students : [];
          const booked = students.length;
          const capacity = slot.capacity ?? 4;
          const available = Math.max(0, capacity - booked);

          return (
            <div key={slot.id} className={`time-slot p-4 rounded mb-3 ${slot.suspended ? 'opacity-50 bg-gray-100' : 'bg-white'}`}>
              <div className="flex justify-between items-center mb-2">
                <span>{formatRange(slot.hour)}</span>
                <span>{available} left</span>
              </div>

              <ul className="mb-2">
                {students.length > 0 ? students.map((s,i)=>(
                  <li key={i} className="flex justify-between text-sm p-1 bg-gray-50 rounded mb-1">
                    <span>{s}</span>
                    <button
                      onClick={()=>setConfirmDialog({ open:true, student:s, slotId:slot.id })}
                      className="text-red-600"
                    >×</button>
                  </li>
                )) : <li className="text-gray-400 italic">No bookings</li>}
              </ul>

              <div className="flex gap-2 mt-2">
                {/* Suspend / Unsuspend Button */}
                {slot.suspended ? (
                  <button
                    onClick={()=>openSuspendDialog(slot, 'unsuspend')} // Updated to use dialog
                    className="btn px-2 py-1 text-sm bg-yellow-200 text-yellow-800">
                    🔓 Unsuspend
                  </button>
                ) : (
                  <button
                    onClick={()=>openSuspendDialog(slot, 'suspend')} // Updated to use dialog
                    disabled={students.length > 0}
                    className={`btn px-2 py-1 text-sm ${students.length > 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-800'}`}
                    title={students.length > 0 ? "Cannot suspend slot with students" : "Suspend slot"}>
                    🔒 Suspend
                  </button>
                )}

                {/* Add Booking Button */}
                {!slot.suspended && (
                  <button
                    onClick={()=>openModal(slot.id)}
                    disabled={available === 0}
                    className={`btn btn-primary text-sm py-1 px-3 flex-1 ${available===0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    + Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Booking Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Manual Booking</h3>
            <input
              type="text"
              value={studentName}
              onChange={e=>setStudentName(e.target.value)}
              placeholder="Enter name"
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={()=>setModalOpen(false)} className="btn bg-gray-200 text-gray-700 hover:bg-gray-300">Cancel</button>
              <button onClick={handleBooking} disabled={bookingLoading} className="btn btn-primary">
                {bookingLoading ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Suspend Confirmation Modal */}
      {suspendDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-200">
            <h3 className="text-xl font-bold mb-3 text-[#4B2E83]">
              {suspendDialog.action === 'suspend' ? 'Suspend Slot' : 'Unsuspend Slot'}
            </h3>
            <p className="mb-6 text-gray-700">
              Are you sure you want to {suspendDialog.action} the{" "}
              <span className="font-semibold text-[#4B2E83]">
                {formatRange(suspendDialog.slot?.hour)}
              </span>{" "}
              slot?
              {suspendDialog.action === 'suspend' && (
                <span className="block mt-2 text-sm text-amber-600">
                  ⚠️ Students will not be able to book this slot until it's unsuspended.
                </span>
              )}
              {suspendDialog.action === 'unsuspend' && (
                <span className="block mt-2 text-sm text-green-600">
                  ✅ Students will be able to book this slot again.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-4">
              <button 
                className="px-4 py-2 rounded bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
                onClick={() => setSuspendDialog({ open: false, slot: null, action: null })}
              >
                Cancel
              </button>
              <button 
                className={`px-4 py-2 rounded text-white font-semibold shadow ${
                  suspendDialog.action === 'suspend' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                onClick={handleSuspendConfirmed}
              >
                {suspendDialog.action === 'suspend' ? 'Suspend Slot' : 'Unsuspend Slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-200">
            <h3 className="text-xl font-bold mb-3 text-[#4B2E83]">Remove Student</h3>
            <p className="mb-6 text-gray-700">
              Are you sure you want to remove <span className="font-semibold text-[#4B2E83]">{confirmDialog.student}</span> from this slot? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-4">
              <button className="px-4 py-2 rounded bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
                onClick={()=>setConfirmDialog({ open:false, student:null, slotId:null })}>Cancel</button>
              <button className="px-4 py-2 rounded bg-[#4B2E83] text-white font-semibold shadow hover:bg-[#3a2367]"
                onClick={async ()=>{
                  const { slotId, student } = confirmDialog;
                  setConfirmDialog({ open:false, student:null, slotId:null });
                  try {
                    const dateStr = (new Date()).toISOString().split('T')[0];
                    const resp = await api.deleteBooking(slotId, student, dateStr);
                    if(resp?.success){ loadSlots(true); showSnackbar("Student removed!", "success"); }
                    else showSnackbar(resp?.message || "Error removing student","error");
                  } catch(e){ showSnackbar(e.message || "Error removing student","error"); }
                }}>Remove Student</button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar */}
      {snackbar.open && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow text-white bg-[#4B2E83]">
          {snackbar.message}
        </div>
      )}
    </div>
  );
};

export default AdminPanel;