import type { ErrorEvent, EventHint } from "@sentry/core";

/**
 * Drops known browser noise before it becomes a Sentry issue. Deliberately a
 * short, documented list rather than a general noise-suppression system —
 * every entry here is a specific, previously-seen false positive, not a
 * guess.
 */
const NOISY_FRAME_SUBSTRINGS = [
  // Browser extensions and ad blockers injecting/patching scripts into the
  // page. Errors thrown from code we did not ship and cannot fix.
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
];

const NOISY_MESSAGE_SUBSTRINGS = [
  // React hydration mismatches that are pure duplicates of a mismatch React
  // itself already reports through its own overlay/console warning in dev,
  // and that carry no more information as a second Sentry issue in prod.
  "Hydration failed because the initial UI does not match",
  "There was an error while hydrating",
];

function frameIsNoisy(filename: string | undefined): boolean {
  if (!filename) return false;
  return NOISY_FRAME_SUBSTRINGS.some((needle) => filename.includes(needle));
}

function messageIsNoisy(message: string | undefined): boolean {
  if (!message) return false;
  return NOISY_MESSAGE_SUBSTRINGS.some((needle) => message.includes(needle));
}

/** True if `event` matches a known extension/ad-blocker or hydration-noise pattern. */
export function isBrowserNoiseEvent(event: ErrorEvent): boolean {
  if (messageIsNoisy(event.message)) return true;

  for (const exception of event.exception?.values ?? []) {
    if (messageIsNoisy(exception.value)) return true;
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frameIsNoisy(frame.filename) || frameIsNoisy(frame.abs_path)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * A `beforeSend`-shaped filter: returns `null` (drop) for known browser
 * noise, otherwise passes the event through unchanged. Browser-only —
 * nothing here reads a browser global, so it is safe to import from a
 * server bundle, but there is nothing server-side for it to catch either.
 */
export function browserNoiseFilter(
  event: ErrorEvent,
  _hint?: EventHint,
): ErrorEvent | null {
  return isBrowserNoiseEvent(event) ? null : event;
}
