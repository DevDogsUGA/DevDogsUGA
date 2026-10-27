import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOAuthPageData: vi.fn(),
  expectSession: vi.fn(),
  canManage: vi.fn(),
  getConsoleApps: vi.fn(),
}));

// Every query resolves to no rows; only the client list matters here.
vi.mock("~/server/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy"]) {
    chain[m] = () => chain;
  }
  chain.limit = () => Promise.resolve([]);
  chain.then = (resolve: (v: unknown[]) => void) => resolve([]);
  return { db: chain };
});
vi.mock("~/server/db/schema", () => ({
  moderationClients: { clientId: "c" },
  moderationDeliveries: { clientId: "c", createdAt: "t" },
  sandboxReports: { clientId: "c", createdAt: "t" },
}));
vi.mock("~/server/actions/permissions", () => ({
  canUserManageOAuthApps: mocks.canManage,
}));
vi.mock("~/server/auth", () => ({ expectSession: mocks.expectSession }));
vi.mock("~/server/loaders/console", () => ({
  getOAuthPageData: mocks.getOAuthPageData,
}));
vi.mock("~/server/loaders/oauthApps", () => ({
  getConsoleApps: mocks.getConsoleApps,
}));

const { getOAuthModerationData } = await import("./oauthModeration");

function app(clientId: string, over: Record<string, unknown> = {}) {
  return {
    clientId,
    label: clientId,
    status: "in_production",
    isDevDogs: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.expectSession.mockResolvedValue("holder");
  mocks.getOAuthPageData.mockResolvedValue({ clients: [] });
  mocks.canManage.mockResolvedValue(true);
});

describe("getOAuthModerationData", () => {
  it("lists DevDogs and published member apps for a holder, never another member's Testing app", async () => {
    mocks.getConsoleApps.mockResolvedValue([
      app("devdogs", { isDevDogs: true, status: "testing" }),
      app("published"),
      app("someone-elses-testing", { status: "testing" }),
    ]);
    const rows = await getOAuthModerationData();
    expect(rows.map((r) => r.clientId).sort()).toEqual([
      "devdogs",
      "published",
    ]);
    expect(rows.every((r) => r.production)).toBe(true);
  });
});
