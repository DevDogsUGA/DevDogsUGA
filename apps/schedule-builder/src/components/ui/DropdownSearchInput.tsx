"use client";

import React, { useState, useEffect, useRef } from "react";

interface searchFilterProps {
  labelText?: string;
  name?: string;
  items?: string[];
  type?: string;
  placeholder?: string;
  className?: string;
  clearState?: boolean;
  selectedItem?: string | undefined;
  onSelect?: (selectedItem: string) => void;
}

export const DropdownSearchInput = ({
  name = "",
  items = [],
  type = "text",
  placeholder = "",
  className = "",
  clearState,
  selectedItem,
  onSelect,
  labelText,
}: searchFilterProps) => {
  const dropdownRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filteredData, setFilteredData] = useState<string[]>(items);

  useEffect(() => {
    if (selectedItem !== undefined) {
      // Intentional: mirror the controlled `selectedItem` prop into the query.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(selectedItem);
    }
  }, [selectedItem]);

  const handleQuery = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.currentTarget.value);
    const regex = new RegExp("^" + e.currentTarget.value, "i");
    const filter = items.filter((item) => regex.test(item));
    setFilteredData(filter);
  };

  const handleClick = (e: React.MouseEvent) => {
    const selectedValue = e.currentTarget.textContent ?? "";
    setQuery(selectedValue);
    setIsOpen((prev) => !prev);
    if (onSelect) {
      onSelect(selectedValue);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const activeItem = document.activeElement;
      if (activeItem?.textContent) {
        const selectedValue = activeItem.textContent;
        setQuery(selectedValue);
        if (onSelect) {
          onSelect(selectedValue);
        }
      }
      setIsOpen((prev) => !prev);
    }
  };

  // Close the dropdown when a click lands outside it.
  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleClose);
    };
  }, [isOpen]);

  useEffect(() => {
    if (clearState && query !== "") {
      // Intentional: clear the input when the parent form raises `clearState`.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
    }
  }, [clearState, query]);

  return (
    <div className={`relative w-full min-w-32`}>
      <label className="flex flex-col gap-0.5">
        {labelText && <span className="font-bold">{labelText}</span>}
        <input
          name={name}
          value={query}
          type={type}
          min={0}
          onChange={handleQuery}
          onClick={() => setIsOpen((prev) => !prev)}
          placeholder={placeholder}
          className={`w-full rounded-md border-2 p-2 outline-none hover:border-stone-400 ${className}`}
          autoComplete="off"
          onKeyDown={handleKeyPress}
        />
      </label>
      {isOpen && filteredData.length !== 0 && (
        <ul
          ref={dropdownRef}
          className={`absolute max-h-52 w-full overflow-y-scroll scroll-smooth rounded-md border-2 bg-white ${className} z-10 px-[0]`}
        >
          {filteredData.map((item, index) => (
            <li
              key={index}
              onClick={(e) => handleClick(e)}
              className="bg-inherit px-2 py-1 hover:brightness-75"
              tabIndex={0}
              onKeyDown={handleKeyPress}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
