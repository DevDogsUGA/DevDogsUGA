// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_ROUTES } from "./scheduled";

/**
 * Every cron path must correspond to a route that exists.
 *
 * The dispatcher was silently wrong. Every entry was written as
 * `/api/cron/...`, but the handlers live under `src/app/(api)/`, and
 * parentheses make a route group: the segment does not appear in the URL. So
 * `/api/cron/judging-start` returned 404 while `/cron/judging-start` served
 * 200, and had done since the Vercel-to-Cloudflare move that carried the paths
 * over from `vercel.json` unchanged.
 *
 * The dispatcher swallows non-2xx responses, so the crons failed quietly: no
 * tally, no judging freeze, no Airtable sync, no GitHub reconcile.
 * Typechecking cannot see it, because a path is just a string. Mapping the
 * string back to a file is the only check that would have.
 */

const APP = join(import.meta.dirname, "..", "src", "app");

/**
 * A URL path to the route file that serves it.
 *
 * Route groups are directories wrapped in parentheses and contribute nothing to
 * the URL, so a path can be served from any of them. Trying each group rather
 * than hardcoding `(api)` keeps the test correct if a route moves, and is
 * exactly the mapping the dispatcher gets wrong by hand.
 */
function routeExists(urlPath: string): boolean {
  const GROUPS = ["(api)", "(site)", ""];
  return GROUPS.some((group) =>
    existsSync(join(APP, group, urlPath, "route.ts")),
  );
}

describe("cron dispatcher", () => {
  const entries = Object.entries(CRON_ROUTES).flatMap(([cron, paths]) =>
    paths.map((path) => ({ cron, path })),
  );

  it("dispatches at least one route", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("$path exists (fired by $cron)", ({ path }) => {
    expect(routeExists(path)).toBe(true);
  });

  it("never prefixes a path with the route group", () => {
    // The specific mistake, named. `(api)` is a group; `/api` is a URL segment,
    // and there is no directory that produces one.
    for (const { path } of entries) {
      expect(path.startsWith("/api/")).toBe(false);
    }
  });
});
