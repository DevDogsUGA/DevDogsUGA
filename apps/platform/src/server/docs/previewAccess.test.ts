// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";
import type { PreviewFacts } from "./previewAccess";

const mocks = vi.hoisted(() => ({
  requireDashboard: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("~/server/auth/access", () => ({
  requireDashboard: mocks.requireDashboard,
  rules: { previewDocs: (caller: Caller) => caller.flags.canPreviewDocs },
}));
vi.mock("./previewTarget", () => ({ resolvePreviewTarget: mocks.resolve }));

const { mayPreviewDocs, requireDocsPreview, requirePreviewProject } =
  await import("./previewAccess");

const caller = (canPreviewDocs = false) =>
  ({
    userId: "u-1",
    flags: { canPreviewDocs },
    isLeader: false,
    minRank: 99,
  }) as unknown as Caller;

const facts = (over: Partial<PreviewFacts> = {}): PreviewFacts => ({
  isOwner: false,
  isContributor: false,
  isReviewer: false,
  ...over,
});

const project = (over: Partial<PreviewFacts> = {}) => ({
  id: "p-1",
  slug: "demo",
  name: "Demo",
  repoId: "1234",
  facts: facts(over),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDashboard.mockResolvedValue(caller());
});

describe("who may preview a project's docs", () => {
  it("an owner, a contributor or a docs reviewer, and nobody else", () => {
    expect(mayPreviewDocs(facts({ isOwner: true }))).toBe(true);
    expect(mayPreviewDocs(facts({ isContributor: true }))).toBe(true);
    expect(mayPreviewDocs(facts({ isReviewer: true }))).toBe(true);
    expect(mayPreviewDocs(facts())).toBe(false);
  });
});

describe("the gate on one project", () => {
  it("lets each of the three in, and hands back the project", async () => {
    for (const who of ["isOwner", "isContributor", "isReviewer"] as const) {
      mocks.resolve.mockResolvedValueOnce(project({ [who]: true }));
      await expect(requirePreviewProject("demo")).resolves.toMatchObject({
        project: { slug: "demo", repoId: "1234" },
      });
    }
    expect(mocks.resolve).toHaveBeenCalledWith(caller(), "demo");
  });

  it("answers 404 to anyone else, as it does to a project that isn't there", async () => {
    mocks.resolve.mockResolvedValueOnce(project());
    await expect(requirePreviewProject("demo")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    mocks.resolve.mockResolvedValueOnce(null);
    await expect(requirePreviewProject("nope")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("needs a session first: a signed-out visitor is sent to sign in, never shown a 404 or a page", async () => {
    mocks.requireDashboard.mockRejectedValue(new Error("NEXT_REDIRECT /auth"));
    await expect(requirePreviewProject("demo")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});

describe("the gate on the landing page", () => {
  it("is for the docs reviewers: a 404 for an owner or a contributor", async () => {
    mocks.requireDashboard.mockResolvedValue(caller(false));
    await expect(requireDocsPreview()).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.requireDashboard.mockResolvedValue(caller(true));
    await expect(requireDocsPreview()).resolves.toMatchObject({
      userId: "u-1",
    });
  });
});
