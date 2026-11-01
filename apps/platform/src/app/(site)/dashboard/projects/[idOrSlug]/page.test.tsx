import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "~/server/auth/access";
import type {
  ProjectDetail,
  ProjectRelation,
  ProjectReportView,
  ShowcaseFields,
} from "~/server/projects/load";

const mocks = vi.hoisted(() => ({
  caller: null as Caller | null,
  findProjectId: vi.fn(),
  getProjectDetail: vi.fn(),
  getRelation: vi.fn(),
  getReviewQueue: vi.fn(),
  getMyReports: vi.fn(),
  searchMembers: vi.fn(),
  getShowcaseFields: vi.fn(),
  getTeamCandidates: vi.fn(),
  getSubmittableHackathons: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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
  findProjectId: mocks.findProjectId,
  getProjectDetail: mocks.getProjectDetail,
  getRelation: mocks.getRelation,
  getReviewQueue: mocks.getReviewQueue,
  getMyReports: mocks.getMyReports,
  searchMembers: mocks.searchMembers,
  getShowcaseFields: mocks.getShowcaseFields,
  getTeamCandidates: mocks.getTeamCandidates,
}));
vi.mock("~/server/hackathons/load", () => ({
  getSubmittableHackathons: mocks.getSubmittableHackathons,
}));
vi.mock("~/server/actions/submissions", () => {
  const action = () => Promise.resolve({ ok: true });
  return {
    recordSubmission: action,
    updateSubmission: action,
    deleteSubmission: action,
  };
});
vi.mock("~/server/actions/projectShowcase", () => ({
  setProjectShowcase: () => Promise.resolve({ ok: true }),
}));
vi.mock("~/server/actions/projects", () => {
  const action = () => Promise.resolve({ ok: true });
  return {
    addOwnerAction: action,
    archiveProjectAction: action,
    decideRepoLinkAction: action,
    deleteProjectAction: action,
    deleteReportAction: action,
    makeDevdogsOwnedAction: action,
    removeOwnerAction: action,
    setAdvisorAction: action,
    unarchiveProjectAction: action,
    unlinkRepoAction: action,
    linkRepoAction: action,
    updateProjectAction: action,
    reviewReportAction: action,
  };
});
vi.mock("~/server/actions/projectCommits", () => ({
  refreshProjectCommitsAction: () => Promise.resolve({ ok: true }),
}));

const { default: ProjectPage } = await import("./page");

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const caller = (
  over: { isLeader?: boolean; canReview?: boolean } = {},
): Caller => ({
  userId: ME,
  isLeader: over.isLeader ?? false,
  minRank: Infinity,
  flags: {
    canReviewProjectReports: over.canReview ?? false,
  } as Caller["flags"],
});

const repo = (over: Partial<ProjectDetail["repos"][number]> = {}) => ({
  githubRepoId: "11",
  owner: "DevDogsUGA",
  name: "porchlight",
  url: "https://github.com/DevDogsUGA/porchlight",
  defaultBranch: "main",
  health: "available" as const,
  unavailableSince: null,
  lastCheckedAt: new Date("2026-10-30T16:00:00Z"),
  approval: "approved" as const,
  ...over,
});

const detail = (over: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: "22222222-2222-4222-8222-222222222222",
  slug: "porchlight",
  name: "Porchlight",
  description: "Neighborhood lights",
  tags: ["web"],
  status: "active",
  devdogsOwned: false,
  advisorId: null,
  advisorName: null,
  repos: [repo()],
  owners: [{ userId: "owner-1", name: "Ada", handle: "ada" }],
  submissions: [],
  ...over,
});

const relation = (over: Partial<ProjectRelation> = {}): ProjectRelation => ({
  isOwner: false,
  isContributor: false,
  isAdvisor: false,
  ...over,
});

const queued = (): ProjectReportView => ({
  id: "r-1",
  projectId: "22222222-2222-4222-8222-222222222222",
  projectName: "Porchlight",
  projectSlug: "porchlight",
  authorId: "u-9",
  authorName: "Grace",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  hours: 6.5,
  approvedHours: null,
  content: "Built the lamp controller " + "word ".repeat(100),
  status: "submitted",
  reviewNote: null,
  reviewedByName: null,
  submittedAt: new Date("2026-10-15T12:00:00Z"),
  commits: [],
  legacyPullRequests: [],
});

const showcase = (): ShowcaseFields => ({
  featured: true,
  inSwitcher: false,
  displayOrder: 2,
  tagline: "Neighborhood lights",
  yearLabel: null,
  note: null,
  showcaseLabel: null,
  liveUrl: null,
  liveLabel: null,
  switcherUrl: null,
  switcherBlurb: null,
  iconKey: null,
  colorKey: null,
  contributionMode: null,
});

const submission = () => ({
  id: "s1",
  hackathon: "HackGT",
  url: "https://devpost.com/s1",
  result: "Winner",
  team: ["Ada", "Grace"],
  teamUserIds: ["owner-1", "u-grace"],
});

async function renderPage(find?: string) {
  render(
    await ProjectPage({
      params: Promise.resolve({ idOrSlug: "porchlight" }),
      searchParams: Promise.resolve({ find }),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.caller = caller();
  mocks.findProjectId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
  mocks.getProjectDetail.mockResolvedValue(detail());
  mocks.getRelation.mockResolvedValue(relation());
  mocks.getReviewQueue.mockResolvedValue([]);
  mocks.getMyReports.mockResolvedValue([]);
  mocks.searchMembers.mockResolvedValue([]);
  mocks.getShowcaseFields.mockResolvedValue(showcase());
  mocks.getTeamCandidates.mockResolvedValue([
    { userId: "owner-1", name: "Ada", handle: "ada" },
    { userId: "u-grace", name: "Grace", handle: "grace" },
  ]);
  mocks.getSubmittableHackathons.mockResolvedValue([
    { id: "h-1", name: "HackGT", when: null },
  ]);
});

const button = (name: string | RegExp) =>
  screen.queryByRole("button", { name });

describe("the project page for a member with no relation", () => {
  it("shows the details, repos with their health, owners and submissions, read-only", async () => {
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        submissions: [
          {
            id: "s1",
            hackathon: "HackGT",
            url: "https://devpost.com/s1",
            result: "Winner",
            team: ["Ada", "Grace"],
            teamUserIds: ["owner-1", "u-grace"],
          },
        ],
      }),
    );
    await renderPage();
    expect(screen.getByRole("heading", { name: "Porchlight" })).toBeTruthy();
    expect(screen.getByText("Neighborhood lights")).toBeTruthy();
    expect(screen.getByText("DevDogsUGA/porchlight")).toBeTruthy();
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("HackGT")).toBeTruthy();
    expect(screen.getByText("Ada, Grace")).toBeTruthy();
    // No controls of any kind.
    expect(screen.queryByText("Edit project")).toBeNull();
    expect(button("Refresh commits")).toBeNull();
    expect(button("Unlink")).toBeNull();
    expect(button("Archive project")).toBeNull();
    expect(button("Make DevDogs-owned")).toBeNull();
    expect(screen.queryByRole("link", { name: "File a report" })).toBeNull();
  });

  it("marks an unavailable repo and says its commits still count", async () => {
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        repos: [
          repo({
            health: "unavailable",
            unavailableSince: new Date("2026-10-20T16:00:00Z"),
          }),
        ],
      }),
    );
    await renderPage();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/Synced commits still count/)).toBeTruthy();
  });

  it("explains an archived project", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ status: "archived" }));
    await renderPage();
    expect(screen.getByText("This project is archived")).toBeTruthy();
  });
});

describe("the project page for an owner", () => {
  beforeEach(() => {
    mocks.getRelation.mockResolvedValue(relation({ isOwner: true }));
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        repos: [repo(), repo({ githubRepoId: "12", name: "second" })],
        owners: [
          { userId: ME, name: "Me", handle: "me" },
          { userId: "owner-2", name: "Ada", handle: "ada" },
        ],
      }),
    );
  });

  it("offers the Draft, repo links, owners and lifecycle, but no officer controls", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Edit project" })).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>("Project name"),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Unlink" })).toHaveLength(2);
    expect(button("Link repository")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(button("Archive project")).toBeTruthy();
    expect(button("Delete project")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Refresh commits" }),
    ).toHaveLength(2);
    expect(button("Approve")).toBeNull();
    expect(button("Make DevDogs-owned")).toBeNull();
    expect(screen.queryByRole("link", { name: "File a report" })).toBeNull();
  });

  it("offers Restore, not Archive, on an archived project", async () => {
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        status: "archived",
        owners: [{ userId: ME, name: "Me", handle: "me" }],
      }),
    );
    await renderPage();
    expect(button("Restore project")).toBeTruthy();
    expect(button("Archive project")).toBeNull();
  });

  it("searches members for a co-owner and offers Make owner only to the linked", async () => {
    mocks.searchMembers.mockResolvedValue([
      { userId: "m1", name: "Linus", handle: "linus", linked: true },
      { userId: "m2", name: "Nolink", handle: "nolink", linked: false },
    ]);
    await renderPage("li");
    expect(screen.getAllByRole("button", { name: "Make owner" })).toHaveLength(
      1,
    );
    expect(screen.getByText("No linked GitHub")).toBeTruthy();
    expect(button("Make advisor")).toBeNull();
  });

  it("does not offer deleting a DevDogs-owned project", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ devdogsOwned: true }));
    await renderPage();
    expect(button("Delete project")).toBeNull();
  });
});

describe("the project page for a contributor", () => {
  beforeEach(() => {
    mocks.getRelation.mockResolvedValue(relation({ isContributor: true }));
  });

  it("offers File a report and a commit refresh, and nothing editable", async () => {
    await renderPage();
    expect(
      screen.getByRole("link", { name: "File a report" }).getAttribute("href"),
    ).toBe("/dashboard/projects/porchlight/report");
    expect(button("Refresh commits")).toBeTruthy();
    expect(screen.queryByText("Edit project")).toBeNull();
    expect(button("Unlink")).toBeNull();
  });

  it("does not offer a report on an archived project", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ status: "archived" }));
    await renderPage();
    expect(screen.queryByRole("link", { name: "File a report" })).toBeNull();
  });

  it("lists their own reports with Edit and Delete until they are approved", async () => {
    mocks.getMyReports.mockResolvedValue([
      { ...queued(), authorId: ME, id: "mine" },
      {
        ...queued(),
        authorId: ME,
        id: "done",
        status: "approved",
        approvedHours: 5,
      },
      { ...queued(), id: "elsewhere", projectId: "other" },
    ]);
    await renderPage();
    const mine = screen
      .getByRole("heading", { name: "Your reports on this project" })
      .closest("section")!;
    expect(within(mine).getAllByTestId("project-report")).toHaveLength(2);
    expect(within(mine).getAllByRole("link", { name: "Edit" })).toHaveLength(1);
    expect(
      within(mine).getByRole("link", { name: "Edit" }).getAttribute("href"),
    ).toBe("/dashboard/projects/porchlight/report?report=mine");
    expect(
      within(mine).getAllByRole("button", { name: "Delete" }),
    ).toHaveLength(1);
  });

  it("gives a legacy report with PR evidence no Edit and marks the evidence", async () => {
    mocks.getMyReports.mockResolvedValue([
      {
        ...queued(),
        authorId: ME,
        legacyPullRequests: [
          {
            id: "c1",
            repo: "DevDogsUGA/porchlight",
            number: 4,
            title: "Lamp",
            url: "https://github.com/DevDogsUGA/porchlight/pull/4",
            mergedAt: new Date("2026-10-05T12:00:00Z"),
          },
        ],
      },
    ]);
    await renderPage();
    expect(screen.getByText("Legacy evidence")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});

describe("the project page for an officer", () => {
  beforeEach(() => {
    mocks.caller = caller({ isLeader: true });
  });

  it("gives officer controls, but no report filing even for a contributor", async () => {
    mocks.getRelation.mockResolvedValue(relation({ isContributor: true }));
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        advisorId: "adv",
        advisorName: "Linus",
        repos: [
          repo(),
          repo({ githubRepoId: "13", name: "acme-fork", approval: "pending" }),
        ],
      }),
    );
    await renderPage();
    expect(button("Approve")).toBeTruthy();
    expect(button("Decline")).toBeTruthy();
    expect(button("Clear advisor")).toBeTruthy();
    expect(button("Make DevDogs-owned")).toBeTruthy();
    expect(screen.getByText("Waiting for an officer")).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>(/Find a member/),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "File a report" })).toBeNull();
    // An officer is not an owner of an ordinary project.
    expect(screen.queryByText("Edit project")).toBeNull();
    expect(button("Unlink")).toBeNull();
    expect(button("Archive project")).toBeNull();
  });

  it("edits a DevDogs-owned project through the record rule, with no owner rows", async () => {
    mocks.getProjectDetail.mockResolvedValue(
      detail({ devdogsOwned: true, owners: [] }),
    );
    await renderPage();
    expect(screen.getByRole("heading", { name: "Edit project" })).toBeTruthy();
    expect(screen.getByText("DevDogs-owned")).toBeTruthy();
    expect(screen.getByText("Owned by the officers")).toBeTruthy();
    expect(button("Make DevDogs-owned")).toBeNull();
    expect(button("Delete project")).toBeNull();
  });

  it("flags an orphan and lets the officer find an owner and an advisor", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ owners: [] }));
    mocks.searchMembers.mockResolvedValue([
      { userId: "m1", name: "Linus", handle: "linus", linked: true },
    ]);
    await renderPage("lin");
    expect(screen.getByText("This project has no owners")).toBeTruthy();
    expect(button("Make owner")).toBeTruthy();
    expect(button("Make advisor")).toBeTruthy();
  });

  it("restores an archived project", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ status: "archived" }));
    await renderPage();
    expect(button("Restore project")).toBeTruthy();
  });
});

describe("the project page for a reviewer", () => {
  it("shows the advisor the reports waiting on them", async () => {
    mocks.getRelation.mockResolvedValue(relation({ isAdvisor: true }));
    mocks.getReviewQueue.mockResolvedValue([queued()]);
    await renderPage();
    expect(mocks.getReviewQueue).toHaveBeenCalledWith(ME, {
      all: false,
      projectId: "22222222-2222-4222-8222-222222222222",
    });
    const panel = screen
      .getByRole("heading", { name: "Reports to review" })
      .closest("section")!;
    expect(within(panel).getByText(/Built the lamp controller/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(
      within(panel).getByRole("button", { name: "Return with note" }),
    ).toBeTruthy();
  });

  it("shows a holder of reviewProjectReports the queue for any project", async () => {
    mocks.caller = caller({ canReview: true });
    mocks.getReviewQueue.mockResolvedValue([queued()]);
    await renderPage();
    expect(mocks.getReviewQueue).toHaveBeenCalledWith(ME, {
      all: true,
      projectId: "22222222-2222-4222-8222-222222222222",
    });
    expect(
      screen.getByRole("heading", { name: "Reports to review" }),
    ).toBeTruthy();
  });

  it("shows nobody else the review queue, and never reads it", async () => {
    mocks.getRelation.mockResolvedValue(
      relation({ isOwner: true, isContributor: true }),
    );
    await renderPage();
    expect(
      screen.queryByRole("heading", { name: "Reports to review" }),
    ).toBeNull();
    expect(mocks.getReviewQueue).not.toHaveBeenCalled();
  });
});

describe("what a member may not see", () => {
  it("is a 404 for an unknown slug or UUID", async () => {
    mocks.findProjectId.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 when the project row is gone", async () => {
    mocks.getProjectDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows an archived project to any signed-in member", async () => {
    mocks.getProjectDetail.mockResolvedValue(detail({ status: "archived" }));
    await renderPage();
    expect(screen.getByRole("heading", { name: "Porchlight" })).toBeTruthy();
  });
});

describe("the submissions panel", () => {
  const panel = () =>
    screen
      .getByRole("heading", { name: "Hackathon submissions" })
      .closest("section")!;

  beforeEach(() => {
    mocks.getProjectDetail.mockResolvedValue(
      detail({ submissions: [submission()] }),
    );
  });

  it("lists the hackathon, link, team and result for anyone, with no controls", async () => {
    for (const rel of [relation(), relation({ isContributor: true })]) {
      mocks.getRelation.mockResolvedValue(rel);
      await renderPage();
      const here = within(panel());
      expect(
        here.getByRole("link", { name: "HackGT" }).getAttribute("href"),
      ).toBe("https://devpost.com/s1");
      expect(here.getByText("Winner")).toBeTruthy();
      expect(here.getByText("Ada, Grace")).toBeTruthy();
      expect(here.queryByRole("button", { name: "Edit" })).toBeNull();
      expect(here.queryByRole("button", { name: "Delete" })).toBeNull();
      expect(
        here.queryByRole("button", { name: "Record submission" }),
      ).toBeNull();
      cleanup();
    }
    expect(mocks.getSubmittableHackathons).not.toHaveBeenCalled();
    expect(mocks.getTeamCandidates).not.toHaveBeenCalled();
  });

  it("gives an owner the record form and Edit and Delete on each submission", async () => {
    mocks.getRelation.mockResolvedValue(relation({ isOwner: true }));
    mocks.getProjectDetail.mockResolvedValue(
      detail({
        submissions: [submission(), { ...submission(), id: "s2" }],
        owners: [{ userId: ME, name: "Me", handle: "me" }],
      }),
    );
    await renderPage();
    const here = within(panel());
    expect(
      here.getByRole("button", { name: "Record submission" }),
    ).toBeTruthy();
    expect(here.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(here.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(here.getByRole("checkbox", { name: "Grace" })).toBeTruthy();
  });

  it("gives an officer the controls on a DevDogs-owned project only", async () => {
    mocks.caller = caller({ isLeader: true });
    await renderPage();
    expect(
      within(panel()).queryByRole("button", { name: "Record submission" }),
    ).toBeNull();
    cleanup();

    mocks.getProjectDetail.mockResolvedValue(
      detail({ devdogsOwned: true, owners: [], submissions: [submission()] }),
    );
    await renderPage();
    expect(
      within(panel()).getByRole("button", { name: "Record submission" }),
    ).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});

describe("the showcase panel", () => {
  const heading = () => screen.queryByRole("heading", { name: "Showcase" });

  it("is for officers: they see the stored values in it", async () => {
    mocks.caller = caller({ isLeader: true });
    await renderPage();
    expect(heading()).toBeTruthy();
    expect(mocks.getShowcaseFields).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("Featured on the homepage")
        .checked,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(/Display order/).value).toBe(
      "2",
    );
  });

  it("is hidden from owners, reviewers and contributors, and never read for them", async () => {
    const people = [
      [caller(), relation({ isOwner: true })],
      [caller({ canReview: true }), relation({ isAdvisor: true })],
      [caller(), relation({ isContributor: true })],
    ] as const;
    for (const [who, rel] of people) {
      mocks.caller = who;
      mocks.getRelation.mockResolvedValue(rel);
      await renderPage();
      expect(heading()).toBeNull();
      cleanup();
    }
    expect(mocks.getShowcaseFields).not.toHaveBeenCalled();
  });
});
