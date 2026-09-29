/**
 * The pieces of the "Review in VS Code" round trip that need no React.
 *
 * A docs tab starts a review by opening a `vscode://devdogsuga.workshops/…`
 * link with a `session` it just made. When the review is finished the
 * extension (Backstage apps/workshops-vscode, `handoff.ts`) opens the next
 * step in a new tab at `<docs path>#done=<step tags>&session=<id>`. That new
 * tab records the steps as done, then tells the tab that started the review,
 * over a `BroadcastChannel`, to move on to the same page.
 */

/** Every link to the workshops extension starts here. */
export const VSCODE_LINK_PREFIX = "vscode://devdogsuga.workshops/";

/** The channel the new tab announces on, and the old one listens to. */
export const HANDOFF_CHANNEL = "docs:handoff";

/** Where to get the extension, for the popup after a click. */
export const EXTENSION_URL =
  "https://marketplace.visualstudio.com/items?itemName=devdogsuga.workshops";

/** What the new tab says: this session's review is finished; go to `path`. */
export interface HandoffMessage {
  session: string;
  /** The docs page (path and query, no origin) the review's next step is on. */
  path: string;
}

export function isHandoffMessage(value: unknown): value is HandoffMessage {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as HandoffMessage).session === "string" &&
    typeof (value as HandoffMessage).path === "string" &&
    (value as HandoffMessage).path.startsWith("/") &&
    !(value as HandoffMessage).path.startsWith("//")
  );
}

/** `#done=<tag>,<tag>&session=<id>`, or null when the hash isn't one. */
export function parseHandoff(
  hash: string,
): { done: string[]; session: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const done = params.get("done");
  const session = params.get("session");
  if (!done || !session) return null;
  return { done: done.split(",").filter(Boolean), session };
}

/** The link with this tab's session on it, replacing any it had. */
export function withSession(href: string, session: string): string {
  return `${href.replace(/&session=[^&#]*/, "")}&session=${encodeURIComponent(session)}`;
}

// The session of the review this tab last started. In memory only: a reload
// forgets it, which just means the tab isn't moved on afterwards.
let tabSession: string | null = null;

export function rememberSession(session: string): void {
  tabSession = session;
}

export function currentSession(): string | null {
  return tabSession;
}

/** A fresh id for a click, or null where the browser can't make one. */
export function newSession(): string | null {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : null;
}
