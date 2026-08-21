"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Fires after a touch is held still on an element, and swallows the click and
 * the context menu that would otherwise follow it.
 *
 * Touch only, by design: a pointer that can hover has the share button
 * revealed to it instead, and stealing right-click from a mouse would take
 * away "copy link address" to replace it with something it already has.
 */
export function useLongPress(
  onLongPress: () => void,
  {
    delay = 500,
    moveTolerance = 10,
  }: { delay?: number; moveTolerance?: number } = {},
) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** Set once the press fires, so the click it produces can be dropped. */
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  // A press held while the component unmounts would otherwise fire into a
  // component that is no longer there.
  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown(event: React.PointerEvent) {
      if (event.pointerType === "mouse") return;
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        cancel();
        onLongPress();
      }, delay);
    },

    // A press that travels is a scroll, and the page should keep it.
    onPointerMove(event: React.PointerEvent) {
      const start = origin.current;
      if (!start) return;
      const travelled = Math.hypot(
        event.clientX - start.x,
        event.clientY - start.y,
      );
      if (travelled > moveTolerance) cancel();
    },

    onPointerUp: cancel,
    onPointerCancel: cancel,

    /** Only after our own press — a mouse keeps its native menu. */
    onContextMenu(event: React.MouseEvent) {
      if (fired.current) event.preventDefault();
    },

    // Captured, not bubbled: the link is a sibling covering the whole tile, so
    // its click has to be caught on the way down to stop the navigation that
    // a long press was deliberately not asking for.
    onClickCapture(event: React.MouseEvent) {
      if (!fired.current) return;
      event.preventDefault();
      event.stopPropagation();
      fired.current = false;
    },
  };
}
