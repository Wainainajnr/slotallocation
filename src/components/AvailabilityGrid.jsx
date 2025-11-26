import React from "react";

const DEFAULT_SLOTS = 4;

const AvailabilityGrid = ({ availability = [], selectedSlot, onSlotSelect, currentStudentName = "" }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {[...availability]
        .sort((a, b) => parseInt(a.hour, 10) - parseInt(b.hour, 10))
        .map((slot) => {
        const studentsArr = Array.isArray(slot.students) ? slot.students : slot.bookedStudents || [];
        const booked = typeof slot.booked === 'number' ? slot.booked : studentsArr.length;
        const capacity = slot.capacity ?? DEFAULT_SLOTS;
        const available = Math.max(0, capacity - booked);
        const isSelected = selectedSlot && selectedSlot.hour === slot.hour;
        const isDisabled = available <= 0 || slot.theory;

        const formatRange = (hourStr) => {
          const h = parseInt(hourStr, 10);
          const startH = h % 12 === 0 ? 12 : h % 12;
          const end = (h + 1) % 24;
          const endH = end % 12 === 0 ? 12 : end % 12;
          const startSuffix = h < 12 ? 'am' : 'pm';
          const endSuffix = (h + 1) < 12 || (h + 1) === 24 ? 'am' : 'pm';
          return `${startH}${startSuffix}-${endH}${endSuffix}`;
        };

        return (
          <button
            key={slot.hour}
            onClick={() => !isDisabled && onSlotSelect && onSlotSelect(slot)}
            disabled={isDisabled}
            className={
              `flex flex-col items-center justify-between p-4 rounded-xl border-2 text-center transition-colors duration-150 ` +
              (isSelected
                ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                : 'border-indigo-100 bg-white hover:bg-indigo-50') +
              (isDisabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')
            }
          >
            <div className="w-full">
              <div className="text-2xl font-semibold text-gray-800">{formatRange(slot.hour)}</div>
              <div className="text-sm text-indigo-600 mt-1">{available} of {capacity} spots</div>
            </div>
            <div className="w-full mt-3 text-xs text-gray-500">{booked}/{capacity} booked</div>
          </button>
        );
      })}
    </div>
  );
};

export default AvailabilityGrid;
