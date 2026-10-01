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

export const DISMISSED_ATTRIBUTE = "data-attendance-banner";

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

/**
 * Runs while the document is still parsing, ahead of the strip's markup, and
 * stamps `<html data-attendance-banner="dismissed">` when this session already
 * dismissed this meeting. `globals.css` hides the strip on that attribute, so
 * a reload never paints it. Reading storage from an effect would paint the
 * strip and rip it out a frame later.
 *
 * Rendered by the server island, not the client component: a `<script>` in a
 * client component is only real in the server HTML, and the island's HTML is
 * the only place this needs to run. See ~/config/announcement.
 */
export function dismissalScript(meetingId: string): string {
  return `try{if(sessionStorage.getItem(${JSON.stringify(
    dismissalKey(meetingId),
  )})==="dismissed")document.documentElement.setAttribute(${JSON.stringify(
    DISMISSED_ATTRIBUTE,
  )},"dismissed")}catch(e){}`;
}
