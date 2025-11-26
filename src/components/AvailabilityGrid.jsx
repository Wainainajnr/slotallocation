import React from "react";

const DEFAULT_SLOTS = 4;

const AvailabilityGrid = ({ availability = [], selectedSlot, onSlotSelect, currentStudentName = "" }) => {
  return (
    <div className="availability-grid">
      {[...availability]
        .sort((a, b) => parseInt(a.hour, 10) - parseInt(b.hour, 10))
        .map((slot) => {
          const studentsArr = Array.isArray(slot.students) ? slot.students : slot.bookedStudents || [];
          const booked = typeof slot.booked === 'number' ? slot.booked : studentsArr.length;
          const capacity = slot.capacity ?? DEFAULT_SLOTS;
          const available = Math.max(0, capacity - booked);
          const isSelected = selectedSlot && selectedSlot.hour === slot.hour;
          const isSuspended = slot.suspended === true;
          const isDisabled = available <= 0 || slot.theory || isSuspended;

          const formatRange = (hourStr) => {
            const h = parseInt(hourStr, 10);
            const startH = h % 12 === 0 ? 12 : h % 12;
            const end = (h + 1) % 24;
            const endH = end % 12 === 0 ? 12 : end % 12;
            const startSuffix = h < 12 ? 'am' : 'pm';
            const endSuffix = (h + 1) < 12 || (h + 1) === 24 ? 'am' : 'pm';
            return `${startH}${startSuffix}-${endH}${endSuffix}`;
          };

          // Determine class based on state
          let slotClass = "time-slot";
          if (isSuspended) {
            slotClass += " suspended";
          } else if (slot.theory) {
            slotClass += " theory";
          } else if (available === 0) {
            slotClass += " full";
          } else if (isSelected) {
            slotClass += " selected";
          } else {
            slotClass += " available";
          }

          return (
            <div
              key={slot.hour}
              onClick={() => !isDisabled && onSlotSelect && onSlotSelect(slot)}
              className={slotClass}
            >
              <div className="slot-time">{formatRange(slot.hour)}</div>
              <div className="slot-status">
                {isSuspended ? (
                  <>
                    <span className="suspended-icon">🔒</span> Suspended
                  </>
                ) : slot.theory ? (
                  "Theory Class"
                ) : (
                  `${available} spots left`
                )}
              </div>
              {isSuspended && (
                <div className="suspended-overlay">Suspended</div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default AvailabilityGrid;