/**
 * Whether the directions dialog's URL was reached by a client-side navigation
 * from inside the app, rather than by a fresh document load.
 *
 * This is module state on purpose: a full page load re-evaluates the module and
 * resets the flag, which is exactly the distinction {@link RouteDialog} needs
 * when it closes. Opened from the events page, there is a history entry of ours
 * behind the dialog and `router.back()` removes it; landed on directly — a
 * shared link, a refresh — there is not, and `back()` would leave the site.
 *
 * Client-only, and only ever set from a `<Link>`'s `onNavigate`, which fires
 * for client-side navigations and not for the cases the browser handles itself
 * (a middle click, a new tab) — those really are fresh loads.
 */
let inApp = false;

export const markOpenedInApp = () => {
  inApp = true;
};

export const openedInApp = () => inApp;
