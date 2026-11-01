import { beforeEach, describe, expect, it, vi } from "vitest";

/** `setMyBadgeHidden`: the member's own switch. It returns an ActionResult. */

const mocks = vi.hoisted(() => ({
  access: null as { ok: boolean; message?: string; caller?: unknown } | null,
  setHidden: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("~/server/auth/access", () => ({
  authorize: vi.fn(),
  authorizeSession: () => Promise.resolve(mocks.access),
  rules: { officer: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("~/server/badges/manual", () => ({
  awardManualBadge: vi.fn(),
  withdrawBadge: vi.fn(),
  setBadgeHidden: mocks.setHidden,
}));
vi.mock("~/server/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
vi.mock("~/server/db/schema", () => ({
  profiles: { handle: "handle", userId: "userId" },
}));

const { setMyBadgeHidden } = await import("./badges");

const INPUT = { badgeId: "mentor", workshopDefinitionId: null, hidden: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = { ok: true, caller: { userId: "member-1" } };
  mocks.setHidden.mockResolvedValue(2);
});

describe("setMyBadgeHidden", () => {
  it("hides the member's own badge and says so", async () => {
    expect(await setMyBadgeHidden(INPUT)).toEqual({
      ok: true,
      data: { changed: 2 },
      message: "Badge hidden from your public profile.",
    });
    expect(mocks.setHidden).toHaveBeenCalledWith(
      "member-1",
      "mentor",
      null,
      true,
    );
  });

  it("says so when showing it again", async () => {
    expect(await setMyBadgeHidden({ ...INPUT, hidden: false })).toMatchObject({
      ok: true,
      message: "Badge shown on your public profile.",
    });
  });

  it("returns an input the switch never sends as a failure", async () => {
    expect(await setMyBadgeHidden({ ...INPUT, badgeId: "" })).toEqual({
      ok: false,
      message: "That request is invalid.",
    });
    expect(mocks.setHidden).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    mocks.access = { ok: false, message: "Session expected but not found." };
    expect(await setMyBadgeHidden(INPUT)).toEqual({
      ok: false,
      message: "Session expected but not found.",
    });
    expect(mocks.setHidden).not.toHaveBeenCalled();
  });

  it("lets a real failure throw", async () => {
    mocks.setHidden.mockRejectedValue(new Error("connection reset"));
    await expect(setMyBadgeHidden(INPUT)).rejects.toThrow("connection reset");
  });
});
