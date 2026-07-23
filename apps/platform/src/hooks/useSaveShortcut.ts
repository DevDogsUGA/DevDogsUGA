"use client";

import { useEffect, useRef, useState, type FocusEvent } from "react";

// Tracks focus within a wrapper element and triggers `onSave` on Ctrl/Cmd+S
// while focus is inside it. Spread `onFocus`/`onBlur` onto that wrapper.
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const [focused, setFocused] = useState(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!focused || !enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focused, enabled]);

  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setFocused(false);
      }
    },
  };
}
