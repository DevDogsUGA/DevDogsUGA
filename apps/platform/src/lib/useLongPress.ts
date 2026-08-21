"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Fires after a touch is held still on an element and then released, and
 * swallows the click and the context menu that would otherwise follow it.
 *
 * Touch only, by design: a pointer that can hover has the share button
 * revealed to it instead, and stealing right-click from a mouse would take
 * away "copy link address" to replace it with something it already has.
 *
 * The timer only *arms* the press — the callback runs from `pointerup`,
 * because on touch that is the event that grants transient user activation.
 * Fired from the timer, while the finger is still down, `navigator.share`
 * and the clipboard both refuse to act.
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
  /** Set once the press arms, so release fires it and its click is dropped. */
  const armed = useRef(false);

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
      armed.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        armed.current = true;
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
      if (travelled > moveTolerance) {
        armed.current = false;
        cancel();
      }
    },

    onPointerUp() {
      const shouldFire = armed.current;
      cancel();
      // `armed` stays set so onClickCapture can drop the click that follows.
      if (shouldFire) onLongPress();
    },

    onPointerCancel() {
      // No click follows a cancelled pointer, so nothing is left armed.
      armed.current = false;
      cancel();
    },

    // Suppressed for the whole touch press, not just an armed one: Android's
    // own long-press menu races our timer, and losing that race would
    // `pointercancel` the press before it arms. `origin` is only ever set for
    // a non-mouse pointer, so a mouse keeps its native menu.
    onContextMenu(event: React.MouseEvent) {
      if (origin.current !== null || armed.current) event.preventDefault();
    },

    // Captured, not bubbled: the link is a sibling covering the whole tile, so
    // its click has to be caught on the way down to stop the navigation that
    // a long press was deliberately not asking for.
    onClickCapture(event: React.MouseEvent) {
      if (!armed.current) return;
      event.preventDefault();
      event.stopPropagation();
      armed.current = false;
    },
  };
}
