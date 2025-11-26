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

  return (
    <div className="bg-white p-6 rounded-2xl shadow max-w-5xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-6">⚙️ Admin View</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
                className="flex flex-col justify-between p-4 rounded-xl border-2 bg-white"
                style={{ borderColor: booked > 0 ? '#c7d2fe' : '#eef2ff' }}
              >
                <div>
                  <div className="text-xl font-semibold text-gray-800">{formatRange(slot.hour)}</div>
                  <div className="text-sm text-indigo-600 mt-1">{available} of {capacity} spots</div>
                  {students.length > 0 && (
                    <div className="mt-3 text-xs text-gray-700 max-h-20 overflow-y-auto">
                      <strong>Students:</strong>
                      <ul className="list-disc list-inside">
                        {students.map((s, i) => (
                          <li key={i} className="flex items-center justify-between">
                            <span>{s}</span>
                            <button
                              onClick={async () => {
                                const confirmDel = window.confirm(`Remove ${s} from ${formatRange(slot.hour)}?`);
                                if (!confirmDel) return;
                                try {
                                  const dateStr = (new Date()).toISOString().split('T')[0];
                                  const resp = await api.deleteBooking(slot.hour || slot.id, s, dateStr);
                                  if (resp && resp.success) {
                                    alert(`Removed ${s}`);
                                    setSlots(resp.slots || []);
                                  } else {
                                    const serverMsg = resp?.message || (resp?.body && resp.body.message) || 'Failed to remove student';
                                    console.warn('Delete response:', resp);
                                    alert(serverMsg);
                                  }
                                } catch (err) {
                                  console.error('Delete student error', err);
                                  // Try to surface useful message from API wrapper
                                  const msg = err?.body?.message || err?.message || 'Error removing student';
                                  alert(msg);
                                }
                              }}
                              className="ml-3 text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                  <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">{booked}/{capacity} booked</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openModal(slot.hour ?? slot.id)}
                      disabled={available === 0}
                      className={`px-4 py-2 rounded-lg text-white ${
                        available === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      Book
                    </button>
                    <button
                      onClick={async () => {
                        const studentsList = students;
                        if (!studentsList || studentsList.length === 0) {
                          alert('No students to remove for this slot');
                          return;
                        }
                        let target = null;
                        if (studentsList.length === 1) {
                          const confirmDel = window.confirm(`Remove ${studentsList[0]} from ${formatRange(slot.hour)}?`);
                          if (!confirmDel) return;
                          target = studentsList[0];
                        } else {
                          const choice = window.prompt(`Multiple students found. Type the exact name to remove:\n${studentsList.join('\n')}`);
                          if (!choice) return;
                          const match = studentsList.find(s => s === choice.trim());
                          if (!match) {
                            alert('Name not found in this slot');
                            return;
                          }
                          const confirmDel = window.confirm(`Remove ${match} from ${formatRange(slot.hour)}?`);
                          if (!confirmDel) return;
                          target = match;
                        }

                        try {
                          const dateStr = (new Date()).toISOString().split('T')[0];
                          const resp = await api.deleteBooking(slot.hour || slot.id, target, dateStr);
                          if (resp && resp.success) {
                            alert(`Removed ${target}`);
                            setSlots(resp.slots || []);
                          } else {
                            const serverMsg = resp?.message || (resp?.body && resp.body.message) || 'Failed to remove student';
                            console.warn('Delete response:', resp);
                            alert(serverMsg);
                          }
                        } catch (err) {
                          console.error('Delete student error', err);
                          const msg = err?.body?.message || err?.message || 'Error removing student';
                          alert(msg);
                        }
                      }}
                      className="px-3 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">
              Book Student for {formatRange((slots.find(s => String(s.hour) === String(selectedSlotId) || String(s.id) === String(selectedSlotId)) || {}).hour)}
            </h3>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Student Name"
              className="w-full border-2 border-indigo-100 rounded-xl p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded bg-gray-400 text-white">
                Cancel
              </button>
              <button
                onClick={handleBooking}
                disabled={bookingLoading}
                className={`px-4 py-2 rounded-lg text-white ${bookingLoading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {bookingLoading ? "Booking..." : "Book"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;