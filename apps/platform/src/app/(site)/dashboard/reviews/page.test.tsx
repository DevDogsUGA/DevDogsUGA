import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";

const mocks = vi.hoisted(() => ({
  caller: null as Caller | null,
  getReviewQueue: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("~/server/auth/access", () => {
  const rules = {
    reviewProjectReports: (caller: Caller) =>
      caller.flags.canReviewProjectReports,
  };
  return {
    rules,
    // The real gate calls forbidden() for a member the rule refuses.
    requireAccess: async (rule: (caller: Caller) => boolean) => {
      if (!rule(mocks.caller!)) throw new Error("NEXT_FORBIDDEN");
      return mocks.caller;
    },
  };
});
vi.mock("~/server/projects/load", () => ({
  getReviewQueue: mocks.getReviewQueue,
}));
vi.mock("~/server/actions/projects", () => ({
  reviewReportAction: () => Promise.resolve({ ok: true }),
}));

const { default: ReviewQueuePage } = await import("./page");

afterEach(cleanup);

const caller = (canReview: boolean) =>
  ({
    userId: "reviewer",
    isLeader: true,
    minRank: Infinity,
    flags: { canReviewProjectReports: canReview },
  }) as unknown as Caller;

const sha = "1234567".padEnd(40, "0");
const queued = {
  id: "r1",
  projectId: "p1",
  projectName: "Porchlight",
  projectSlug: "porchlight",
  authorId: "u9",
  authorName: "Grace",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  approvedHours: null,
  content: "Wired up the lamp controller. " + "word ".repeat(100),
  status: "submitted",
  reviewNote: null,
  reviewedByName: null,
  submittedAt: new Date("2026-10-15T12:00:00Z"),
  commits: [
    {
      sha,
      title: "Add the lamp controller",
      committedAt: new Date("2026-10-05T16:00:00Z"),
      files: 4,
      additions: 120,
      deletions: 8,
      repo: "DevDogsUGA/porchlight",
      url: `https://github.com/DevDogsUGA/porchlight/commit/${sha}`,
    },
  ],
  legacyPullRequests: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.caller = caller(true);
  mocks.getReviewQueue.mockResolvedValue([queued]);
});

describe("the review queue", () => {
  it("shows a reviewer each report with its cited commits and the approve and return controls", async () => {
    render(await ReviewQueuePage());
    expect(mocks.getReviewQueue).toHaveBeenCalledWith("reviewer", {
      all: true,
    });
    const card = screen.getByTestId("project-report");
    expect(
      within(card).getByText(/Grace · Oct 1, 2026 to Oct 14, 2026/),
    ).toBeTruthy();
    expect(within(card).getByText("Add the lamp controller")).toBeTruthy();
    expect(
      within(card).getByText(/Oct 5, 2026 · 4 files, \+120 −8/),
    ).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: "1234567" }).getAttribute("href"),
    ).toBe(`https://github.com/DevDogsUGA/porchlight/commit/${sha}`);
    expect(within(card).getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(
      within(card).getByRole("button", { name: "Return with note" }),
    ).toBeTruthy();
    expect(
      within(card).getByLabelText<HTMLInputElement>(/Hours to approve/).value,
    ).toBe("6.5");
  });

  it("says so when nothing is waiting", async () => {
    mocks.getReviewQueue.mockResolvedValue([]);
    render(await ReviewQueuePage());
    expect(screen.getByText("Nothing waiting for review")).toBeTruthy();
  });

  it("refuses a member without the permission, officer or not, before reading anything", async () => {
    mocks.caller = caller(false);
    await expect(ReviewQueuePage()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mocks.getReviewQueue).not.toHaveBeenCalled();
  });
});
