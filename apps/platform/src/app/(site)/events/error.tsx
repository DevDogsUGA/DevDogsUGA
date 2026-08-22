"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import EventsUnavailable from "~/components/EventsSection/EventsUnavailable";

/**
 * The events segment's boundary, for `page.tsx` and the routes below it — a
 * meeting's dialog, mainly.
 *
 * It deliberately does NOT cover the schedule. `error.js` does not wrap the
 * `layout.js` above it in the same segment, and the schedule is rendered by
 * that layout so it stays mounted behind the dialogs. The layout catches its
 * own read and renders the same fallback; see {@link EventsUnavailable}.
 */
export default function EventsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // A Server Component's error reaches the client already stripped of its
    // message, so this logs the placeholder plus the digest rather than
    // anything sensitive — and it is the only record of the failure on the
    // visitor's side when they screenshot the console for us.
    console.error(error);
  }, [error]);

  return <EventsUnavailable digest={error.digest} retry={retry} />;
}
