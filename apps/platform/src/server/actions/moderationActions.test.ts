import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The console's moderation Commands: resolve and dismiss a report, set a
 * member's standing, resend a delivery, register an outside app. Each returns
 * an ActionResult: an authorization refusal and a decision someone else made
 * first come back as failures, a real database failure still throws. The
 * database, Supabase and the queue are replaced.
 */

const MODERATOR = "11111111-1111-4111-8111-111111111111";
const REPORT = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  allowed: true,
  /** What `db.execute` does: resolve rows, or reject with this. */
  executeRows: [] as unknown[],
  executeError: null as unknown,
  executed: 0,
  registrationBefore: null as null | { clientId: string },
  transactionError: null as unknown,
  inserted: [] as unknown[],
  ban: vi.fn(),
  queue: vi.fn(),
  reset: vi.fn(),
  revalidate: vi.fn(),
  signingKey: "key" as string | undefined,
}));

vi.mock("~/server/auth/access", () => ({
  authorize: () => Promise.resolve(mocks.access),
  callerFor: () => Promise.resolve({}),
  rules: {
    moderate: () => mocks.allowed,
    manageSuspensions: () => mocks.allowed,
    manageOAuthApps: () => mocks.allowed,
  },
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
  const execute = () => {
    mocks.executed += 1;
    return mocks.executeError
      ? Promise.reject(mocks.executeError as Error)
      : Promise.resolve(mocks.executeRows);
  };
  const tx = {
    execute,
    insert: () => ({
      values: (value: unknown) => {
        mocks.inserted.push(value);
        return {
          onConflictDoUpdate: () => Promise.resolve(),
        };
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
  return {
    db: {
      execute,
      select: () => ({
        from: () => ({
          where: async () =>
            mocks.registrationBefore ? [mocks.registrationBefore] : [],
        }),
      }),
      transaction: async (work: (t: typeof tx) => Promise<unknown>) => {
        if (mocks.transactionError) throw mocks.transactionError as Error;
        return work(tx);
      },
    },
  };
});
vi.mock("~/server/db/schema", () => ({
  userSuspensions: {},
  auditEvents: {},
  moderationClients: { clientId: "clientId" },
}));
vi.mock("~/supabase/admin", () => ({
  supabaseAdmin: { auth: { admin: { updateUserById: mocks.ban } } },
}));
vi.mock("~/server/moderation/queue", () => ({
  queueDeliveriesQuietly: mocks.queue,
}));
vi.mock("~/server/moderation/deliveryStore", () => ({
  resetForResend: mocks.reset,
}));
vi.mock("~/server/moderation/secrets", () => ({
  deriveClientSecret: (key: string, client: string, version: number) =>
    Promise.resolve(`${key}:${client}:${version}`),
}));
vi.mock("~/server/oauth/audit", () => ({
  oauthAuditEvent: (event: unknown) => event,
}));

const { resolveReport, dismissReport, updateUserRole } =
  await import("./moderation");
const { resendDelivery, registerExternalApp } =
  await import("./moderationDeliveries");

/** A database error the way Drizzle wraps one: the text is on the cause. */
function raised(message: string) {
  return new Error("Failed query", { cause: new Error(message) });
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const REGISTRATION = {
  slug: "dogpack",
  displayName: "DogPack",
  clientId: CLIENT,
  endpointUrl: "https://dogpack.example.com/functions/v1/platform-moderation",
  contentTypes: "session | Study session",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = { ok: true, caller: { userId: MODERATOR } };
  mocks.allowed = true;
  mocks.executeRows = [
    { resolve_report: { bannedUserId: null, deliveryIds: ["d1"] } },
  ];
  mocks.executeError = null;
  mocks.executed = 0;
  mocks.registrationBefore = null;
  mocks.transactionError = null;
  mocks.inserted = [];
  mocks.signingKey = "key";
  mocks.reset.mockResolvedValue(true);
});

describe("resolveReport", () => {
  it("resolves, queues the deliveries and says so", async () => {
    const result = await resolveReport(
      REPORT,
      "suspend",
      "no_action",
      "no_action",
    );
    expect(result).toEqual({ ok: true, message: "Report resolved." });
    expect(mocks.queue).toHaveBeenCalledWith(["d1"]);
    expect(mocks.ban).not.toHaveBeenCalled();
  });

  it("finishes Supabase's ban when the decision calls for one", async () => {
    mocks.executeRows = [
      { resolve_report: { bannedUserId: "bad-user", deliveryIds: [] } },
    ];
    await resolveReport(REPORT, "ban", "no_action", "no_action");
    expect(mocks.ban).toHaveBeenCalledWith("bad-user", {
      ban_duration: "87600h",
    });
  });

  it("refuses a caller without canModerate, and does nothing", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(
      await resolveReport(REPORT, "warn", "no_action", "no_action"),
    ).toEqual({ ok: false, message: "Not authorized." });
    expect(mocks.executed).toBe(0);
  });

  it("returns a report someone else already decided as a failure", async () => {
    mocks.executeError = raised(`Report ${REPORT} has already been decided`);
    expect(
      await resolveReport(REPORT, "warn", "no_action", "no_action"),
    ).toEqual({
      ok: false,
      message: "Someone has already decided this report.",
    });
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("returns a report that is gone as a failure", async () => {
    mocks.executeError = raised(`Report ${REPORT} does not exist`);
    expect(
      await resolveReport(REPORT, "warn", "no_action", "no_action"),
    ).toEqual({ ok: false, message: "That report no longer exists." });
  });

  it("lets a real database failure throw", async () => {
    mocks.executeError = raised("connection reset");
    await expect(
      resolveReport(REPORT, "warn", "no_action", "no_action"),
    ).rejects.toThrow("Failed query");
  });
});

describe("dismissReport", () => {
  it("dismisses and says so", async () => {
    expect(await dismissReport(REPORT, "spam")).toEqual({
      ok: true,
      message: "Report dismissed.",
    });
    expect(mocks.executed).toBe(1);
  });

  it("refuses without canModerate", async () => {
    mocks.access = { ok: false, message: "Not authorized." };
    expect(await dismissReport(REPORT)).toMatchObject({ ok: false });
    expect(mocks.executed).toBe(0);
  });

  it("returns an already-decided report as a failure", async () => {
    mocks.executeError = raised(`Report ${REPORT} has already been decided`);
    expect(await dismissReport(REPORT)).toMatchObject({
      ok: false,
      message: "Someone has already decided this report.",
    });
  });
});

describe("updateUserRole", () => {
  it("suspends, queues the standing message and says so", async () => {
    mocks.executeRows = [{ ids: [] }];
    expect(await updateUserRole("member", "suspended", "spam")).toEqual({
      ok: true,
      message: "User suspended.",
    });
    expect(mocks.ban).not.toHaveBeenCalled();
  });

  it("bans through Supabase too", async () => {
    mocks.executeRows = [{ ids: [] }];
    expect(await updateUserRole("member", "banned")).toMatchObject({
      ok: true,
      message: "User banned.",
    });
    expect(mocks.ban).toHaveBeenCalledWith("member", {
      ban_duration: "87600h",
    });
  });

  it("restores a member and lifts the ban", async () => {
    mocks.executeRows = [{ ids: [] }];
    expect(await updateUserRole("member", "member")).toMatchObject({
      ok: true,
      message: "Standing restored.",
    });
    expect(mocks.ban).toHaveBeenCalledWith("member", { ban_duration: "none" });
  });

  it("refuses without canManageSuspensions, in words, and changes nothing", async () => {
    mocks.allowed = false;
    expect(await updateUserRole("member", "banned")).toEqual({
      ok: false,
      message: "You cannot change a user's standing.",
    });
    expect(mocks.ban).not.toHaveBeenCalled();
    expect(mocks.executed).toBe(0);
  });

  it("refuses a caller who is not signed in", async () => {
    mocks.access = { ok: false, message: "Session expected but not found." };
    expect(await updateUserRole("member", "banned")).toEqual({
      ok: false,
      message: "You cannot change a user's standing.",
    });
  });
});

describe("resendDelivery", () => {
  it("queues an undelivered decision again", async () => {
    expect(await resendDelivery("d1")).toEqual({
      ok: true,
      message: "Queued to send again.",
    });
    expect(mocks.queue).toHaveBeenCalledWith(["d1"]);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("says so when there was nothing to resend", async () => {
    mocks.reset.mockResolvedValue(false);
    expect(await resendDelivery("d1")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/already delivered/) as unknown,
    });
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("refuses without canModerate", async () => {
    mocks.allowed = false;
    expect(await resendDelivery("d1")).toEqual({
      ok: false,
      message: "You cannot resend moderation deliveries.",
    });
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});

describe("registerExternalApp", () => {
  it("registers and shows the secret once, when this created the record", async () => {
    const result = await registerExternalApp(form(REGISTRATION));
    expect(result).toMatchObject({
      ok: true,
      data: { secret: `key:${CLIENT}:1` },
      message: expect.stringMatching(/shown once/) as unknown,
    });
  });

  it("shows no secret when the owner already turned moderation on", async () => {
    mocks.registrationBefore = { clientId: CLIENT };
    const result = await registerExternalApp(form(REGISTRATION));
    expect(result).toMatchObject({
      ok: true,
      message: expect.stringMatching(/rotate it/) as unknown,
    });
    expect(result.ok && result.data).toBeUndefined();
  });

  it("explains a deployment with no signing key", async () => {
    mocks.signingKey = undefined;
    const result = await registerExternalApp(form(REGISTRATION));
    expect(result).toMatchObject({
      ok: true,
      message: expect.stringMatching(/no signing key/) as unknown,
    });
  });

  it("refuses a member without canManageOAuthApps", async () => {
    mocks.allowed = false;
    expect(await registerExternalApp(form(REGISTRATION))).toEqual({
      ok: false,
      message: "You cannot register apps",
    });
  });

  it.each([
    [{ slug: "Bad Slug" }, /slug is lowercase/],
    [{ displayName: " " }, /name is required/],
    [{ clientId: "not-a-uuid" }, /client id is a UUID/],
    [{ endpointUrl: "http://example.com" }, /./],
    [{ contentTypes: "" }, /./],
  ])("returns the form's own problem: %j", async (change, message) => {
    expect(
      await registerExternalApp(form({ ...REGISTRATION, ...change })),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(message) as unknown,
    });
  });

  it.each([
    ["moderation:client_deleted", /has been deleted/],
    ["moderation:client_unregistered", /Create the app there first/],
    ["moderation:development_client", /in Testing/],
    ["violates foreign key", /No OAuth client has that id/],
    ['App "x" is a platform app', /belongs to a platform app/],
  ])("returns %s as a failure", async (cause, message) => {
    mocks.transactionError = raised(cause);
    expect(await registerExternalApp(form(REGISTRATION))).toMatchObject({
      ok: false,
      message: expect.stringMatching(message) as unknown,
    });
  });

  it("lets a real database failure throw", async () => {
    mocks.transactionError = raised("connection reset");
    await expect(registerExternalApp(form(REGISTRATION))).rejects.toThrow(
      "Failed query",
    );
  });
});
