// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  unstable_rethrow: (err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT"))
      throw err;
  },
}));

const expectSession = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ expectSession }));

const approveAs = vi.hoisted(() => vi.fn());
const denyAs = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/asAccount", () => ({ approveAs, denyAs }));

const loadConsentRequest = vi.hoisted(() => vi.fn());
const resolveConsentAccount = vi.hoisted(() => vi.fn());
vi.mock("~/server/oauth/consentRequest", () => ({
  loadConsentRequest,
  resolveConsentAccount,
}));

import { allowConsent, cancelConsent } from "./consent";

const SELF = { actor: { kind: "self" } };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  expectSession.mockResolvedValue("user-1");
  loadConsentRequest.mockResolvedValue({
    decision: "consent",
    userId: "user-1",
    target: {},
  });
  resolveConsentAccount.mockResolvedValue(SELF);
});

describe("allowConsent", () => {
  it("approves through GoTrue as the resolved account and redirects to the app", async () => {
    approveAs.mockResolvedValue("https://app.example/cb?code=abc");
    await expect(
      allowConsent(null, form({ authorization_id: "auth-1" })),
    ).rejects.toThrow("NEXT_REDIRECT:https://app.example/cb?code=abc");
    expect(approveAs).toHaveBeenCalledWith(SELF.actor, "auth-1");
    expect(denyAs).not.toHaveBeenCalled();
  });

  it("passes the picked account id to the account check, not the approval", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    approveAs.mockResolvedValue("https://app.example/cb?code=abc");
    await expect(
      allowConsent(null, form({ authorization_id: "auth-1", accountId })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(resolveConsentAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      accountId,
    );
  });

  it("refuses when the account check says that account is not allowed", async () => {
    resolveConsentAccount.mockResolvedValue(null);
    await expect(
      allowConsent(null, form({ authorization_id: "auth-1" })),
    ).resolves.toMatch(/can't be used/);
    expect(approveAs).not.toHaveBeenCalled();
  });

  it("refuses when signed out or when the authorization is gone", async () => {
    expectSession.mockRejectedValue(new Error("no session"));
    await expect(
      allowConsent(null, form({ authorization_id: "auth-1" })),
    ).resolves.toMatch(/signed out/);

    expectSession.mockResolvedValue("user-1");
    loadConsentRequest.mockResolvedValue(null);
    await expect(
      allowConsent(null, form({ authorization_id: "auth-1" })),
    ).resolves.toMatch(/expired/);
    expect(approveAs).not.toHaveBeenCalled();
  });

  it("rejects a malformed account id before touching anything", async () => {
    await expect(
      allowConsent(
        null,
        form({ authorization_id: "auth-1", accountId: "not-a-uuid" }),
      ),
    ).resolves.toBeTypeOf("string");
    expect(loadConsentRequest).not.toHaveBeenCalled();
  });
});

describe("cancelConsent", () => {
  it("denies and redirects to the app's error=access_denied address", async () => {
    denyAs.mockResolvedValue("https://app.example/cb?error=access_denied");
    await expect(
      cancelConsent(null, form({ authorization_id: "auth-1" })),
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://app.example/cb?error=access_denied",
    );
    expect(denyAs).toHaveBeenCalledWith(SELF.actor, "auth-1");
    expect(approveAs).not.toHaveBeenCalled();
  });
});

describe("cancelConsent with an existing approval", () => {
  it("never hands the app a code from the picker's Cancel", async () => {
    loadConsentRequest.mockResolvedValue({
      decision: "pick-account",
      userId: "user-1",
      target: {},
    });
    denyAs.mockResolvedValue("https://app.example/cb?error=access_denied");
    await expect(
      cancelConsent(null, form({ authorization_id: "auth-1" })),
    ).rejects.toThrow("access_denied");
    expect(approveAs).not.toHaveBeenCalled();
  });
});
