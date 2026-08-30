/**
 * Which link clicks a dirty form is allowed to swallow.
 *
 * `useUnsavedChangesWarning` only covers leaving the document: reloads, closes,
 * typing a new address. A click on a `<Link>` never touches the document. The
 * router swaps the tree, the account page unmounts, and every unsaved edit goes
 * with it silently. (`cacheComponents` is off in this app on purpose, so there
 * is no Activity boundary quietly preserving that state.)
 *
 * Next's documented answer is `<Link onNavigate>` plus a context, which means
 * replacing every Link in the app with a wrapper and losing the guard anywhere
 * one is missed. A capture-phase listener on the document catches all of them,
 * including plain `<a>` and anything a third-party component renders, without
 * touching a single call site.
 *
 * The cost of that reach is that this has to be careful about what it takes.
 * Anything below that returns false is a click the member expects to work while
 * the form stays where it is, so swallowing it would be a bug of its own.
 */

export interface NavigationIntent {
  /** The anchor's resolved, absolute href. */
  href: string;
  /** The anchor's `target`, if any. */
  target: string | null;
  /** Whether the anchor carries a `download` attribute. */
  hasDownload: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Whether this click is an in-app navigation a dirty form should hold back.
 *
 * @param intent  the click, flattened
 * @param current the page the form is on, as an absolute URL
 */
export function shouldInterceptNavigation(
  intent: NavigationIntent,
  current: string,
): boolean {
  // Middle-click and right-click do not navigate this tab.
  if (intent.button !== 0) return false;

  // Every one of these opens somewhere else: a new tab, a new window, a file
  // on disk. This document, and the form on it, stays put.
  if (
    intent.metaKey ||
    intent.ctrlKey ||
    intent.shiftKey ||
    intent.altKey ||
    intent.hasDownload
  ) {
    return false;
  }
  if (intent.target && intent.target !== "_self") return false;

  let target: URL;
  let here: URL;
  try {
    target = new URL(intent.href, current);
    here = new URL(current);
  } catch {
    return false;
  }

  // A different origin is a real document unload, which `beforeunload` already
  // covers with the browser's own prompt. Blocking it here would replace a
  // warning the member can accept with a wall they cannot.
  if (target.origin !== here.origin) return false;

  // Anchors and query-identical links re-render the same page; the form is not
  // going anywhere, so let them through.
  if (target.pathname === here.pathname && target.search === here.search) {
    return false;
  }

  return true;
}
