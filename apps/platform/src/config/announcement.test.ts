import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT, showsAnnouncement } from "./announcement";

/**
 * The banner lives in the `(site)` layout, which wraps the public pages and the
 * signed-in console/account pages. `showsAnnouncement` is the only thing keeping
 * a club-wide notice off the signed-in ones. That includes the sibling-prefix
 * case (`/accounts` is not `/account`) that a bare `startsWith` gets wrong.
 */
describe("showsAnnouncement", () => {
  const publicPaths = [
    "/",
    "/community",
    "/partners",
    "/docs",
    "/docs/platform/airtable-setup",
    "/legal/privacy",
    "/competitions/spring-2026",
  ];

  const appPaths = [
    "/account",
    "/console",
    "/console/permissions",
    "/teams/requests",
    "/tools/oauth",
    "/vote",
    "/vote/some-election",
    "/oauth/consent",
  ];

  it.each(publicPaths)("shows on %s", (pathname) => {
    expect(showsAnnouncement(pathname)).toBe(true);
  });

  it.each(appPaths)("stays off %s", (pathname) => {
    expect(showsAnnouncement(pathname)).toBe(false);
  });

  it("does not mistake a sibling route for a hidden prefix", () => {
    expect(showsAnnouncement("/accounts")).toBe(true);
    expect(showsAnnouncement("/console-log")).toBe(true);
  });

  it("shows when the router has not resolved a pathname yet", () => {
    expect(showsAnnouncement(null)).toBe(true);
  });
});

/**
 * The settings save bar (~/ui/settings-save-bar) is fixed to the bottom of the
 * viewport, where the announcement card also sits. Stacking them hides the one
 * button that saves the form.
 *
 * Route, not z-index, keeps them apart: every page with a save bar is signed in,
 * and `showsAnnouncement` already refuses those. Adding a save bar to a page the
 * notice reaches fails here instead of in someone's browser.
 *
 * Add the route below when you add a `<SettingsSaveBar />` to a page.
 */
describe("the announcement stays off pages with a settings save bar", () => {
  const saveBarPaths = ["/account"];

  it.each(saveBarPaths)("stays off %s", (pathname) => {
    expect(showsAnnouncement(pathname)).toBe(false);
  });
});

describe("ANNOUNCEMENT", () => {
  it("carries an action, since a notice with nothing to do is noise", () => {
    if (!ANNOUNCEMENT) return;
    expect(ANNOUNCEMENT.action.label).not.toBe("");
    expect(ANNOUNCEMENT.action.href).not.toBe("");
  });

  it("keeps the message short enough to stay near the prose measure", () => {
    if (!ANNOUNCEMENT) return;
    expect(ANNOUNCEMENT.message.length).toBeLessThanOrEqual(120);
  });
});
