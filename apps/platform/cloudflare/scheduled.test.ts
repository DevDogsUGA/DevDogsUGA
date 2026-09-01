// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, scheduled } from "./scheduled";

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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("continues dispatching sibling routes, then reports failures", async () => {
    const paths = CRON_ROUTES["0 0 * * *"] ?? [];
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      Promise.resolve(
        new Response(null, {
          status: readRequestUrl(input).endsWith("/cron/sandbox-refresh")
            ? 503
            : 200,
        }),
      ),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scheduled(
        { cron: "0 0 * * *" },
        {
          BASE_URL: "https://example.test",
          CRON_SECRET: "secret",
        },
      ),
    ).rejects.toThrow("/cron/sandbox-refresh: HTTP 503");

    expect(fetchMock).toHaveBeenCalledTimes(paths.length);
    expect(
      fetchMock.mock.calls.map(([input]) => readRequestUrl(input)),
    ).toEqual(paths.map((path) => `https://example.test${path}`));
    expect(errorSpy).toHaveBeenCalledWith(
      "cron_dispatch_failed",
      expect.objectContaining({ cron: "0 0 * * *" }),
    );
  });
});

function readRequestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
