import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  contributions,
  profiles,
  projectMembers,
  projectReportContributions,
  projectReports,
  projects,
} from "~/server/db/schema";

/**
 * Reads of the project tables, which are server-only. Every function takes the
 * caller it is reading for; the pages gate who may call which.
 */

export type ProjectStatus = "proposed" | "active" | "declined" | "archived";
export type ReportStatus = "submitted" | "approved" | "returned";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  repos: string[];
  status: ProjectStatus;
  advisorId: string | null;
  advisorName: string | null;
  proposedByName: string | null;
  createdAt: Date;
}

export interface ReportPullRequest {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  mergedAt: Date;
}

export interface ProjectReportView {
  id: string;
  projectId: string;
  projectName: string;
  authorId: string;
  authorName: string | null;
  startDate: string;
  endDate: string;
  hours: number;
  approvedHours: number | null;
  content: string;
  status: ReportStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  submittedAt: Date;
  pullRequests: ReportPullRequest[];
}

const name = (userId: ReturnType<typeof sql>) =>
  sql<
    string | null
  >`(select p."preferredName" from platform.profile p where p."userId" = ${userId})`;

const summaryColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  repos: projects.repos,
  status: projects.status,
  advisorId: projects.advisorId,
  advisorName: name(sql`${projects.advisorId}`),
  proposedByName: name(sql`${projects.proposedBy}`),
  createdAt: projects.createdAt,
};

function asSummary(row: {
  status: string;
  [key: string]: unknown;
}): ProjectSummary {
  return row as unknown as ProjectSummary;
}

/** Projects the member belongs to, advises or proposed. */
export async function getMyProjects(
  userId: string,
): Promise<(ProjectSummary & { isAdvisor: boolean })[]> {
  const rows = await db
    .select(summaryColumns)
    .from(projects)
    .where(
      or(
        eq(projects.advisorId, userId),
        sql`exists (select 1 from platform."projectMembers" pm where pm."projectId" = ${projects.id} and pm."userId" = ${userId}::uuid)`,
      ),
    )
    .orderBy(asc(projects.name));
  return rows.map((row) => ({
    ...asSummary(row),
    isAdvisor: row.advisorId === userId,
  }));
}

export async function getProject(
  projectId: string,
): Promise<ProjectSummary | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(projects)
    .where(eq(projects.id, projectId));
  return row ? asSummary(row) : null;
}

/** Every project for leadership, proposals first. */
export async function getAllProjects(): Promise<ProjectSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(projects)
    .orderBy(
      sql`case ${projects.status} when 'proposed' then 0 when 'active' then 1 else 2 end`,
      asc(projects.name),
    );
  return rows.map(asSummary);
}

export interface ProjectMemberRow {
  userId: string;
  name: string | null;
  handle: string | null;
}

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMemberRow[]> {
  const rows = await db
    .select({
      userId: projectMembers.userId,
      name: profiles.preferredName,
      handle: profiles.handle,
    })
    .from(projectMembers)
    .leftJoin(profiles, eq(profiles.userId, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(profiles.preferredName));
  return rows;
}

export async function isProjectMember(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  return Boolean(row);
}

/** Whether the member advises at least one active project. */
export async function advisesAnyProject(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.advisorId, userId), eq(projects.status, "active")))
    .limit(1);
  return Boolean(row);
}

async function withPullRequests(
  rows: Omit<ProjectReportView, "pullRequests">[],
): Promise<ProjectReportView[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select({
      reportId: projectReportContributions.reportId,
      id: contributions.id,
      repo: contributions.repo,
      number: contributions.prNumber,
      title: contributions.title,
      url: contributions.url,
      mergedAt: contributions.mergedAt,
    })
    .from(projectReportContributions)
    .innerJoin(
      contributions,
      eq(contributions.id, projectReportContributions.contributionId),
    )
    .where(
      inArray(
        projectReportContributions.reportId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(contributions.mergedAt));
  return rows.map((row) => ({
    ...row,
    pullRequests: links
      .filter((link) => link.reportId === row.id)
      .map(({ reportId: _reportId, ...pr }) => pr),
  }));
}

const reportColumns = {
  id: projectReports.id,
  projectId: projectReports.projectId,
  projectName: projects.name,
  authorId: projectReports.userId,
  authorName: name(sql`${projectReports.userId}`),
  startDate: projectReports.startDate,
  endDate: projectReports.endDate,
  hoursText: projectReports.hours,
  approvedText: projectReports.approvedHours,
  content: projectReports.content,
  status: projectReports.status,
  reviewNote: projectReports.reviewNote,
  reviewedByName: name(sql`${projectReports.reviewedBy}`),
  submittedAt: projectReports.submittedAt,
};

function asReport(row: {
  hoursText: string;
  approvedText: string | null;
  status: string;
  [key: string]: unknown;
}): Omit<ProjectReportView, "pullRequests"> {
  const { hoursText, approvedText, ...rest } = row;
  return {
    ...(rest as unknown as Omit<
      ProjectReportView,
      "pullRequests" | "hours" | "approvedHours"
    >),
    hours: Number(hoursText),
    approvedHours: approvedText === null ? null : Number(approvedText),
  };
}

export async function getMyReports(
  userId: string,
): Promise<ProjectReportView[]> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(eq(projectReports.userId, userId))
    .orderBy(desc(projectReports.submittedAt));
  return withPullRequests(rows.map(asReport));
}

export async function getReport(
  reportId: string,
): Promise<ProjectReportView | null> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(eq(projectReports.id, reportId));
  return (await withPullRequests(rows.map(asReport)))[0] ?? null;
}

/**
 * Submitted reports waiting on this reviewer: every one for leadership, only
 * those of projects they advise otherwise. A reviewer's own reports are left
 * out, since they cannot review them (Q125).
 */
export async function getReviewQueue(
  reviewerId: string,
  officer: boolean,
): Promise<ProjectReportView[]> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(
      and(
        eq(projectReports.status, "submitted"),
        ne(projectReports.userId, reviewerId),
        officer ? undefined : eq(projects.advisorId, reviewerId),
      ),
    )
    .orderBy(asc(projectReports.submittedAt));
  return withPullRequests(rows.map(asReport));
}

export async function getProjectReports(
  projectId: string,
): Promise<ProjectReportView[]> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(eq(projectReports.projectId, projectId))
    .orderBy(desc(projectReports.submittedAt));
  return withPullRequests(rows.map(asReport));
}

export interface EligiblePullRequest extends ReportPullRequest {
  /** True when this report (being edited) already cites it. */
  selected: boolean;
}

/**
 * The member's merged PRs they could cite for a project: their own, in the
 * project's repositories (any, when it lists none), and not already cited by
 * another report. `reportId` keeps the ones the report being edited holds.
 */
export async function getEligiblePullRequests(
  userId: string,
  project: { repos: string[] },
  reportId: string | null,
): Promise<EligiblePullRequest[]> {
  const repos = project.repos.map((repo) => repo.toLowerCase());
  const rows = await db
    .select({
      id: contributions.id,
      repo: contributions.repo,
      number: contributions.prNumber,
      title: contributions.title,
      url: contributions.url,
      mergedAt: contributions.mergedAt,
      usedBy: projectReportContributions.reportId,
    })
    .from(contributions)
    .leftJoin(
      projectReportContributions,
      eq(projectReportContributions.contributionId, contributions.id),
    )
    .where(
      and(
        eq(contributions.userId, userId),
        repos.length === 0
          ? undefined
          : inArray(sql`lower(${contributions.repo})`, repos),
        reportId === null
          ? isNull(projectReportContributions.reportId)
          : or(
              isNull(projectReportContributions.reportId),
              eq(projectReportContributions.reportId, reportId),
            ),
      ),
    )
    .orderBy(desc(contributions.mergedAt))
    .limit(200);
  return rows.map(({ usedBy, ...pr }) => ({
    ...pr,
    selected: usedBy !== null,
  }));
}
