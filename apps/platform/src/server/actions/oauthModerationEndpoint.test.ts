import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `saveModerationEndpoint`, the save of the endpoint Draft on the OAuth client
 * page. It returns an ActionResult: a rejected URL is keyed under
 * `endpointUrl`, and a production client's change is audited in the same
 * transaction as the write. The database is replaced.
 */

const CLIENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  /** The registration `managedClient` finds, or none. */
  registration: null as null | Record<string, unknown>,
  /** The moderation row, or none when moderation is off. */
  existing: null as null | Record<string, unknown>,
  canManage: true,
  audit: [] as unknown[],
  updates: [] as unknown[],
  revalidate: vi.fn(),
}));

vi.mock("~/server/auth/access", () => ({
  authorizeSession: () => Promise.resolve(mocks.access),
  callerFor: () => Promise.resolve({}),
  rules: { manageOAuthApps: () => mocks.canManage },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("~/env", () => ({ env: { MODERATION_SIGNING_KEY: "key" } }));
vi.mock("~/server/db", () => {
  const transaction = async (
    work: (tx: Record<string, unknown>) => Promise<unknown>,
  ) =>
    work({
      insert: () => ({
        values: (value: unknown) => {
          mocks.audit.push(value);
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (value: unknown) => {
          mocks.updates.push(value);
          return { where: () => Promise.resolve() };
        },
      }),
    });
  return {
    db: {
      query: {
        oauthRegistrations: {
          findFirst: async () => mocks.registration ?? undefined,
        },
      },
      select: () => ({
        from: () => ({
          where: async () => (mocks.existing ? [mocks.existing] : []),
        }),
      }),
      transaction,
    },
  };
});
vi.mock("~/server/oauth/audit", () => ({
  oauthAuditEvent: (event: unknown) => event,
}));
vi.mock("~/server/moderation/delivery", () => ({}));
vi.mock("~/server/moderation/deliveryStore", () => ({}));
vi.mock("~/server/moderation/queue", () => ({}));
vi.mock("~/server/moderation/secrets", () => ({}));
vi.mock("~/server/rateLimit", () => ({}));

const { saveModerationEndpoint } = await import("./oauthModeration");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = { ok: true, caller: { userId: USER } };
  mocks.registration = {
    clientId: CLIENT,
    userId: USER,
    status: "testing",
    label: "Lab",
  };
  mocks.existing = { clientId: CLIENT, endpointUrl: null, secretVersion: 1 };
  mocks.canManage = true;
  mocks.audit = [];
  mocks.updates = [];
});

describe("saveModerationEndpoint", () => {
  it("saves the trimmed endpoint for the client's owner", async () => {
    const result = await saveModerationEndpoint(
      CLIENT,
      "  https://lab.example/hook ",
    );
    expect(result).toEqual({ ok: true, message: "Endpoint saved" });
    expect(mocks.updates).toEqual([
      expect.objectContaining({ endpointUrl: "https://lab.example/hook" }),
    ]);
    // A development client's endpoint is not audited.
    expect(mocks.audit).toEqual([]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/oauth");
  });

  it("clears the endpoint when it is emptied", async () => {
    expect(await saveModerationEndpoint(CLIENT, "   ")).toMatchObject({
      ok: true,
    });
    expect(mocks.updates).toEqual([
      expect.objectContaining({ endpointUrl: null }),
    ]);
  });

  it("returns a rejected URL under endpointUrl and writes nothing", async () => {
    expect(await saveModerationEndpoint(CLIENT, "http://lab.example")).toEqual({
      ok: false,
      message: "The URL must use https://",
      fieldErrors: { endpointUrl: "The URL must use https://" },
    });
    expect(mocks.updates).toEqual([]);
  });

  it("audits a production client's change in the same transaction", async () => {
    mocks.registration = {
      clientId: CLIENT,
      userId: null,
      status: "in_production",
      label: "DogPack",
    };
    expect(
      await saveModerationEndpoint(CLIENT, "https://dogpack.example/hook"),
    ).toMatchObject({ ok: true });
    expect(mocks.audit).toEqual([
      expect.objectContaining({
        actorUserId: USER,
        action: "oauth_client.moderation_endpoint_changed",
        clientId: CLIENT,
        metadata: {
          label: "DogPack",
          endpointUrl: "https://dogpack.example/hook",
        },
      }),
    ]);
    expect(mocks.updates).toHaveLength(1);
  });

  it("answers a client the caller may not manage as not found", async () => {
    mocks.registration = {
      clientId: CLIENT,
      userId: "someone-else",
      status: "testing",
      label: "Theirs",
    };
    expect(await saveModerationEndpoint(CLIENT, "https://x.example")).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    mocks.registration = {
      clientId: CLIENT,
      userId: null,
      status: "in_production",
      label: "DogPack",
    };
    mocks.canManage = false;
    expect(await saveModerationEndpoint(CLIENT, "https://x.example")).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    expect(mocks.updates).toEqual([]);
  });

  it("asks for moderation to be turned on first", async () => {
    mocks.existing = null;
    expect(await saveModerationEndpoint(CLIENT, "https://x.example")).toEqual({
      ok: false,
      message: "Turn moderation on first",
    });
  });

  it("returns the session refusal instead of throwing", async () => {
    mocks.access = { ok: false, message: "Session expected but not found." };
    expect(await saveModerationEndpoint(CLIENT, "https://x.example")).toEqual({
      ok: false,
      message: "Session expected but not found.",
    });
  });
});
