// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  proposeDocsChange: vi.fn(),
  deps: { marker: "deps" },
}));

vi.mock("~/server/auth/access", () => ({
  authorize: mocks.authorize,
  rules: { officer: "officer-rule" },
}));
vi.mock("~/server/docs/docsDeps", () => ({ docsDeps: () => mocks.deps }));
vi.mock("~/server/docs/docsProposals", () => ({
  proposeDocsChange: mocks.proposeDocsChange,
}));

const { setProjectDocs, confirmDocsOwner } = await import("./projectDocs");

const caller = { userId: "u1", isLeader: true };
const PROJECT = "33333333-3333-4333-8333-333333333333";
const URL = "https://github.com/DevDogsUGA/DevDogsUGA/pull/9";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, caller });
});

describe.each([
  ["setProjectDocs(enable)", () => setProjectDocs(PROJECT, true), "enable"],
  ["setProjectDocs(disable)", () => setProjectDocs(PROJECT, false), "disable"],
  ["confirmDocsOwner", () => confirmDocsOwner(PROJECT), "confirm"],
] as const)("%s", (_name, call, change) => {
  it("authorizes the officer rule first, returning its refusal untouched", async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      message: "Not authorized.",
    });
    expect(await call()).toEqual({ ok: false, message: "Not authorized." });
    expect(mocks.authorize).toHaveBeenCalledWith("officer-rule");
    expect(mocks.proposeDocsChange).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a project id before touching anything", async () => {
    const bad =
      change === "confirm"
        ? await confirmDocsOwner("nope")
        : await setProjectDocs("nope", change === "enable");
    expect(bad).toEqual({ ok: false, message: "That project was not found." });
    expect(mocks.proposeDocsChange).not.toHaveBeenCalled();
  });

  it("hands the Caller, the project and the change to the rules", async () => {
    mocks.proposeDocsChange.mockResolvedValue({
      kind: "pending",
      url: URL,
      number: 9,
      recovered: false,
    });
    await call();
    expect(mocks.proposeDocsChange).toHaveBeenCalledWith(
      mocks.deps,
      caller,
      PROJECT,
      change,
    );
  });

  it("returns a refusal as a result, not a throw", async () => {
    mocks.proposeDocsChange.mockRejectedValue(
      new ExpectedFailure("Docs are paused."),
    );
    expect(await call()).toEqual({ ok: false, message: "Docs are paused." });
  });

  it("lets a bug escape", async () => {
    mocks.proposeDocsChange.mockRejectedValue(new Error("boom"));
    await expect(call()).rejects.toThrow("boom");
  });
});

describe("what the officer is told", () => {
  it("returns the pull request's address and never says docs are live", async () => {
    mocks.proposeDocsChange.mockResolvedValue({
      kind: "pending",
      url: URL,
      number: 9,
      recovered: false,
    });
    const result = await setProjectDocs(PROJECT, true);
    expect(result).toEqual({
      ok: true,
      data: { url: URL, unchanged: false },
      message: `Opened a pull request to turn docs on: ${URL}. Docs change only after it is merged.`,
    });
    expect(JSON.stringify(result)).not.toMatch(/\blive\b/i);
  });

  it("says when the pull request was already open", async () => {
    mocks.proposeDocsChange.mockResolvedValue({
      kind: "pending",
      url: URL,
      number: 9,
      recovered: true,
    });
    const result = await confirmDocsOwner(PROJECT);
    expect(result).toMatchObject({ ok: true, data: { url: URL } });
    expect(result.ok && result.message).toBe(
      `A pull request to confirm the new owner is already open: ${URL}`,
    );
  });

  it("passes on that nothing changed, with no address", async () => {
    mocks.proposeDocsChange.mockResolvedValue({
      kind: "unchanged",
      message: "Docs are already turned on.",
    });
    expect(await setProjectDocs(PROJECT, true)).toEqual({
      ok: true,
      message: "Docs are already turned on.",
    });
  });
});
