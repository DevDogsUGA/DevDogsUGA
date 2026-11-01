import { beforeEach, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({ find: vi.fn(), transaction: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: {
    query: { oauthRegistrations: { findFirst: mocks.find } },
    transaction: mocks.transaction,
  },
}));
vi.mock("~/server/db/schema", () => ({
  auditEvents: {},
  oauthRegistrations: {},
}));
import {
  APP_NOT_FOUND,
  setAppStatus,
  setAsksForConsent,
  transferToDevDogs,
  forgetApproval,
} from "./appStatus";

const input = { actorUserId: "actor", clientId: "client" };
beforeEach(() => vi.clearAllMocks());

it.each([
  ["status", () => setAppStatus({ ...input, status: "in_production" })],
  ["consent", () => setAsksForConsent({ ...input, asksForConsent: false })],
  ["transfer", () => transferToDevDogs(input)],
  ["forget approval", () => forgetApproval({ ...input, userId: "member" })],
])(
  "throws a typed not-found refusal for %s, retaining Error compatibility",
  async (_name, action) => {
    mocks.find.mockResolvedValue(undefined);
    await expect(action()).rejects.toBeInstanceOf(ExpectedFailure);
    await expect(action()).rejects.toThrow(APP_NOT_FOUND);
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);
it("throws a typed publishing refusal with the existing message", async () => {
  mocks.find.mockResolvedValue({
    status: "testing",
    logoPath: null,
    homepageUrl: "https://example.com",
    privacyPolicyUrl: "https://example.com/privacy",
  });
  const result = setAppStatus({ ...input, status: "in_production" });
  await expect(result).rejects.toBeInstanceOf(ExpectedFailure);
  await expect(result).rejects.toThrow("Before publishing, add a logo");
});
it.each([
  ["member", "in_production", "Only a DevDogs app can skip the consent screen"],
  [null, "testing", "An app must be In production to skip the consent screen"],
])(
  "throws a typed consent refusal for owner %s and status %s",
  async (userId, status, message) => {
    mocks.find.mockResolvedValue({ userId, status, asksForConsent: true });
    const result = setAsksForConsent({ ...input, asksForConsent: false });
    await expect(result).rejects.toBeInstanceOf(ExpectedFailure);
    await expect(result).rejects.toThrow(message);
  },
);
it("preserves unexpected database errors", async () => {
  const error = new Error("Database unavailable");
  mocks.find.mockRejectedValue(error);
  await expect(transferToDevDogs(input)).rejects.toBe(error);
});
