// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, scheduled, type CronEnv } from "./scheduled";

/**
 * Every cron path must map to a route that exists.
 *
 * Route groups are directories wrapped in parentheses; they contribute nothing
 * to the URL, so a handler under `src/app/(api)/cron/...` is served at
 * `/cron/...`. Writing the path as `/api/cron/...` (the pre-Cloudflare shape)
 * returns 404, and the dispatcher swallows non-2xx responses, so a wrong path
 * fails silently. Typechecking can't catch it — a path is just a string —
 * mapping it back to a file is the only check that would.
 */
const APP = join(import.meta.dirname, "..", "src", "app");

function routeExists(urlPath: string): boolean {
  const GROUPS = ["(api)", "(site)", ""];
  return GROUPS.some((group) =>
    existsSync(join(APP, group, urlPath, "route.ts")),
  );
}

function cronEnv(overrides: Partial<CronEnv> = {}): CronEnv {
  return {
    BASE_URL: "https://example.test",
    CRON_SECRET: "secret",
    SCRAPE_WORKFLOW: {
      create: vi.fn().mockResolvedValue({ id: "test-instance" }),
    } as unknown as CronEnv["SCRAPE_WORKFLOW"],
    ...overrides,
  };
}

describe("cron dispatcher", () => {
  // Currently empty: the registrar cron (the only entry this map ever had)
  // now triggers the ScrapeWorkflow instead of a route -- see CRON_ROUTES'
  // own KNOWN GAP comment in ./scheduled.ts. These two checks stay in place,
  // running against zero entries today, as a guard for whenever a
  // route-based cron exists again.
  const entries = Object.entries(CRON_ROUTES).flatMap(([cron, { routes }]) =>
    routes.map((path) => ({ cron, path })),
  );

  it.each(entries)("$path exists (fired by $cron)", ({ path }) => {
    expect(routeExists(path)).toBe(true);
  });

  it("never prefixes a path with the route group", () => {
    // `(api)` is a route group; `/api` is a URL segment, and no directory
    // produces one.
    for (const { path } of entries) {
      expect(path.startsWith("/api/")).toBe(false);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("triggers the ScrapeWorkflow for the daily registrar cron, with no HTTP fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn().mockResolvedValue({ id: "test-instance" });

    await expect(
      scheduled(
        { cron: "5 14 * * *" },
        cronEnv({
          SCRAPE_WORKFLOW: {
            create,
          } as unknown as CronEnv["SCRAPE_WORKFLOW"],
        }),
      ),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
    // The registrar scrape used to be an HTTP round trip to
    // /cron/scrape-registrar; it now runs inside the Workflow instance the
    // line above created, not as a fetch from this handler.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for a cron expression with no route or workflow mapped to it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn();

    await expect(
      scheduled(
        { cron: "0 0 * * *" },
        cronEnv({
          SCRAPE_WORKFLOW: {
            create,
          } as unknown as CronEnv["SCRAPE_WORKFLOW"],
        }),
      ),
    ).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Guards the fetch-dispatch loop itself for whenever CRON_ROUTES holds a
  // route-based cron again; a no-op today since `entries` is empty.
  it.skipIf(entries.length === 0)(
    "dispatches every route with the cron bearer, logging (not throwing) on failure",
    async () => {
      const [cron, entry] = Object.entries(CRON_ROUTES)[0]!;
      const { routes } = entry;
      const lastPath = routes[routes.length - 1]!;

      const fetchMock = vi.fn(
        (input: string | URL | Request, _init?: RequestInit) =>
          Promise.resolve(
            new Response(null, {
              status: readRequestUrl(input).endsWith(lastPath) ? 503 : 200,
            }),
          ),
      );
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      vi.stubGlobal("fetch", fetchMock);

      // Unlike platform's dispatcher, this one logs and continues — a failing
      // sibling route must not reject the scheduled handler.
      await expect(scheduled({ cron }, cronEnv())).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(routes.length);
      expect(
        fetchMock.mock.calls.map(([input]) => readRequestUrl(input)),
      ).toEqual(routes.map((path) => `https://example.test${path}`));
      for (const [, init] of fetchMock.mock.calls) {
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: "Bearer secret",
        });
      }
      expect(errorSpy).toHaveBeenCalled();
    },
  );
});

function readRequestUrl(input: string | URL | Request): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
