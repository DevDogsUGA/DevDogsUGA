// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, scheduled } from "./scheduled";
import { isHeartbeatJob } from "~/server/heartbeats/jobs";

/**
 * Every cron path must correspond to a route that exists.
 *
 * The dispatcher was silently wrong. Every entry was written as
 * `/api/cron/...`, but the handlers live under `src/app/(api)/`, and
 * parentheses make a route group: the segment does not appear in the URL. So
 * `/api/cron/config-reconcile` returned 404 while `/cron/config-reconcile`
 * served 200, and had done since the Vercel-to-Cloudflare move that carried
 * the paths over from `vercel.json` unchanged.
 *
 * The dispatcher swallows non-2xx responses, so the crons failed quietly: no
 * config reconcile, no role sync. Typechecking cannot see it, because
 * a path is just a string. Mapping the string back to a file is the only
 * check that would have.
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
    existsSync(join(APP, group, urlPath.split("?")[0]!, "route.ts")),
  );
}

describe("cron dispatcher", () => {
  const entries = Object.entries(CRON_ROUTES).flatMap(([cron, entry]) =>
    entry.routes.map((path) => ({ cron, path })),
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
    // The group with the most routes, because the point is that a failure in
    // one of them does not starve the ones after it.
    const paths = CRON_ROUTES["*/15 * * * *"]?.routes ?? [];
    expect(paths.length).toBeGreaterThan(1);
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      Promise.resolve(
        new Response(null, {
          status: readRequestUrl(input).endsWith("/cron/support") ? 503 : 200,
        }),
      ),
    );
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scheduled(
        { cron: "*/15 * * * *" },
        {
          BASE_URL: "https://example.test",
          CRON_SECRET: "secret",
        },
      ),
    ).rejects.toThrow("/cron/support: HTTP 503");

    expect(fetchMock).toHaveBeenCalledTimes(paths.length);
    expect(
      fetchMock.mock.calls.map(([input]) => readRequestUrl(input)),
    ).toEqual(paths.map((path) => `https://example.test${path}`));
    expect(errorSpy).toHaveBeenCalledWith(
      "cron_dispatch_failed",
      expect.objectContaining({ cron: "*/15 * * * *" }),
    );
  });

  it("registers the daily commit sweep and its lightweight continuation", () => {
    expect(CRON_ROUTES["10 5 * * *"]?.routes).toEqual([
      "/cron/project-commits",
    ]);
    expect(CRON_ROUTES["*/15 * * * *"]?.routes).toContain(
      "/cron/project-commits?continue=1",
    );
    // The sync records its own heartbeat when a whole cycle completes.
    expect(CRON_ROUTES["10 5 * * *"]?.heartbeat).toBeUndefined();
    expect(isHeartbeatJob("platform-commit-sync")).toBe(true);
  });

  it("records the group's heartbeat once every route succeeded", async () => {
    // No group declares a heartbeat today (the daily jobs report from the
    // catalog Worker), so the mechanism is exercised with a temporary group.
    const cron = "5 4 * * *";
    CRON_ROUTES[cron] = {
      label: "test group",
      heartbeat: "schedule-builder-scrape",
      routes: ["/cron/heartbeats"],
    };
    try {
      const paths = CRON_ROUTES[cron].routes;
      const fetchMock = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) =>
          Promise.resolve(new Response(null, { status: 200 })),
      );
      vi.stubGlobal("fetch", fetchMock);

      await scheduled(
        { cron },
        { BASE_URL: "https://example.test", CRON_SECRET: "secret" },
      );

      expect(fetchMock).toHaveBeenCalledTimes(paths.length + 1);
      const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
      expect(readRequestUrl(input ?? "")).toBe(
        "https://example.test/cron/heartbeats",
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
      expect(JSON.parse(String(init?.body))).toEqual({
        job: "schedule-builder-scrape",
      });
    } finally {
      delete CRON_ROUTES[cron];
    }
  });

  it("checks the daily jobs' heartbeats from the monitored group", () => {
    const monitored = Object.values(CRON_ROUTES).filter(
      (entry) => entry.monitorSlug,
    );
    expect(monitored).toHaveLength(1);
    expect(monitored[0]?.routes).toContain("/cron/heartbeats");
  });
});

function readRequestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
