import Image from "next/image";
import React, { useEffect, useState } from "react";
import ToggleButton from "./ToggleButton";

interface TimeselectorProps {
  name?: string;
  clearState?: boolean;
  className?: string;
}

const Timeselector = ({
  name = "",
  clearState,
  className,
}: TimeselectorProps) => {
  const [value, setValue] = useState("");
  const [meridian, setMeridian] = useState("AM");
  const formatInput = (input: string) => {
    const isColon = input.trim().endsWith(":");
    const inputValue = input.replace(/[^0-9]/g, "").slice(0, 4);

    let formattedValue =
      inputValue.length > 2
        ? `${inputValue.slice(0, 2)}:${inputValue.slice(2)}`
        : inputValue;
    // A colon typed after two digits survives the digit-only strip above.
    if (isColon && formattedValue.length === 2) {
      formattedValue = formattedValue + ":";
    }

    return formattedValue;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(formatInput(e.target.value));
  };

  const changeMeridian = (e: React.MouseEvent<HTMLButtonElement>) => {
    const text = e.currentTarget.textContent === "AM" ? "PM" : "AM";
    if (text) {
      setMeridian(text);
    }
  };

  // Space pads the hour to two digits and adds the colon, so the next
  // keystroke lands in the minutes.
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      if (value.length >= 1 && value.length < 3) {
        setValue(value.padStart(2, "0") + ":");
      }
    }
  };

  useEffect(() => {
    if (clearState) {
      // Intentional: reset the input + meridian when the parent survey raises
      // its `clearState` reset signal.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue("");
      setMeridian("AM");
    }
  }, [clearState]);

  return (
    <div className="relative">
      <input
        value={value}
        placeholder={"00:00"}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        maxLength={5}
        className={`w-full rounded-md border-2 px-12 py-2 outline-0 hover:border-stone-400 ${className}`}
      />
      {/* FormData reads the combined value and meridian from this hidden input. */}
      <input
        title="time input"
        type="text"
        value={`${value ? value : "0:00"} ${meridian}`}
        name={name}
        className="hidden"
        readOnly
      />
      <Image
        src="./images/timeIcon.svg"
        alt="time icon"
        width={20}
        height={20}
        className="absolute top-3 left-4"
        draggable="false"
      />
      <ToggleButton
        text="AM"
        toggledText="PM"
        untoggledStyle="opacity-35 hover:opacity-100"
        toggledStyle="opacity-100 hover:opacity-50 text-red-700"
        className="absolute -top-1.5 right-0 border-none bg-transparent p-4 hover:bg-transparent"
        onClick={changeMeridian}
        clearState={clearState}
      />
    </div>
  );
};

export default Timeselector;
