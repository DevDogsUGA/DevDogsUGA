import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_CARDS } from "@devdogsuga/og";

/**
 * "Every page gets a link card, except the access-gated ones."
 *
 * That rule is only worth stating if something enforces it, and the enforcement
 * has to survive somebody adding a page months from now. `sitemap.ts` already
 * holds the club's answer to which URLs are public — it was worked out against
 * the auth guards and the `robots: { index: false }` exports, and the console,
 * the ballots, the team rosters and the account page are all absent from it for
 * that reason. So the rule here is: the static half of the sitemap and the
 * cards in `PAGE_CARDS` are the same set of routes, and each one has a file.
 *
 * The sitemap is read as SOURCE rather than imported. Importing it pulls in
 * `~/env` and the database loaders, so a test about which files exist would
 * start needing a configured environment to answer.
 */
// Resolved from the working directory rather than `import.meta.url`: these
// tests run in the jsdom environment the app's Vitest preset sets, where
// `import.meta.url` is not a `file:` URL and `fileURLToPath` throws. Vitest
// runs each project from its own package root.
const appDir = resolve(process.cwd(), "src/app");
const sitemapSource = readFileSync(resolve(appDir, "sitemap.ts"), "utf8");

/** The routes in `STATIC_ROUTES`, which is the authored, database-free half. */
function sitemapStaticRoutes(): string[] {
  const block = /const STATIC_ROUTES[\s\S]*?\n\];/.exec(sitemapSource);
  if (!block) throw new Error("sitemap.ts no longer declares STATIC_ROUTES");

  return [...block[0].matchAll(/url\("([^"]*)"\)/g)].map(([, route]) => route!);
}

/**
 * Where Next looks for a route's card.
 *
 * `(site)` is a route group and contributes nothing to the URL, so every page
 * below it lives one directory deeper than its path suggests. `/` is the root
 * segment's own card and sits above the group.
 */
function imagePath(route: string): string {
  return route === "/"
    ? `${appDir}/opengraph-image.tsx`
    : `${appDir}/(site)${route}/opengraph-image.tsx`;
}

describe("Open Graph cards", () => {
  const routes = sitemapStaticRoutes();

  it("covers every public route the sitemap publishes", () => {
    expect([...routes].sort()).toEqual(Object.keys(PAGE_CARDS).sort());
  });

  it.each(routes)("has an opengraph-image.tsx for %s", (route) => {
    expect(existsSync(imagePath(route))).toBe(true);
  });

  it.each(routes)("gives %s a title and a description", (route) => {
    const copy = PAGE_CARDS[route];
    expect(copy?.title).toBeTruthy();
    expect(copy?.description).toBeTruthy();
  });

  /**
   * The card clamps rather than shrinks, so copy that overruns is cropped
   * instead of resized. These bounds are where `PageCard`'s largest type still
   * fits inside the frame; past them the description runs under the footer.
   */
  it.each(routes)("keeps %s's copy inside the card", (route) => {
    const copy = PAGE_CARDS[route]!;
    expect(copy.title.length).toBeLessThanOrEqual(56);
    expect(copy.description.length).toBeLessThanOrEqual(180);
  });
});
