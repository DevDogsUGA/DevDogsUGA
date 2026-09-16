import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the `vi.mock` factories (which run before the module body) can
// reference the same spy/stub instances the assertions read.
const { createDbMock, getCloudflareContextMock, envMock, relationsMock } =
  vi.hoisted(() => ({
    createDbMock: vi.fn((url: string) => ({ __url: url })),
    getCloudflareContextMock: vi.fn(),
    envMock: { DB_URL: "postgres://local/db", DEPLOY_ENV: "development" },
    relationsMock: { __relations: true },
  }));

vi.mock("@devdogsuga/drizzle", () => ({ createDb: createDbMock }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}));
vi.mock("~/env", () => ({ env: envMock }));
vi.mock("./relations", () => ({ relations: relationsMock }));

// Each case needs fresh module state (the WeakMap and the `localDatabase` cache
// live at module scope), so re-import after resetting modules.
async function loadDb() {
  vi.resetModules();
  return import("./index");
}

function context(hyperdrive?: { connectionString: string }) {
  return { env: hyperdrive ? { HYPERDRIVE: hyperdrive } : {} };
}

// Any property access on the `db` Proxy runs its get trap, which resolves
// `currentDb()` before returning anything — that resolution is what we assert
// on. The concrete Drizzle type doesn't include an arbitrary probe key, so read
// through `unknown`.
function trigger(db: unknown, key = "probe"): void {
  void (db as Record<string, unknown>)[key];
}

describe("schedule-builder db module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createDbMock.mockImplementation((url: string) => ({ __url: url }));
    envMock.DEPLOY_ENV = "development";
    getCloudflareContextMock.mockReset();
  });

  it("falls back to DB_URL when there is no Cloudflare context", async () => {
    getCloudflareContextMock.mockImplementation(() => {
      throw new Error("no request context");
    });
    const { db } = await loadDb();
    trigger(db);
    expect(createDbMock).toHaveBeenCalledTimes(1);
    expect(createDbMock).toHaveBeenCalledWith(envMock.DB_URL, relationsMock);
  });

  it("uses the HYPERDRIVE connection string when the binding is present", async () => {
    getCloudflareContextMock.mockReturnValue(
      context({ connectionString: "postgres://hyperdrive/pool" }),
    );
    const { db } = await loadDb();
    trigger(db);
    expect(createDbMock).toHaveBeenCalledWith(
      "postgres://hyperdrive/pool",
      relationsMock,
      { cache: false, max: 5 },
    );
  });

  it("throws when a deployed Worker has a context but no HYPERDRIVE binding", async () => {
    envMock.DEPLOY_ENV = "production";
    getCloudflareContextMock.mockReturnValue(context());
    const { db } = await loadDb();
    expect(() => trigger(db)).toThrow(/HYPERDRIVE/);
    expect(createDbMock).not.toHaveBeenCalled();
  });

  it("falls back to DB_URL in development even with a context and no binding", async () => {
    envMock.DEPLOY_ENV = "development";
    getCloudflareContextMock.mockReturnValue(context());
    const { db } = await loadDb();
    expect(() => trigger(db)).not.toThrow();
    expect(createDbMock).toHaveBeenCalledWith(envMock.DB_URL, relationsMock, {
      cache: false,
      max: 5,
    });
  });

  it("reuses one client per context and creates a new one per distinct context", async () => {
    getCloudflareContextMock.mockReturnValue(
      context({ connectionString: "postgres://one" }),
    );
    const { db } = await loadDb();
    trigger(db, "a");
    trigger(db, "b");
    expect(createDbMock).toHaveBeenCalledTimes(1);

    getCloudflareContextMock.mockReturnValue(
      context({ connectionString: "postgres://two" }),
    );
    trigger(db, "c");
    expect(createDbMock).toHaveBeenCalledTimes(2);
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
