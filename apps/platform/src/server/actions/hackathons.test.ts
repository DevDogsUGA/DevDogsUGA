// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  authorizeSession: vi.fn(),
  submitHackathon: vi.fn(),
  decideHackathon: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("~/server/auth/access", () => ({
  authorize: mocks.authorize,
  authorizeSession: mocks.authorizeSession,
  rules: { officer: "officer-rule" },
}));
vi.mock("~/server/hackathons/submit", () => ({
  submitHackathon: mocks.submitHackathon,
  decideHackathon: mocks.decideHackathon,
}));

const { decideHackathonAction, submitHackathonAction } =
  await import("./hackathons");

const caller = { userId: "u1", isLeader: false };
const ID = "33333333-3333-4333-8333-333333333333";
const form = (fields: Record<string, string | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorizeSession.mockResolvedValue({ ok: true, caller });
  mocks.authorize.mockResolvedValue({ ok: true, caller });
});

describe("submitHackathonAction", () => {
  it("returns the session refusal without reading the form or writing", async () => {
    mocks.authorizeSession.mockResolvedValue({
      ok: false,
      message: "Sign in.",
    });
    expect(await submitHackathonAction(form({ url: "u", name: "n" }))).toEqual({
      ok: false,
      message: "Sign in.",
    });
    expect(mocks.submitHackathon).not.toHaveBeenCalled();
  });

  it("hands the Caller and parsed fields to the rule, and revalidates the page", async () => {
    mocks.submitHackathon.mockResolvedValue({ status: "created", id: "h" });
    const result = await submitHackathonAction(
      form({
        url: "https://h.example.com",
        name: "Hack",
        startsOn: "2026-11-02",
        extra: "ignored",
      }),
    );
    expect(mocks.submitHackathon).toHaveBeenCalledWith(caller, {
      url: "https://h.example.com",
      name: "Hack",
      startsOn: "2026-11-02",
    });
    expect(result).toEqual({
      ok: true,
      data: { status: "created", id: "h" },
      message: "Hackathon submitted. An officer will review it.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/hackathons");
  });

  it("answers `exists` as a success that says where it stands, in the member's words", async () => {
    mocks.submitHackathon.mockResolvedValue({
      status: "exists",
      id: "h",
      approval: "approved",
      linkable: true,
    });
    expect(
      await submitHackathonAction(form({ url: "u", name: "n" })),
    ).toMatchObject({
      ok: true,
      data: { status: "exists", linkable: true },
      message: "That hackathon is already listed.",
    });
    mocks.submitHackathon.mockResolvedValue({
      status: "exists",
      id: "h",
      approval: "pending",
      linkable: false,
    });
    expect(
      await submitHackathonAction(form({ url: "u", name: "n" })),
    ).toMatchObject({
      ok: true,
      message: "That hackathon is already waiting for review.",
    });
  });

  it("turns a refusal into a failure with its field errors, and does not revalidate", async () => {
    mocks.submitHackathon.mockRejectedValue(
      new ExpectedFailure("Check the highlighted fields.", { url: "Bad." }),
    );
    expect(await submitHackathonAction(form({ url: "x", name: "n" }))).toEqual({
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { url: "Bad." },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets a bug escape", async () => {
    mocks.submitHackathon.mockRejectedValue(new Error("db down"));
    await expect(
      submitHackathonAction(form({ url: "u", name: "n" })),
    ).rejects.toThrow("db down");
  });

  it("refuses a form that is too large or missing a field before the rule", async () => {
    for (const fields of [
      { name: "n" },
      { url: "x".repeat(4097), name: "n" },
      { url: "u", name: "n".repeat(1001) },
    ]) {
      expect(await submitHackathonAction(form(fields))).toEqual({
        ok: false,
        message: "That hackathon is invalid.",
      });
    }
    expect(mocks.submitHackathon).not.toHaveBeenCalled();
  });
});

describe("decideHackathonAction", () => {
  it("authorizes the officer rule first", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "Not found." });
    expect(await decideHackathonAction(ID, "approved")).toEqual({
      ok: false,
      message: "Not found.",
    });
    expect(mocks.authorize).toHaveBeenCalledWith("officer-rule");
    expect(mocks.decideHackathon).not.toHaveBeenCalled();
  });

  it("refuses a malformed id or decision before the rule", async () => {
    expect(await decideHackathonAction("nope", "approved")).toEqual({
      ok: false,
      message: "That decision is invalid.",
    });
    expect(await decideHackathonAction(ID, "maybe" as never)).toEqual({
      ok: false,
      message: "That decision is invalid.",
    });
    expect(mocks.decideHackathon).not.toHaveBeenCalled();
  });

  it("approves and declines, naming the hackathon, and revalidates", async () => {
    mocks.decideHackathon.mockResolvedValue({ name: "Great Hack" });
    expect(await decideHackathonAction(ID, "approved")).toEqual({
      ok: true,
      message: "Great Hack approved.",
    });
    expect(mocks.decideHackathon).toHaveBeenLastCalledWith(
      caller,
      ID,
      "approved",
    );
    expect(await decideHackathonAction(ID, "declined")).toEqual({
      ok: true,
      message: "Great Hack declined.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("reports an already-decided submission as a failure without revalidating", async () => {
    mocks.decideHackathon.mockRejectedValue(
      new ExpectedFailure("That hackathon was already decided."),
    );
    expect(await decideHackathonAction(ID, "approved")).toEqual({
      ok: false,
      message: "That hackathon was already decided.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
