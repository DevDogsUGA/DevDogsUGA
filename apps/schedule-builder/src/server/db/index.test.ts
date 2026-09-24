import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the `vi.mock` factories (which run before the module body) can
// reference the same spy/stub instances the assertions read.
const {
  createDbMock,
  workerEnvMock,
  envMock,
  relationsMock,
  requestState,
  cacheForRequestCaches,
} = vi.hoisted(() => ({
  createDbMock: vi.fn((url: string) => ({ __url: url })),
  workerEnvMock: {} as Record<
    "HYPERDRIVE",
    { connectionString: string } | undefined
  >,
  envMock: { DB_URL: "postgres://local/db", DEPLOY_ENV: "development" },
  relationsMock: { __relations: true },
  // Stands in for vinext's real `AsyncLocalStorage`-backed request store:
  // the mocked `cacheForRequest` below keys its cache on `requestState.id`,
  // an object whose identity `newRequest()` replaces to simulate moving to
  // a new request -- reproducing "same client within one request, fresh
  // client for the next" without vinext's actual request-scope machinery.
  requestState: { id: {} },
  // One `WeakMap<request, value>` per wrapped factory, same shape as
  // vinext's real `requestCache` (see `vinext/shims/unified-request-context`).
  cacheForRequestCaches: new WeakMap<() => unknown, WeakMap<object, unknown>>(),
}));

vi.mock("@devdogsuga/db/server", () => ({ createDb: createDbMock }));
vi.mock("cloudflare:workers", () => ({ env: workerEnvMock }));
vi.mock("vinext/cache", () => ({
  cacheForRequest:
    <T>(factory: () => T) =>
    (): T => {
      let cache = cacheForRequestCaches.get(factory) as
        WeakMap<object, T> | undefined;
      if (!cache) {
        cache = new WeakMap();
        cacheForRequestCaches.set(factory, cache);
      }
      const key = requestState.id;
      if (cache.has(key)) return cache.get(key)!;
      const value = factory();
      cache.set(key, value);
      return value;
    },
}));
vi.mock("~/env", () => ({ env: envMock }));
vi.mock("./relations", () => ({ relations: relationsMock }));

// Each case needs fresh module state (the WeakMaps above and the module
// singletons they wrap), so re-import after resetting modules.
async function loadDb() {
  vi.resetModules();
  return import("./index");
}

// Any property access on the `db` Proxy runs its get trap, which resolves
// `currentDb()` before returning anything — that resolution is what we assert
// on. The concrete Drizzle type doesn't include an arbitrary probe key, so read
// through `unknown`.
function trigger(db: unknown, key = "probe"): void {
  void (db as Record<string, unknown>)[key];
}

function newRequest(): void {
  requestState.id = {};
}

describe("schedule-builder db module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createDbMock.mockImplementation((url: string) => ({ __url: url }));
    envMock.DEPLOY_ENV = "development";
    workerEnvMock.HYPERDRIVE = undefined;
    newRequest();
  });

  it("falls back to DB_URL when there is no HYPERDRIVE binding (development)", async () => {
    const { db } = await loadDb();
    trigger(db);
    expect(createDbMock).toHaveBeenCalledTimes(1);
    expect(createDbMock).toHaveBeenCalledWith(envMock.DB_URL, relationsMock);
  });

  it("uses the HYPERDRIVE connection string when the binding is present", async () => {
    workerEnvMock.HYPERDRIVE = {
      connectionString: "postgres://hyperdrive/pool",
    };
    const { db } = await loadDb();
    trigger(db);
    expect(createDbMock).toHaveBeenCalledWith(
      "postgres://hyperdrive/pool",
      relationsMock,
      { cache: false, max: 5 },
    );
  });

  it("throws when a deployed Worker has no HYPERDRIVE binding", async () => {
    envMock.DEPLOY_ENV = "production";
    const { db } = await loadDb();
    expect(() => trigger(db)).toThrow(/HYPERDRIVE/);
    expect(createDbMock).not.toHaveBeenCalled();
  });

  it("falls back to DB_URL in development even with no binding", async () => {
    envMock.DEPLOY_ENV = "development";
    const { db } = await loadDb();
    expect(() => trigger(db)).not.toThrow();
    expect(createDbMock).toHaveBeenCalledWith(envMock.DB_URL, relationsMock);
  });

  it("reuses one client per request and creates a new one per distinct request", async () => {
    workerEnvMock.HYPERDRIVE = { connectionString: "postgres://one" };
    const { db } = await loadDb();
    trigger(db, "a");
    trigger(db, "b");
    expect(createDbMock).toHaveBeenCalledTimes(1);

    newRequest();
    workerEnvMock.HYPERDRIVE = { connectionString: "postgres://two" };
    trigger(db, "c");
    expect(createDbMock).toHaveBeenCalledTimes(2);
  });

  it("reuses one local client across distinct requests when there is no HYPERDRIVE binding", async () => {
    // `localDb`'s DB_URL fallback is memoized at module scope, independent of
    // `cacheForRequest`'s per-request cache -- this is the regression case:
    // without the module-level memo, each new "request" (or any call outside
    // a request scope) would mint a fresh, never-closed Postgres.js pool.
    const { db } = await loadDb();
    trigger(db, "a");
    expect(createDbMock).toHaveBeenCalledTimes(1);

    newRequest();
    trigger(db, "b");
    expect(createDbMock).toHaveBeenCalledTimes(1);
  });

  it("createScheduleBuilderDb builds a cache-less client from a bare url", async () => {
    const { createScheduleBuilderDb } = await loadDb();
    createScheduleBuilderDb("postgres://injected", 3);
    expect(createDbMock).toHaveBeenCalledWith(
      "postgres://injected",
      relationsMock,
      { cache: false, max: 3 },
    );
  });
});
