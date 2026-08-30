"use client";

import { useState } from "react";
import { DropdownSearchInput } from "../ui/DropdownSearchInput";

// Create time slots from 8:00 AM to 10:00 PM
const createTimeSlots = () => {
  const times = [];
  for (let hr = 8; hr <= 22; hr++) {
    const hour = hr <= 12 ? hr : hr - 12; // 24hr to 12hr format
    const amPm = hr < 12 ? "AM" : "PM";
    times.push(`${hour}:00 ${amPm}`);
  }
  return times;
};

export function TimeDistanceFilter() {
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [availableEndTimes, setAvailableEndTimes] = useState<string[]>([]);

  const allTimeSlots = createTimeSlots();

  // Picking a start time limits the end times to later slots, and always
  // clears whatever end time was already chosen.
  const handleStartTimeSelect = (value: string) => {
    setStartTime(value);

    if (!value) {
      setAvailableEndTimes([]);
      setEndTime("");
    } else {
      const startIndex = allTimeSlots.indexOf(value);
      const validEndTimes = allTimeSlots.slice(startIndex + 1);
      setAvailableEndTimes(validEndTimes);
      setEndTime("");
    }
  };

  return (
    <div className="contents">
      <DropdownSearchInput
        labelText="Start Time"
        items={allTimeSlots}
        placeholder="Start Time"
        className="border-stone-400"
        onSelect={handleStartTimeSelect}
        selectedItem={startTime}
      />

      <DropdownSearchInput
        labelText="End Time"
        key={startTime} // remounts the input so its filtered list resets
        items={availableEndTimes}
        placeholder={startTime ? "End Time" : "Select Start Time"}
        className="border-stone-400"
        onSelect={(value) => setEndTime(value)}
        selectedItem={endTime}
      />
    </div>
  );
}
