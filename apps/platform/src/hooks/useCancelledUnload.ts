"use client";

import { useEffect, useState } from "react";

/**
 * Counts the times the member was asked to confirm leaving the page and chose
 * to stay.
 *
 * Nothing in the platform tells you that. `beforeunload` fires on the way out,
 * but there is no matching event for "actually, never mind" — the page simply
 * carries on, and anything that had already braced for the page to disappear
 * stays braced forever. The link-account buttons are the case that bit: they
 * submit a form whose server action redirects to the OAuth provider, so
 * `useFormStatus` goes pending and is never meant to come back, because the
 * document should be gone. Cancel the departure and the spinner spins for the
 * rest of the session.
 *
 * The read here is a timer scheduled from inside `beforeunload`. Browsers hold
 * the main thread while the confirmation dialog is up, so it cannot run early;
 * if the member leaves, the page is being torn down and it does not matter
 * whether it runs at all. It only lands, meaningfully, when they stayed.
 *
 * Bump a `key` off this to remount whatever was left mid-flight — a remounted
 * form has no pending transition to be stuck in.
 */
export function useCancelledUnload(): number {
  const [cancellations, setCancellations] = useState(0);

  useEffect(() => {
    function handleBeforeUnload() {
      setTimeout(() => setCancellations((n) => n + 1), 0);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return cancellations;
}
