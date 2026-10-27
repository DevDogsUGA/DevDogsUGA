import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(
  (): {
    session: string | null;
    schedule: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  } => ({ session: "officer-1", schedule: vi.fn(), cancel: vi.fn() }),
);

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("~/server/auth", () => ({
  expectSession: () =>
    fake.session
      ? Promise.resolve(fake.session)
      : Promise.reject(new Error("Session expected but not found.")),
}));
vi.mock("~/server/accountDeletion/schedule", () => ({
  SOLE_PRESIDENT_ERROR: "Grant President to someone else first",
  NOT_ALLOWED: "Not authorized: canDeleteAccounts required",
  NO_SUCH_MEMBER: "No such member",
  scheduleAccountDeletion: fake.schedule,
  cancelAccountDeletion: fake.cancel,
}));

const { requestAccountDeletion, cancelMemberDeletion } =
  await import("./accountDeletion");

beforeEach(() => {
  fake.session = "officer-1";
  fake.schedule.mockReset();
  fake.cancel.mockReset();
});

describe("requestAccountDeletion", () => {
  it("schedules with the session as actor, never a caller-supplied one", async () => {
    fake.schedule.mockResolvedValue({
      scheduledFor: new Date("2026-11-06T15:00:00Z"),
    });

    const result = await requestAccountDeletion(
      "member-1",
      "  asked by email ",
    );

    expect(fake.schedule).toHaveBeenCalledWith("member-1", "officer-1", {
      reason: "asked by email",
    });
    expect(result).toEqual({
      ok: true,
      scheduledFor: "2026-11-06T15:00:00.000Z",
    });
  });

  it("returns the sole-President refusal as a message to show", async () => {
    fake.schedule.mockRejectedValue(
      new Error("Grant President to someone else first"),
    );
    await expect(requestAccountDeletion("officer-1")).resolves.toEqual({
      ok: false,
      error: "Grant President to someone else first",
    });
  });

  it("returns the permission refusal for an officer without canDeleteAccounts", async () => {
    fake.schedule.mockRejectedValue(
      new Error("Not authorized: canDeleteAccounts required"),
    );
    await expect(requestAccountDeletion("member-1")).resolves.toEqual({
      ok: false,
      error: "Not authorized: canDeleteAccounts required",
    });
  });

  it("lets a real failure surface", async () => {
    fake.schedule.mockRejectedValue(new Error("connection reset"));
    await expect(requestAccountDeletion("member-1")).rejects.toThrow(
      "connection reset",
    );
  });

  it("refuses with no session before touching anything", async () => {
    fake.session = null;
    await expect(requestAccountDeletion("member-1")).rejects.toThrow(
      "Session expected",
    );
    expect(fake.schedule).not.toHaveBeenCalled();
  });
});

describe("cancelMemberDeletion", () => {
  it("cancels as the officer in the session", async () => {
    fake.cancel.mockResolvedValue(true);
    await expect(cancelMemberDeletion("member-1")).resolves.toEqual({
      ok: true,
    });
    expect(fake.cancel).toHaveBeenCalledWith("member-1", "officer-1");
  });

  it("says so when there is nothing to cancel", async () => {
    fake.cancel.mockResolvedValue(false);
    const result = await cancelMemberDeletion("member-1");
    expect(result.ok).toBe(false);
  });

  it("returns the permission refusal", async () => {
    fake.cancel.mockRejectedValue(
      new Error("Not authorized: canDeleteAccounts required"),
    );
    await expect(cancelMemberDeletion("member-1")).resolves.toEqual({
      ok: false,
      error: "Not authorized: canDeleteAccounts required",
    });
  });
});
