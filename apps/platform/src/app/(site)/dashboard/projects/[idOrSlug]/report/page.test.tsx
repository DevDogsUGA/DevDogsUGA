import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";

const mocks = vi.hoisted(() => ({
  caller: null as Caller | null,
  findProjectId: vi.fn(),
  getProjectDetail: vi.fn(),
  getRelation: vi.fn(),
  getReport: vi.fn(),
  getEligibleCommits: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("~/server/auth/access", () => ({
  requireDashboard: async () => mocks.caller,
  rules: { officer: (caller: Caller) => caller.isLeader },
}));
vi.mock("~/server/projects/load", () => ({
  findProjectId: mocks.findProjectId,
  getProjectDetail: mocks.getProjectDetail,
  getRelation: mocks.getRelation,
  getReport: mocks.getReport,
  getEligibleCommits: mocks.getEligibleCommits,
}));
vi.mock("~/server/actions/projects", () => ({
  fileReportAction: () => Promise.resolve({ ok: true }),
}));

const { default: ReportPage } = await import("./page");

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const REPORT = "33333333-3333-4333-8333-333333333333";
const caller = (isLeader = false) =>
  ({ userId: ME, isLeader, minRank: Infinity, flags: {} }) as unknown as Caller;

const project = (over: Record<string, unknown> = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "porchlight",
  name: "Porchlight",
  status: "active",
  ...over,
});
const commit = {
  sha: "a".repeat(40),
  title: "Add the lamp",
  committedAt: new Date("2026-10-05T16:00:00Z"),
  day: "2026-10-05",
  files: 2,
  additions: 10,
  deletions: 1,
  repo: "DevDogsUGA/porchlight",
  url: "https://github.com/DevDogsUGA/porchlight/commit/x",
  selected: false,
};
const existing = (over: Record<string, unknown> = {}) => ({
  id: REPORT,
  authorId: ME,
  projectId: "22222222-2222-4222-8222-222222222222",
  status: "returned",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6,
  content: "word ".repeat(100),
  legacyPullRequests: [],
  ...over,
});

async function renderPage(report?: string) {
  render(
    await ReportPage({
      params: Promise.resolve({ idOrSlug: "porchlight" }),
      searchParams: Promise.resolve({ report }),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.caller = caller();
  mocks.findProjectId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
  mocks.getProjectDetail.mockResolvedValue(project());
  mocks.getRelation.mockResolvedValue({
    isOwner: false,
    isContributor: true,
    isAdvisor: false,
  });
  mocks.getReport.mockResolvedValue(null);
  mocks.getEligibleCommits.mockResolvedValue([commit]);
});

describe("the report page", () => {
  it("gives a contributor the form, with their commits to choose from", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "Submit report" })).toBeTruthy();
    expect(mocks.getEligibleCommits).toHaveBeenCalledWith(
      ME,
      "22222222-2222-4222-8222-222222222222",
      null,
    );
  });

  it("refuses an officer, even one with commits (Q125)", async () => {
    mocks.caller = caller(true);
    await renderPage();
    expect(screen.getByText("You cannot file a report here")).toBeTruthy();
    expect(screen.getByText(/handled separately/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit report" })).toBeNull();
    expect(mocks.getEligibleCommits).not.toHaveBeenCalled();
  });

  it("refuses a member with no commits in the project's repos", async () => {
    mocks.getRelation.mockResolvedValue({
      isOwner: true,
      isContributor: false,
      isAdvisor: false,
    });
    await renderPage();
    expect(screen.getByText(/commits in this project/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit report" })).toBeNull();
  });

  it("refuses an archived project", async () => {
    mocks.getProjectDetail.mockResolvedValue(project({ status: "archived" }));
    await renderPage();
    expect(
      screen.getByText("Reports are taken only for active projects."),
    ).toBeTruthy();
  });

  it("edits a returned report of their own", async () => {
    mocks.getReport.mockResolvedValue(existing());
    await renderPage(REPORT);
    expect(
      screen.getByRole("button", { name: "Resubmit report" }),
    ).toBeTruthy();
    expect(mocks.getEligibleCommits).toHaveBeenCalledWith(
      ME,
      "22222222-2222-4222-8222-222222222222",
      REPORT,
    );
  });

  it("locks an approved report", async () => {
    mocks.getReport.mockResolvedValue(existing({ status: "approved" }));
    await renderPage(REPORT);
    expect(screen.getByText(/can no longer be changed/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Resubmit report" }),
    ).toBeNull();
  });

  it("leaves a report with pull-request evidence as it is", async () => {
    mocks.getReport.mockResolvedValue(
      existing({ legacyPullRequests: [{ id: "c1" }] }),
    );
    await renderPage(REPORT);
    expect(screen.getByText("This report cites pull requests")).toBeTruthy();
  });

  it("ignores another member's report id and starts a new one", async () => {
    mocks.getReport.mockResolvedValue(existing({ authorId: "someone-else" }));
    await renderPage(REPORT);
    expect(screen.getByRole("button", { name: "Submit report" })).toBeTruthy();
    expect(mocks.getEligibleCommits).toHaveBeenCalledWith(
      ME,
      "22222222-2222-4222-8222-222222222222",
      null,
    );
  });

  it("is a 404 for an unknown project", async () => {
    mocks.findProjectId.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.findProjectId.mockResolvedValue(
      "22222222-2222-4222-8222-222222222222",
    );
    mocks.getProjectDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
