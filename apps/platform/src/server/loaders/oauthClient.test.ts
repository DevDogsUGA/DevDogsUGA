import { beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const HOLDER = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  session: "",
  holders: new Set<string>(),
  registration: null as null | {
    userId: string | null;
    status: "testing" | "in_production";
  },
  approvals: [] as { userId: string }[],
  getClientModeration: vi.fn(),
}));

vi.mock("~/server/auth", () => ({
  expectSession: () =>
    mocks.session
      ? Promise.resolve(mocks.session)
      : Promise.reject(new Error("no session")),
}));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: (id: string) =>
    Promise.resolve({
      resolvedPermissions: { canManageOAuthApps: mocks.holders.has(id) },
      isLeader: false,
      minRank: Infinity,
    }),
}));
vi.mock("~/server/db", () => {
  const select = {
    from: () => select,
    where: () => Promise.resolve(mocks.approvals),
  };
  return {
    db: {
      select: () => select,
      query: {
        oauthRegistrations: {
          findFirst: () =>
            Promise.resolve(
              mocks.registration && {
                clientId: CLIENT,
                label: "Lab",
                logoPath: null,
                homepageUrl: null,
                privacyPolicyUrl: null,
                ...mocks.registration,
              },
            ),
        },
        oauthTestAccounts: {
          findMany: () =>
            Promise.resolve([
              {
                createdAt: new Date("2026-10-01"),
                user: { id: "t1", rawUserMetaData: { name: "Tess" } },
              },
            ]),
        },
      },
    },
  };
});
vi.mock("~/supabase/drizzle/schema", () => ({
  oauthConsentsInAuth: { clientId: "c", userId: "u", revokedAt: "r" },
}));
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        oauth: {
          getClient: () =>
            Promise.resolve({
              data: { redirect_uris: ["http://127.0.0.1:3000/auth"] },
            }),
        },
      },
    },
  },
}));
vi.mock("~/server/loaders/console", () => ({ appLogoUrl: () => null }));
vi.mock("~/server/loaders/oauthModeration", () => ({
  getClientModeration: mocks.getClientModeration,
}));

const { getOAuthClientPage } = await import("./oauthClient");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = OWNER;
  mocks.holders = new Set([HOLDER]);
  mocks.registration = { userId: OWNER, status: "testing" };
  mocks.approvals = [{ userId: "t1" }];
  mocks.getClientModeration.mockResolvedValue({ clientId: CLIENT });
});

describe("getOAuthClientPage", () => {
  it("loads an owner's client with their test accounts and approvals", async () => {
    const page = await getOAuthClientPage(CLIENT);
    expect(page).toMatchObject({
      devDogsApp: false,
      client: {
        clientId: CLIENT,
        label: "Lab",
        redirectUris: ["http://127.0.0.1:3000/auth"],
        approvedTestAccountIds: ["t1"],
      },
      testAccounts: [{ userId: "t1" }],
    });
    expect(mocks.getClientModeration).toHaveBeenCalledWith({
      clientId: CLIENT,
      label: "Lab",
      production: false,
    });
  });

  it("is null for a member who does not own the client, even a holder", async () => {
    mocks.session = OTHER;
    expect(await getOAuthClientPage(CLIENT)).toBeNull();
    mocks.session = HOLDER;
    expect(await getOAuthClientPage(CLIENT)).toBeNull();
  });

  it("lets a holder in to a DevDogs app, with no test accounts, and treats it as production", async () => {
    mocks.registration = { userId: null, status: "testing" };
    mocks.session = HOLDER;
    const page = await getOAuthClientPage(CLIENT);
    expect(page).toMatchObject({ devDogsApp: true, testAccounts: [] });
    expect(mocks.getClientModeration).toHaveBeenCalledWith(
      expect.objectContaining({ production: true }),
    );
  });

  it("is null for a DevDogs app to anyone who does not hold the permission", async () => {
    mocks.registration = { userId: null, status: "in_production" };
    expect(await getOAuthClientPage(CLIENT)).toBeNull();
  });

  it("is null for a client that does not exist, a malformed id and a signed-out caller", async () => {
    mocks.registration = null;
    expect(await getOAuthClientPage(CLIENT)).toBeNull();
    expect(await getOAuthClientPage("nope")).toBeNull();
    mocks.registration = { userId: OWNER, status: "testing" };
    mocks.session = "";
    expect(await getOAuthClientPage(CLIENT)).toBeNull();
  });
});
