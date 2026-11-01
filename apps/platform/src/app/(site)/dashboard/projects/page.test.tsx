import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";

const mocks = vi.hoisted(() => ({
  caller: null as Caller | null,
  getMyProjects: vi.fn(),
  getMyReports: vi.fn(),
  getAllProjects: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("~/server/auth/access", () => ({
  requireDashboard: async () => mocks.caller,
  rules: {
    officer: (caller: Caller) => caller.isLeader,
    reviewProjectReports: (caller: Caller) =>
      caller.flags.canReviewProjectReports,
  },
}));
vi.mock("~/server/projects/load", () => ({
  getMyProjects: mocks.getMyProjects,
  getMyReports: mocks.getMyReports,
  getAllProjects: mocks.getAllProjects,
}));
vi.mock("~/server/actions/projects", () => ({
  createProjectAction: () => Promise.resolve({ ok: true }),
  deleteReportAction: () => Promise.resolve({ ok: true }),
}));

vi.mock("~/server/actions/projectCommits", () => ({
  refreshProjectCommitsAction: () => Promise.resolve({ ok: true }),
}));

const { default: ProjectsPage } = await import("./page");

afterEach(cleanup);

const caller = (over: { isLeader?: boolean; canReview?: boolean } = {}) =>
  ({
    userId: "me",
    isLeader: over.isLeader ?? false,
    minRank: Infinity,
    flags: { canReviewProjectReports: over.canReview ?? false },
  }) as unknown as Caller;

const summary = (over: Record<string, unknown>) => ({
  id: "p",
  slug: "p",
  name: "P",
  description: null,
  status: "active",
  isOwner: false,
  isAdvisor: false,
  isContributor: false,
  ...over,
});

const report = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  projectId: "pid",
  projectName: "Porchlight",
  projectSlug: "porchlight",
  authorId: "me",
  authorName: "Me",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6,
  approvedHours: null,
  content: "word ".repeat(100),
  status: "returned",
  reviewNote: "More detail",
  reviewedByName: "Grace",
  submittedAt: new Date("2026-10-15T12:00:00Z"),
  commits: [],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.caller = caller();
  mocks.getMyProjects.mockResolvedValue([]);
  mocks.getMyReports.mockResolvedValue([]);
  mocks.getAllProjects.mockResolvedValue([]);
});

async function renderPage() {
  render(await ProjectsPage());
}

describe("the projects page", () => {
  it("splits owned projects from the ones the member contributes to or advises", async () => {
    mocks.getMyProjects.mockResolvedValue([
      summary({
        id: "a",
        slug: "porchlight",
        name: "Porchlight",
        isOwner: true,
      }),
      summary({
        id: "b",
        slug: "dogdays",
        name: "DogDays",
        isContributor: true,
      }),
      summary({
        id: "c",
        slug: "advised",
        name: "Advised",
        isAdvisor: true,
        status: "archived",
      }),
    ]);
    await renderPage();
    const owned = screen
      .getByRole("heading", { name: "Your projects" })
      .closest("section")!;
    expect(
      within(owned)
        .getByRole("link", { name: "Porchlight" })
        .getAttribute("href"),
    ).toBe("/dashboard/projects/porchlight");
    expect(within(owned).queryByText("DogDays")).toBeNull();
    const other = screen
      .getByRole("heading", { name: "Projects you contribute to or advise" })
      .closest("section")!;
    expect(within(other).getByText("DogDays")).toBeTruthy();
    expect(
      within(other).getByRole("link", { name: "Advised" }).getAttribute("href"),
    ).toBe("/dashboard/projects/advised");
    expect(within(other).getByText("Archived")).toBeTruthy();
    expect(within(other).getByText("Advisor")).toBeTruthy();
  });

  it("offers New project to everyone, with repos as owner/name", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "New project" })).toBeTruthy();
    expect(screen.getByLabelText(/Repositories/)).toBeTruthy();
  });

  it("lists the member's reports, editable until approved, with the returned note", async () => {
    mocks.getMyReports.mockResolvedValue([
      report(),
      report({
        id: "r2",
        status: "approved",
        approvedHours: 5,
        reviewNote: null,
      }),
    ]);
    await renderPage();
    const panel = screen
      .getByRole("heading", { name: "Your reports" })
      .closest("section")!;
    expect(within(panel).getAllByTestId("project-report")).toHaveLength(2);
    expect(within(panel).getByText(/Grace says/)).toBeTruthy();
    expect(within(panel).getAllByRole("link", { name: "Edit" })).toHaveLength(
      1,
    );
    expect(
      within(panel).getByRole("link", { name: "Edit" }).getAttribute("href"),
    ).toBe("/dashboard/projects/porchlight/report?report=r1");
  });

  it("shows the review queue link only to reviewers", async () => {
    await renderPage();
    expect(screen.queryByRole("link", { name: "Review queue" })).toBeNull();
    cleanup();
    mocks.caller = caller({ canReview: true });
    await renderPage();
    expect(
      screen.getByRole("link", { name: "Review queue" }).getAttribute("href"),
    ).toBe("/dashboard/reviews");
  });

  it("gives no All projects list to a member, and never reads it", async () => {
    await renderPage();
    expect(screen.queryByRole("heading", { name: "All projects" })).toBeNull();
    expect(mocks.getAllProjects).not.toHaveBeenCalled();
  });

  it("gives an officer every project, flagging pending links and orphans", async () => {
    mocks.caller = caller({ isLeader: true });
    mocks.getAllProjects.mockResolvedValue([
      {
        id: "a",
        slug: "porchlight",
        name: "Porchlight",
        status: "active",
        devdogsOwned: false,
        ownerCount: 0,
        pendingLinks: 2,
      },
      {
        id: "b",
        slug: "platform",
        name: "DevDogs Platform",
        status: "active",
        devdogsOwned: true,
        ownerCount: 0,
        pendingLinks: 0,
      },
    ]);
    await renderPage();
    const all = screen
      .getByRole("heading", { name: "All projects" })
      .closest("section")!;
    expect(within(all).getByText("2 repo links to approve")).toBeTruthy();
    // Only the project that is not DevDogs-owned is an orphan.
    expect(within(all).getAllByText("No owners")).toHaveLength(1);
    expect(within(all).getByText("DevDogs-owned")).toBeTruthy();
  });
});
