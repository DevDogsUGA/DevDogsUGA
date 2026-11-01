import { ExpectedFailure } from "~/lib/actionResult";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The permission gates of the holder-only status actions. The domain steps and
 * the database are replaced: what is pinned here is who may call what, and
 * that nothing runs for a caller who may not.
 */

const mocks = vi.hoisted(() => ({
  session: "member",
  holders: new Set<string>(),
  testAccount: null as { testUserId: string } | null,
  registrationOwner: null as string | null,
  steps: {
    setAppStatus: vi.fn(),
    setAsksForConsent: vi.fn(),
    transferToDevDogs: vi.fn(),
    forgetApproval: vi.fn(),
  },
}));

vi.mock("../auth", () => ({
  expectSession: () => Promise.resolve(mocks.session),
}));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: async (id: string) => ({
    resolvedPermissions: { canManageOAuthApps: mocks.holders.has(id) },
    isLeader: false,
    minRank: Infinity,
  }),
}));
vi.mock("../db", () => ({
  db: {
    query: {
      oauthRegistrations: {
        findFirst: () => Promise.resolve({ userId: mocks.registrationOwner }),
      },
      oauthTestAccounts: {
        findFirst: () => Promise.resolve(mocks.testAccount ?? undefined),
      },
    },
  },
}));
vi.mock("../oauth/appStatus", () => ({
  APP_NOT_FOUND: "OAuth client not found",
  setAppStatus: mocks.steps.setAppStatus,
  setAsksForConsent: mocks.steps.setAsksForConsent,
  transferToDevDogs: mocks.steps.transferToDevDogs,
  forgetApproval: mocks.steps.forgetApproval,
}));

const { setStatus, setAsksForConsent, transferToDevDogs, forgetApproval } =
  await import("./oauthStatus");

const APP = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const HOLDER = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = USER;
  mocks.holders = new Set([HOLDER]);
  mocks.testAccount = null;
  mocks.registrationOwner = OWNER;
  for (const step of Object.values(mocks.steps)) {
    step.mockResolvedValue({ changed: true, counts: null });
  }
});

describe("setStatus, setAsksForConsent and transferToDevDogs are holder-only", () => {
  const calls: [string, () => Promise<unknown>, () => unknown][] = [
    [
      "setStatus",
      () => setStatus(APP, "in_production"),
      () => mocks.steps.setAppStatus,
    ],
    [
      "setAsksForConsent",
      () => setAsksForConsent(APP, false),
      () => mocks.steps.setAsksForConsent,
    ],
    [
      "transferToDevDogs",
      () => transferToDevDogs(APP),
      () => mocks.steps.transferToDevDogs,
    ],
  ];

  it.each(calls)(
    "%s refuses a member without the permission, even the app's owner",
    async (_name, call, step) => {
      for (const member of [USER, OWNER]) {
        mocks.session = member;
        await expect(call()).resolves.toEqual({
          ok: false,
          message: "Not authorized: canManageOAuthApps required",
        });
      }
      expect(step()).not.toHaveBeenCalled();
    },
  );

  it.each(calls)(
    "%s runs for a holder, as that actor",
    async (_name, call, step) => {
      mocks.session = HOLDER;
      await call();
      expect(step()).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: HOLDER, clientId: APP }),
      );
    },
  );

  it("setStatus refuses an unknown status or a malformed id after the permission check", async () => {
    mocks.session = HOLDER;
    await expect(setStatus(APP, "production" as never)).resolves.toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    await expect(setStatus("nope", "testing")).resolves.toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    expect(mocks.steps.setAppStatus).not.toHaveBeenCalled();
  });
});

describe("forgetApproval", () => {
  it("lets a member remove their own access", async () => {
    mocks.session = USER;
    expect(await forgetApproval(APP, USER)).toMatchObject({ ok: true });
    expect(mocks.steps.forgetApproval).toHaveBeenCalledWith({
      actorUserId: USER,
      clientId: APP,
      userId: USER,
    });
  });

  it("lets an app's owner forget one of their own test accounts", async () => {
    mocks.session = OWNER;
    mocks.testAccount = { testUserId: USER };
    expect(await forgetApproval(APP, USER)).toMatchObject({ ok: true });
    expect(mocks.steps.forgetApproval).toHaveBeenCalled();
  });

  it("refuses the owner acting on somebody who is not their test account", async () => {
    mocks.session = OWNER;
    expect(await forgetApproval(APP, USER)).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    expect(mocks.steps.forgetApproval).not.toHaveBeenCalled();
  });

  it("refuses a member who is not the app's owner, test account or not", async () => {
    mocks.session = HOLDER;
    mocks.testAccount = { testUserId: USER };
    expect(await forgetApproval(APP, USER)).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
    expect(mocks.steps.forgetApproval).not.toHaveBeenCalled();
  });

  it("refuses a malformed id", async () => {
    expect(await forgetApproval("nope", USER)).toEqual({
      ok: false,
      message: "OAuth client not found",
    });
  });

  it("refuses a signed-out caller without doing anything", async () => {
    mocks.session = "";
    expect(await forgetApproval(APP, USER)).toMatchObject({ ok: false });
    expect(mocks.steps.forgetApproval).not.toHaveBeenCalled();
  });

  it("lets a failing step that is not a refusal throw", async () => {
    mocks.session = USER;
    mocks.steps.forgetApproval.mockRejectedValueOnce(new Error("kill switch"));
    await expect(forgetApproval(APP, USER)).rejects.toThrow("kill switch");
  });
});

it("returns expected domain refusals and lets bugs throw", async () => {
  mocks.session = HOLDER;
  mocks.steps.setAppStatus.mockRejectedValueOnce(
    new ExpectedFailure("Before publishing, add a logo"),
  );
  await expect(setStatus(APP, "in_production")).resolves.toEqual({
    ok: false,
    message: "Before publishing, add a logo",
  });
  mocks.steps.setAppStatus.mockRejectedValueOnce(
    new Error("database unavailable"),
  );
  await expect(setStatus(APP, "testing")).rejects.toThrow(
    "database unavailable",
  );
});

it("does not convert a plain Error even when its message matches a refusal", async () => {
  mocks.session = HOLDER;
  const error = new Error("Before publishing, add a logo");
  mocks.steps.setAppStatus.mockRejectedValueOnce(error);
  await expect(setStatus(APP, "in_production")).rejects.toBe(error);
});
