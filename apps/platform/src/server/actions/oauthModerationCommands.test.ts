import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The per-client moderation Commands: turn on, rotate the secret, send a test
 * action. Each returns an ActionResult; the one-time secret travels in `data`.
 * The database, the delivery attempt and the queue are replaced;
 * `moderation.db-test.ts` runs the real ones.
 */

const CLIENT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  canManage: true,
  registration: null as null | Record<string, unknown>,
  existing: null as null | Record<string, unknown>,
  signingKey: "key" as string | undefined,
  inserted: [] as unknown[],
  audit: [] as unknown[],
  rateOk: true,
  outcome: { ack: true, result: "delivered" } as Record<string, unknown>,
  queue: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("~/server/auth/access", () => ({
  authorizeSession: () => Promise.resolve(mocks.access),
  callerFor: () => Promise.resolve({}),
  rules: { manageOAuthApps: () => mocks.canManage },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("~/env", () => ({
  env: {
    get MODERATION_SIGNING_KEY() {
      return mocks.signingKey;
    },
  },
}));
vi.mock("~/server/db", () => {
  const tx = {
    insert: () => ({
      values: (value: unknown) => {
        mocks.audit.push(value);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ secretVersion: 2 }],
        }),
      }),
    }),
  };
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
      insert: () => ({
        values: (value: unknown) => {
          mocks.inserted.push(value);
          return {
            onConflictDoNothing: async () => undefined,
            returning: async () => [{ id: "delivery-1" }],
          };
        },
      }),
      transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx),
    },
  };
});
vi.mock("~/server/db/schema", () => ({
  auditEvents: {},
  moderationClients: { clientId: "clientId", secretVersion: "secretVersion" },
  moderationDeliveries: { id: "id" },
}));
vi.mock("~/server/oauth/audit", () => ({
  oauthAuditEvent: (event: unknown) => event,
}));
vi.mock("~/server/moderation/delivery", () => ({
  attemptDelivery: async () => mocks.outcome,
}));
vi.mock("~/server/moderation/deliveryStore", () => ({
  databaseDeliveryStore: {},
}));
vi.mock("~/server/moderation/queue", () => ({
  queueDeliveriesQuietly: mocks.queue,
}));
vi.mock("~/server/moderation/secrets", () => ({
  deriveClientSecret: (key: string, client: string, version: number) =>
    Promise.resolve(`${key}:${version}`),
}));
vi.mock("~/server/rateLimit", () => ({
  consumeRateLimit: () => Promise.resolve(mocks.rateOk),
}));

const { enableModeration, rotateModerationSecret, sendModerationTest } =
  await import("./oauthModeration");

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = { ok: true, caller: { userId: USER } };
  mocks.canManage = true;
  mocks.registration = {
    clientId: CLIENT,
    userId: USER,
    status: "testing",
    label: "Lab",
  };
  mocks.existing = null;
  mocks.signingKey = "key";
  mocks.inserted = [];
  mocks.audit = [];
  mocks.rateOk = true;
  mocks.outcome = { ack: true, result: "delivered" };
});

describe("every Command", () => {
  it("refuses a signed-out caller", async () => {
    mocks.access = { ok: false, message: "Session expected but not found." };
    for (const result of [
      await enableModeration(CLIENT, form()),
      await rotateModerationSecret(CLIENT),
      await sendModerationTest(CLIENT, form()),
    ]) {
      expect(result).toEqual({
        ok: false,
        message: "Session expected but not found.",
      });
    }
  });

  it("answers a client the member may not manage with 'not found'", async () => {
    mocks.registration = { ...mocks.registration, userId: "someone-else" };
    for (const result of [
      await enableModeration(CLIENT, form()),
      await rotateModerationSecret(CLIENT),
      await sendModerationTest(CLIENT, form()),
    ]) {
      expect(result).toEqual({ ok: false, message: "OAuth client not found" });
    }
  });

  it("says so on a deployment with no signing key", async () => {
    mocks.signingKey = undefined;
    expect(await rotateModerationSecret(CLIENT)).toEqual({
      ok: false,
      message: "Moderation is not configured on this deployment yet",
    });
  });
});

describe("enableModeration", () => {
  it("turns moderation on and returns the secret once", async () => {
    expect(
      await enableModeration(
        CLIENT,
        form({ endpointUrl: "https://lab.example/hook" }),
      ),
    ).toEqual({
      ok: true,
      data: { secret: "key:1" },
      message: "Moderation is on. Copy the secret now: it is shown once.",
    });
    expect(mocks.inserted).toEqual([
      { clientId: CLIENT, endpointUrl: "https://lab.example/hook" },
    ]);
  });

  it("will not show the secret a second time", async () => {
    mocks.existing = { clientId: CLIENT, secretVersion: 1 };
    expect(await enableModeration(CLIENT, form())).toEqual({
      ok: false,
      message:
        "Moderation is already on for this client. Rotate the secret to get a new one",
    });
  });

  it("is turned on for a production app by registering it, not here", async () => {
    mocks.registration = { ...mocks.registration, status: "in_production" };
    expect(await enableModeration(CLIENT, form())).toMatchObject({
      ok: false,
      message: expect.stringMatching(/registering it/) as unknown,
    });
  });

  it("refuses an endpoint the rule refuses", async () => {
    expect(
      await enableModeration(CLIENT, form({ endpointUrl: "http://x.example" })),
    ).toMatchObject({ ok: false });
    expect(mocks.inserted).toEqual([]);
  });
});

describe("rotateModerationSecret", () => {
  it("needs moderation on first", async () => {
    expect(await rotateModerationSecret(CLIENT)).toEqual({
      ok: false,
      message: "Turn moderation on first",
    });
  });

  it("rotates a Testing client's secret with no audit entry", async () => {
    mocks.existing = { clientId: CLIENT, secretVersion: 1 };
    expect(await rotateModerationSecret(CLIENT)).toMatchObject({
      ok: true,
      data: { secret: "key:2" },
    });
    expect(mocks.audit).toEqual([]);
  });

  it("audits a production client's rotation", async () => {
    mocks.registration = { ...mocks.registration, status: "in_production" };
    mocks.existing = { clientId: CLIENT, secretVersion: 1 };
    await rotateModerationSecret(CLIENT);
    expect(mocks.audit).toEqual([
      expect.objectContaining({
        action: "oauth_client.moderation_secret_rotated",
      }),
    ]);
  });
});

describe("sendModerationTest", () => {
  const ready = () => {
    mocks.existing = {
      clientId: CLIENT,
      secretVersion: 1,
      endpointUrl: "https://lab.example/hook",
    };
  };

  it("delivers once and names what was delivered", async () => {
    ready();
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toEqual({
      ok: true,
      message: "Delivered content.hide to your endpoint",
    });
  });

  it("needs moderation on, an endpoint, a known action and a Testing client", async () => {
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toMatchObject({ message: "Turn moderation on first" });

    mocks.existing = { clientId: CLIENT, secretVersion: 1, endpointUrl: null };
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toMatchObject({ message: "Set an endpoint URL first" });

    ready();
    expect(
      await sendModerationTest(CLIENT, form({ type: "nonsense" })),
    ).toMatchObject({ message: "Choose an action" });

    mocks.registration = { ...mocks.registration, status: "in_production" };
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/only go to apps in Testing/) as unknown,
    });
    expect(mocks.inserted).toEqual([]);
  });

  it("refuses past the hourly limit", async () => {
    ready();
    mocks.rateOk = false;
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toEqual({ ok: false, message: "Too many test actions. Try again later" });
  });

  it("queues a delivery the receiver did not accept and says so", async () => {
    ready();
    mocks.outcome = { ack: false, error: "500" };
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toEqual({
      ok: false,
      message: "Your endpoint did not accept it (500). It will be retried",
    });
    expect(mocks.queue).toHaveBeenCalledWith(["delivery-1"]);
  });

  it("tells the owner to check the URL when the delivery could not be sent", async () => {
    ready();
    mocks.outcome = { ack: true, result: "failed" };
    expect(
      await sendModerationTest(CLIENT, form({ type: "content.hide" })),
    ).toEqual({
      ok: false,
      message: "The delivery could not be sent. Check the endpoint URL",
    });
  });
});
