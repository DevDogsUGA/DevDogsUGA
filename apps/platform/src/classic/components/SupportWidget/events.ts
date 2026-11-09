/**
 * Opens the support widget from anywhere on the site (the Cmd-K "Get help"
 * entry, a docs page's "Ask in Discord" link). A window event rather than
 * context: the widget mounts once in the site layout and the callers are
 * scattered across trees that share no provider with it.
 */
export const OPEN_SUPPORT_EVENT = "devdogs:open-support";

export function openSupport(): void {
  window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT));
}
