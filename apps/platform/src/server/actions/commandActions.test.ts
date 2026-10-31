import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  award: vi.fn(),
  withdraw: vi.fn(),
  find: vi.fn(),
  add: vi.fn(),
  createInvite: vi.fn(),
}));
vi.mock("~/server/auth/access", () => ({
  authorize: mocks.authorize,
  authorizeSession: mocks.authorize,
  rules: { officer: vi.fn(), manageAttendance: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("~/server/badges/manual", () => ({
  awardManualBadge: mocks.award,
  withdrawBadge: mocks.withdraw,
  setBadgeHidden: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
vi.mock("~/server/db/schema", () => ({
  profiles: { handle: "handle", userId: "userId" },
}));
vi.mock("~/env", () => ({ env: { BASE_URL: "https://example.com" } }));
vi.mock("~/server/attendance/getOfficerMeeting", () => ({
  getOfficerAttendanceMeeting: vi.fn(),
}));
vi.mock("~/server/email/send", () => ({ sendTemplate: vi.fn() }));
vi.mock("~/server/attendance/officerAttendance", () => ({
  findAccountByEmail: mocks.find,
  addOfficerAttendance: mocks.add,
  createAttendanceInvite: mocks.createInvite,
  cancelAttendanceInvite: vi.fn(),
  resendAttendanceInvite: vi.fn(),
  removeAttendance: vi.fn(),
  MAX_REMOVAL_REASON: 500,
}));
import { awardBadge, withdrawBadgeAward } from "./badges";
import {
  findAttendee,
  addAttendee,
  inviteAttendee,
  resendInvite,
  cancelInvite,
  removeAttendee,
} from "./officerAttendance";
const ID = "11111111-1111-4111-8111-111111111111";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, caller: { userId: ID } });
});
it("returns authorization failures before parsing or doing domain work", async () => {
  mocks.authorize.mockResolvedValue({ ok: false, message: "Not authorized." });
  for (const action of [
    awardBadge,
    withdrawBadgeAward,
    findAttendee,
    addAttendee,
    inviteAttendee,
    resendInvite,
    cancelInvite,
    removeAttendee,
  ]) {
    expect(await action(new FormData())).toMatchObject({
      ok: false,
      message: expect.any(String) as unknown,
    });
  }
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.award).not.toHaveBeenCalled();
});
it("returns badge success and expected domain refusals", async () => {
  mocks.award
    .mockResolvedValueOnce({ status: "awarded" })
    .mockResolvedValueOnce({ status: "self_award" });
  const data = form({ userId: ID, badgeId: "helper", citation: "Helped" });
  expect(await awardBadge(data)).toEqual({
    ok: true,
    message: "Badge awarded.",
  });
  expect(await awardBadge(data)).toEqual({
    ok: false,
    message: "You cannot award yourself a badge.",
  });
  mocks.withdraw.mockResolvedValue({ status: "withdrawn", userId: ID });
  expect(
    await withdrawBadgeAward(form({ awardId: ID, reason: "Mistake" })),
  ).toEqual({ ok: true, message: "Badge withdrawn." });
});
it("returns lookup decision data for accounts and invites", async () => {
  mocks.find
    .mockResolvedValueOnce({ status: "account", name: "Member", userId: ID })
    .mockResolvedValueOnce({ status: "missing" });
  expect(await findAttendee(form({ myId: "member" }))).toEqual({
    ok: true,
    data: { status: "confirm", myId: "member", name: "Member" },
  });
  expect(await findAttendee(form({ myId: "member" }))).toEqual({
    ok: true,
    data: { status: "invite", myId: "member", email: "member@uga.edu" },
  });
});
it("keeps duplicate attendance success and account-race refusal messages", async () => {
  mocks.find.mockResolvedValue({
    status: "account",
    name: "Member",
    userId: ID,
  });
  mocks.add.mockResolvedValue({ status: "duplicate" });
  const data = form({ meetingId: ID, myId: "member" });
  expect(await addAttendee(data)).toEqual({
    ok: true,
    message: "Member was already recorded.",
  });
  mocks.createInvite.mockResolvedValue({ status: "has_account" });
  expect(await inviteAttendee(data)).toEqual({
    ok: false,
    message: "That address now has an account; look it up again.",
  });
});
