// File: c:\driving-school-booking\src\components\AdminPanel.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api.js";

const AdminPanel = () => {
  const [slots, setSlots] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  const failuresRef = useRef(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    loadSlots();
    intervalRef.current = setInterval(() => {
      if (failuresRef.current >= 3) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      loadSlots();
    }, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const loadSlots = async () => {
    try {
      const data = await api.getSlots();
      setSlots(data);
      failuresRef.current = 0;
    } catch (err) {
      console.error("Error loading slots", err);
      failuresRef.current = (failuresRef.current || 0) + 1;
      if (err?.status === 431) {
        alert('Request headers too large (431). Clear cookies or use an incognito window.');
      } else {
        alert("Failed to load slots from server");
      }
    }
  };

  const openModal = (slotId) => {
    setSelectedSlotId(slotId);
    setStudentName("");
    setModalOpen(true);
  };

  const handleBooking = async () => {
    if (!studentName.trim()) return;
    setBookingLoading(true);
    try {
      const result = await api.bookSlot(selectedSlotId, studentName.trim());
      if (result.success) {
        setModalOpen(false);
        loadSlots(); // refresh slots
        alert("Student booked successfully!");
      } else {
        alert(result.message || "Failed to book student");
      }
    } catch (err) {
      console.error(err);
      if (err?.status === 431) {
        alert('Request headers too large (431). Clear cookies or use an incognito window.');
      } else {
        alert("Error booking student");
      }
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

  // Calculate stats
  const totalSlots = slots.reduce((acc, slot) => acc + (slot.capacity ?? 4), 0);
  const totalBooked = slots.reduce((acc, slot) => {
    const students = Array.isArray(slot.students) ? slot.students : [];
    const booked = typeof slot.booked === 'number' ? slot.booked : students.length;
    return acc + booked;
  }, 0);
  const totalAvailable = Math.max(0, totalSlots - totalBooked);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-indigo-900">Admin Dashboard</h2>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
          <h3 className="text-indigo-100 text-sm font-semibold uppercase tracking-wider">Total Bookings</h3>
          <p className="text-4xl font-bold mt-2">{totalBooked}</p>
          <p className="text-indigo-200 text-sm mt-1">Students scheduled</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <h3 className="text-green-100 text-sm font-semibold uppercase tracking-wider">Available Slots</h3>
          <p className="text-4xl font-bold mt-2">{totalAvailable}</p>
          <p className="text-green-200 text-sm mt-1">Open for booking</p>
        </div>

        <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-6 text-white shadow-lg">
          <h3 className="text-gray-300 text-sm font-semibold uppercase tracking-wider">Total Capacity</h3>
          <p className="text-4xl font-bold mt-2">{totalSlots}</p>
          <p className="text-gray-400 text-sm mt-1">Daily maximum</p>
        </div>
      </div>

      <div className="availability-grid">
        {[...slots]
          .sort((a, b) => parseInt(a.hour, 10) - parseInt(b.hour, 10))
          .map((slot) => {
            const students = Array.isArray(slot.students) ? slot.students : [];
            const booked = typeof slot.booked === 'number' ? slot.booked : students.length;
            const capacity = slot.capacity ?? 4;
            const available = Math.max(0, capacity - booked);

            return (
              <div
                key={slot.hour ?? slot.id}
                className="time-slot text-left h-auto min-h-[200px] flex flex-col"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="slot-time text-lg">{formatRange(slot.hour)}</div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${available === 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {available} left
                  </span>
                </div>

                <div className="flex-grow">
                  {students.length > 0 ? (
                    <ul className="text-sm space-y-1 mb-3">
                      {students.map((s, i) => (
                        <li key={i} className="flex items-center justify-between bg-gray-50 p-1 rounded">
                          <span className="truncate mr-2">{s}</span>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Remove ${s}?`)) return;
                              try {
                                const dateStr = (new Date()).toISOString().split('T')[0];
                                const resp = await api.deleteBooking(slot.hour || slot.id, s, dateStr);
                                if (resp && resp.success) setSlots(resp.slots || []);
                              } catch (e) { alert(e.message); }
                            }}
                            className="text-red-600 hover:text-red-800 font-bold px-1"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic mb-3">No bookings</p>
                  )}
                </div>

                <div className="mt-auto pt-3 border-t border-gray-100 flex gap-2">
                  {slot.suspended ? (
                    <button
                      onClick={async () => {
                        try {
                          await api.suspendSlot(slot.hour ?? slot.id, 'unsuspend');
                          loadSlots();
                        } catch (e) { alert(e.message); }
                      }}
                      className="btn bg-yellow-100 text-yellow-800 hover:bg-yellow-200 text-sm py-1 px-3 flex-1"
                    >
                      🔓 Unsuspend
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Suspend this slot? No one will be able to book.')) return;
                          try {
                            await api.suspendSlot(slot.hour ?? slot.id, 'suspend');
                            loadSlots();
                          } catch (e) { alert(e.message); }
                        }}
                        className="btn bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm py-1 px-3"
                        title="Suspend Slot"
                      >
                        🔒
                      </button>
                      <button
                        onClick={() => openModal(slot.hour ?? slot.id)}
                        disabled={available === 0}
                        className={`btn btn-primary text-sm py-1 px-3 flex-1 ${available === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        + Add
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              Manual Booking
            </h3>
            <div className="form-group">
              <label>Student Name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter name"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="btn bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleBooking}
                disabled={bookingLoading}
                className="btn btn-primary"
              >
                {bookingLoading ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;