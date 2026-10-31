import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedPermissions } from "~/server/auth/permissions";

const mocks = vi.hoisted(() => ({
  expectSession: vi.fn(),
  getCallerContext: vi.fn(),
  getNavUser: vi.fn(),
  getPendingDeletion: vi.fn(),
  getWeeklyParticipation: vi.fn(),
  getElSummary: vi.fn(),
  getMyProjects: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));
vi.mock("~/server/auth", () => ({ expectSession: mocks.expectSession }));
vi.mock("~/server/auth/permissions", () => ({
  getCallerContext: mocks.getCallerContext,
}));
vi.mock("~/components/TopNav/data", () => ({ getNavUser: mocks.getNavUser }));
vi.mock("~/server/accountDeletion/schedule", () => ({
  getPendingDeletion: mocks.getPendingDeletion,
}));
vi.mock("~/server/loaders/weeklyParticipation", () => ({
  getWeeklyParticipation: mocks.getWeeklyParticipation,
}));
vi.mock("~/server/el/summary", () => ({ getElSummary: mocks.getElSummary }));
vi.mock("~/server/projects/load", () => ({
  getMyProjects: mocks.getMyProjects,
}));
vi.mock("~/components/PublicProfileStep", () => ({ default: () => null }));
vi.mock("~/components/SyncPreferredNameButton", () => ({
  default: () => null,
}));

const { default: OverviewPage } = await import("./page");

const NO_FLAGS: ResolvedPermissions = {
  canModerate: false,
  canManageRoles: false,
  canManageSuspensions: false,
  canViewAuditLog: false,
  canManageAttendance: false,
  canPreviewDocs: false,
  canManageOAuthApps: false,
  canDeleteAccounts: false,
  canReviewProjectReports: false,
};

/** The verification block the navbar loader reports for an unverified member. */
const UNVERIFIED = {
  userId: "member",
  isVerified: false,
  involvementFullName: null,
  publicProfiles: false,
  verificationStatus: {
    hasPronouns: false,
    hasGraduationDate: false,
    hasGithub: true,
    hasDiscord: false,
    nameMatchesInvolvement: false,
  },
};

function signIn({
  isLeader = false,
  verification = { ...UNVERIFIED, isVerified: true },
}: { isLeader?: boolean; verification?: typeof UNVERIFIED | null } = {}) {
  mocks.expectSession.mockResolvedValue("member");
  mocks.getCallerContext.mockResolvedValue({
    resolvedPermissions: NO_FLAGS,
    isLeader,
    minRank: isLeader ? 1 : Infinity,
  });
  mocks.getNavUser.mockResolvedValue({ verification });
}

async function renderPage() {
  render(await OverviewPage());
}

beforeEach(() => {
  mocks.getPendingDeletion.mockResolvedValue(null);
  mocks.getWeeklyParticipation.mockResolvedValue({
    current: 3,
    longest: 5,
    semesters: [],
  });
  mocks.getElSummary.mockResolvedValue({ workshopsAttended: 4 });
  mocks.getMyProjects.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Overview", () => {
  it("shows the verification checklist to an unverified member", async () => {
    signIn({ verification: UNVERIFIED });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: "Finish account setup" }),
    ).toBeTruthy();
    expect(screen.getByText("Not verified")).toBeTruthy();
    expect(screen.getByText("Add your pronouns")).toBeTruthy();
  });

  it("leaves the verification block out for a verified member", async () => {
    signIn();
    await renderPage();
    expect(screen.queryByText("Finish account setup")).toBeNull();
  });

  it("gives an officer the Console card and a member none", async () => {
    signIn({ isLeader: true });
    await renderPage();
    const console = screen.getByRole("heading", { name: "Console" });
    expect(console).toBeTruthy();
    const card = console.closest("section")!;
    expect(
      within(card).getByRole("link", { name: "Schedule editor" }),
    ).toBeTruthy();
    cleanup();

    signIn();
    await renderPage();
    expect(screen.queryByRole("heading", { name: "Console" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Developer" })).toBeTruthy();
  });

  it("lists each visible section with its description", async () => {
    signIn();
    await renderPage();
    const card = screen
      .getByRole("heading", { name: "Account" })
      .closest("section")!;
    expect(
      within(card).getByRole("link", { name: "Profile" }).getAttribute("href"),
    ).toBe("/dashboard/profile");
    expect(
      within(card).getByText("Link GitHub, Discord and LinkedIn."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });

  it("shows the pending deletion notice with its date and link", async () => {
    signIn();
    mocks.getPendingDeletion.mockResolvedValue({
      scheduledFor: new Date("2026-11-06T15:00:00Z"),
      requestedByOfficer: false,
      started: false,
    });
    await renderPage();
    expect(
      screen.getByText("Your account is scheduled for deletion"),
    ).toBeTruthy();
    expect(screen.getByText(/Friday, November 6, 2026/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View deletion details" })
        .getAttribute("href"),
    ).toBe("/dashboard/deletion");
  });

  it("shows no deletion notice when none is scheduled", async () => {
    signIn();
    await renderPage();
    expect(
      screen.queryByText("Your account is scheduled for deletion"),
    ).toBeNull();
  });

  it("shows attendance, the streak and the member's projects", async () => {
    signIn();
    mocks.getMyProjects.mockResolvedValue([
      { id: "p1", name: "Porchlight", status: "active", isAdvisor: false },
    ]);
    await renderPage();
    expect(
      screen.getByText("Workshops attended").nextSibling?.textContent,
    ).toBe("4");
    expect(screen.getByText("Current streak").nextSibling?.textContent).toBe(
      "3",
    );
    expect(screen.getByText("Porchlight")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });
});
