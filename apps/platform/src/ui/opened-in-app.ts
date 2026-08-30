/**
 * Whether the current route-dialog URL was reached by a client-side navigation
 * from inside the app, rather than by a fresh document load.
 *
 * This is module state on purpose. A full page load re-evaluates the module and
 * resets the flag, which is the distinction {@link RouteDialog} needs when it
 * closes. Opened from the page behind it, there is a history entry of ours
 * behind the dialog and `router.back()` removes it. Landed on directly, from a
 * shared link or a refresh, there is not, and `back()` would leave the site.
 *
 * One flag, shared by every route dialog, is correct rather than a shortcut.
 * The question it answers is about the *document*, "did this tab start here?",
 * not about which dialog is open, and only one route dialog can be open at a
 * time anyway since each one is a route. Keying it per dialog would still
 * answer the same for both: after a cold load every key is false, after any
 * in-app navigation the one that matters is true.
 *
 * Client-only, and only ever set from a `<Link>`'s `onNavigate` (see
 * {@link RouteDialogLink}), which fires for client-side navigations and not for
 * the cases the browser handles itself. A middle click or a new tab really is a
 * fresh load.
 */
let inApp = false;

export const markOpenedInApp = () => {
  inApp = true;
};

export const openedInApp = () => inApp;
