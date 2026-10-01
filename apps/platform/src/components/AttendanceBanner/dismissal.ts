/**
 * Per-meeting dismissal of the "Check in now" strip, remembered for the tab's
 * session. Session storage, so the reminder returns the next time the tab is
 * opened, scoped to the meeting, so a later meeting is never silenced by an
 * earlier dismissal.
 *
 * Storage is optional (private modes and locked-down embeds throw on access),
 * so a dismissal is also held in memory. That keeps it sticky across client
 * navigations without storage; only a reload forgets it there.
 */

const memory = new Set<string>();
const listeners = new Set<() => void>();

export function dismissalKey(meetingId: string): string {
  return `devdogs:attendance-banner:${meetingId}`;
}

export function isDismissed(meetingId: string): boolean {
  if (memory.has(meetingId)) return true;
  try {
    return sessionStorage.getItem(dismissalKey(meetingId)) === "dismissed";
  } catch {
    return false;
  }
}

export function dismiss(meetingId: string): void {
  memory.add(meetingId);
  try {
    sessionStorage.setItem(dismissalKey(meetingId), "dismissed");
  } catch {
    // Held in memory above; a reload without storage brings it back.
  }
  for (const listener of listeners) listener();
}

export function subscribeToDismissal(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
