// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  updateProjectShowcase: vi.fn(),
  revalidateShowcase: vi.fn(),
}));

vi.mock("~/server/auth/access", () => ({
  authorize: mocks.authorize,
  rules: { officer: "officer-rule" },
}));
vi.mock("~/server/projects/showcaseWrite", () => ({
  updateProjectShowcase: mocks.updateProjectShowcase,
}));
vi.mock("~/server/projects/showcase", () => ({
  revalidateShowcase: mocks.revalidateShowcase,
}));

const { setProjectShowcase } = await import("./projectShowcase");

const caller = { userId: "u1", isLeader: true };
const PROJECT = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, caller });
});

describe("setProjectShowcase", () => {
  it("authorizes the officer rule, and returns its refusal without writing or revalidating", async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      message: "Not authorized.",
    });
    expect(await setProjectShowcase(PROJECT, { featured: true })).toEqual({
      ok: false,
      message: "Not authorized.",
    });
    expect(mocks.authorize).toHaveBeenCalledWith("officer-rule");
    expect(mocks.updateProjectShowcase).not.toHaveBeenCalled();
    expect(mocks.revalidateShowcase).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a project id before touching the database", async () => {
    expect(await setProjectShowcase("not-an-id", { featured: true })).toEqual({
      ok: false,
      message: "That project was not found.",
    });
    expect(mocks.updateProjectShowcase).not.toHaveBeenCalled();
  });

  it("hands the Caller, the project and the input to the rule, then refreshes the showcase", async () => {
    mocks.updateProjectShowcase.mockResolvedValue({
      changes: { featured: { from: false, to: true } },
    });
    const input = { featured: true, tagline: "Study Group Finder" };
    expect(await setProjectShowcase(PROJECT, input)).toEqual({
      ok: true,
      message: "Showcase updated.",
    });
    expect(mocks.updateProjectShowcase).toHaveBeenCalledWith(
      caller,
      PROJECT,
      input,
    );
    expect(mocks.revalidateShowcase).toHaveBeenCalledOnce();
  });

  it("says so, and refreshes nothing, when nothing changed", async () => {
    mocks.updateProjectShowcase.mockResolvedValue({ changes: {} });
    expect(await setProjectShowcase(PROJECT, { featured: true })).toEqual({
      ok: true,
      message: "Nothing to change.",
    });
    expect(mocks.revalidateShowcase).not.toHaveBeenCalled();
  });

  it("returns the rule's refusal with its field errors, without refreshing", async () => {
    mocks.updateProjectShowcase.mockRejectedValue(
      new ExpectedFailure("Check the highlighted fields.", {
        liveUrl: "Use an https:// address, or a path on this site like /docs.",
      }),
    );
    expect(
      await setProjectShowcase(PROJECT, { liveUrl: "javascript:alert(1)" }),
    ).toEqual({
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        liveUrl: "Use an https:// address, or a path on this site like /docs.",
      },
    });
    expect(mocks.revalidateShowcase).not.toHaveBeenCalled();
  });

  it("lets a bug escape rather than reporting it as a refusal", async () => {
    mocks.updateProjectShowcase.mockRejectedValue(new Error("connection lost"));
    await expect(
      setProjectShowcase(PROJECT, { featured: true }),
    ).rejects.toThrow("connection lost");
  });
});
