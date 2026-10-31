import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  contributions,
  projectReportContributions,
  projectReports,
  projects,
} from "~/server/db/schema";
import { commitTitle } from "./policy";
import { PROJECT_ID_REGEX } from "./slug";

/**
 * Reads of the project tables, which are server-only. Every function takes
 * the member it is reading for; the pages gate who may call which. Record
 * rules are applied by the page from the facts these return, with
 * `records.ts`.
 */

/** `proposed` and `declined` exist only on rows from before the redesign. */
export type ProjectStatus = "proposed" | "active" | "declined" | "archived";
export type ReportStatus = "submitted" | "approved" | "returned";

const day = (value: unknown) => new Date(value as string | Date);

const name = (userId: ReturnType<typeof sql>) =>
  sql<
    string | null
  >`(select p."preferredName" from platform.profile p where p."userId" = ${userId})`;

// ── Projects ────────────────────────────────────────────────────────────────

export type ProjectSummary = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  isOwner: boolean;
  isAdvisor: boolean;
  isContributor: boolean;
};

/**
 * Contributor: one of the member's stored commits is in a repo the project
 * links with an approved link. A pending or declined link confers nothing.
 */
const contributorOf = (
  userId: string,
  project: ReturnType<typeof sql> = sql`p.id`,
) => sql`exists (
  select 1 from platform.commits c
  join platform."repoCommits" rc on rc.sha = c.sha
  join platform."projectRepos" pr
    on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = ${project} and pr.approval = 'approved'
  where c."userId" = ${userId}::uuid)`;

const ownerOf = (
  userId: string,
  project: ReturnType<typeof sql> = sql`p.id`,
) => sql`exists (
  select 1 from platform."projectOwners" o
  where o."projectId" = ${project} and o."userId" = ${userId}::uuid)`;

/** Projects the member owns, advises or contributes to, active and archived. */
export async function getMyProjects(userId: string): Promise<ProjectSummary[]> {
  return db.execute<ProjectSummary>(sql`
    select p.id, p.slug, p.name, p.description, p.status,
      ${ownerOf(userId)} as "isOwner",
      (p."advisorId" = ${userId}::uuid) as "isAdvisor",
      ${contributorOf(userId)} as "isContributor"
    from platform.projects p
    where p.status in ('active', 'archived')
      and (${ownerOf(userId)} or p."advisorId" = ${userId}::uuid or ${contributorOf(userId)})
    order by p.name`);
}

export type OfficerProjectRow = {
  id: string;
  slug: string | null;
  name: string;
  status: ProjectStatus;
  devdogsOwned: boolean;
  ownerCount: number;
  pendingLinks: number;
};

/** Every project, for officers: who is waiting on them and who has none. */
export async function getAllProjects(): Promise<OfficerProjectRow[]> {
  return db.execute<OfficerProjectRow>(sql`
    select p.id, p.slug, p.name, p.status, p."devdogsOwned",
      (select count(*)::int from platform."projectOwners" o where o."projectId" = p.id) as "ownerCount",
      (select count(*)::int from platform."projectRepos" r where r."projectId" = p.id and r.approval = 'pending') as "pendingLinks"
    from platform.projects p
    where p.status in ('active', 'archived')
    order by (select count(*) from platform."projectRepos" r where r."projectId" = p.id and r.approval = 'pending') desc, p.name`);
}

export type RepoView = {
  githubRepoId: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string | null;
  health: "available" | "unavailable";
  unavailableSince: Date | null;
  lastCheckedAt: Date | null;
  approval: "pending" | "approved" | "declined";
};

export type OwnerView = {
  userId: string;
  name: string | null;
  handle: string | null;
};

export interface SubmissionView {
  id: string;
  hackathon: string;
  url: string;
  result: string | null;
  team: string[];
}

export interface ProjectDetail {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  tags: string[];
  status: ProjectStatus;
  devdogsOwned: boolean;
  advisorId: string | null;
  advisorName: string | null;
  /** A row from before the redesign: no repos or owners until the cutover. */
  legacy: boolean;
  repos: RepoView[];
  owners: OwnerView[];
  submissions: SubmissionView[];
}

/** The project a route segment names: its slug, or a legacy row's UUID. */
export async function findProjectId(ref: string): Promise<string | null> {
  const lookup = PROJECT_ID_REGEX.test(ref)
    ? eq(projects.id, ref.toLowerCase())
    : eq(projects.slug, ref);
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(lookup);
  return row?.id ?? null;
}

export async function getProjectDetail(
  projectId: string,
): Promise<ProjectDetail | null> {
  const [row] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      tags: projects.tags,
      status: projects.status,
      devdogsOwned: projects.devdogsOwned,
      advisorId: projects.advisorId,
      advisorName: name(sql`${projects.advisorId}`),
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) return null;
  const [repos, owners, submissions] = await Promise.all([
    db.execute<RepoView>(sql`
      select d."githubRepoId"::text as "githubRepoId", d.owner, d.name,
        'https://github.com/' || d.owner || '/' || d.name as url,
        d."defaultBranch", d.health, d."unavailableSince", d."lastCheckedAt", d.approval
      from platform."projectRepoDetails" d
      where d."projectId" = ${projectId}::uuid
      order by d.owner, d.name`),
    db.execute<OwnerView>(sql`
      select o."userId", p."preferredName" as name, p.handle
      from platform."projectOwners" o
      left join platform.profile p on p."userId" = o."userId"
      where o."projectId" = ${projectId}::uuid
      order by p."preferredName"`),
    db.execute<{
      id: string;
      hackathon: string;
      url: string;
      result: string | null;
      team: string[] | null;
    }>(sql`
      select s.id, h.name as hackathon, s.url, s.result,
        array(select p."preferredName" from platform."submissionMembers" m
          join platform.profile p on p."userId" = m."userId"
          where m."submissionId" = s.id order by p."preferredName") as team
      from platform.submissions s
      join platform.hackathons h on h.id = s."hackathonId"
      where s."projectId" = ${projectId}::uuid
      order by s."createdAt" desc`),
  ]);
  return {
    ...row,
    status: row.status as ProjectStatus,
    legacy: row.status !== "active" && row.status !== "archived",
    repos: repos.map((repo) => ({
      ...repo,
      unavailableSince: repo.unavailableSince
        ? day(repo.unavailableSince)
        : null,
      lastCheckedAt: repo.lastCheckedAt ? day(repo.lastCheckedAt) : null,
    })),
    owners,
    submissions: submissions.map(({ team, ...s }) => ({
      ...s,
      team: team ?? [],
    })),
  };
}

export type ProjectRelation = {
  isOwner: boolean;
  isContributor: boolean;
  isAdvisor: boolean;
};

/** How the member relates to one project, from the facts the rules read. */
export async function getRelation(
  userId: string,
  projectId: string,
): Promise<ProjectRelation> {
  const [row] = await db.execute<ProjectRelation>(sql`
    select ${ownerOf(userId, sql`${projectId}::uuid`)} as "isOwner",
      ${contributorOf(userId, sql`${projectId}::uuid`)} as "isContributor",
      exists (select 1 from platform.projects p where p.id = ${projectId}::uuid and p."advisorId" = ${userId}::uuid) as "isAdvisor"`);
  return row ?? { isOwner: false, isContributor: false, isAdvisor: false };
}

export type MemberMatch = OwnerView & {
  /** Has a linked GitHub account: required of an Owner, not of an advisor. */
  linked: boolean;
};

/** Members whose name or handle contains the text, for choosing an Owner or advisor. */
export async function searchMembers(query: string): Promise<MemberMatch[]> {
  const text = query.trim().slice(0, 80);
  if (!text) return [];
  const pattern = `%${text.replace(/[\\%_]/gu, "\\$&")}%`;
  return db.execute<MemberMatch>(sql`
    select p."userId", p."preferredName" as name, p.handle,
      exists (select 1 from auth.identities i where i.user_id = p."userId" and i.provider = 'github') as linked
    from platform.profile p
    where p."preferredName" ilike ${pattern} or p.handle ilike ${pattern}
    order by p."preferredName" limit 10`);
}

// ── Reports ─────────────────────────────────────────────────────────────────

export interface CommitView {
  sha: string;
  title: string;
  committedAt: Date;
  files: number | null;
  additions: number | null;
  deletions: number | null;
  repo: string;
  url: string;
}

export interface LegacyPullRequest {
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
  projectSlug: string | null;
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
  commits: CommitView[];
  /** Reports from before commit evidence keep their PRs, read-only. */
  legacyPullRequests: LegacyPullRequest[];
}

const reportColumns = {
  id: projectReports.id,
  projectId: projectReports.projectId,
  projectName: projects.name,
  projectSlug: projects.slug,
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

type ReportRow = {
  hoursText: string;
  approvedText: string | null;
  status: string;
  [key: string]: unknown;
};

function asReport(row: ReportRow) {
  const { hoursText, approvedText, ...rest } = row;
  return {
    ...(rest as unknown as Omit<
      ProjectReportView,
      "commits" | "legacyPullRequests" | "hours" | "approvedHours"
    >),
    hours: Number(hoursText),
    approvedHours: approvedText === null ? null : Number(approvedText),
  };
}

/** A commit's GitHub page. Only public repos are ever stored, so the link resolves. */
export const commitUrl = (owner: string, repo: string, sha: string) =>
  `https://github.com/${owner}/${repo}/commit/${sha}`;

type CommitRow = {
  reportId: string;
  sha: string;
  message: string;
  committedAt: Date;
  files: number | null;
  additions: string | number | null;
  deletions: string | number | null;
  owner: string;
  repo: string;
};

function asCommit(row: Omit<CommitRow, "reportId">): CommitView {
  return {
    sha: row.sha,
    title: commitTitle(row.message),
    committedAt: day(row.committedAt),
    files: row.files,
    additions: row.additions === null ? null : Number(row.additions),
    deletions: row.deletions === null ? null : Number(row.deletions),
    repo: `${row.owner}/${row.repo}`,
    url: commitUrl(row.owner, row.repo, row.sha),
  };
}

async function withEvidence(
  rows: ReturnType<typeof asReport>[],
): Promise<ProjectReportView[]> {
  if (rows.length === 0) return [];
  const ids = sql.join(
    rows.map((row) => sql`${row.id}::uuid`),
    sql`, `,
  );
  const [commits, legacy] = await Promise.all([
    db.execute<CommitRow>(sql`
      select pc."reportId", c.sha, c.message, c."committedAt", c.files, c.additions, c.deletions,
        g.owner, g.name as repo
      from platform."projectReportCommits" pc
      join platform.commits c on c.sha = pc.sha
      join platform."githubRepos" g on g."githubRepoId" = pc."githubRepoId"
      where pc."reportId" in (${ids})
      order by c."committedAt"`),
    db
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
      .orderBy(asc(contributions.mergedAt)),
  ]);
  return rows.map((row) => ({
    ...row,
    commits: commits
      .filter((c) => c.reportId === row.id)
      .map(({ reportId: _reportId, ...c }) => asCommit(c)),
    legacyPullRequests: legacy
      .filter((l) => l.reportId === row.id)
      .map(({ reportId: _reportId, ...pr }) => pr),
  }));
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
  return withEvidence(rows.map(asReport));
}

export async function getReport(
  reportId: string,
): Promise<ProjectReportView | null> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(eq(projectReports.id, reportId));
  return (await withEvidence(rows.map(asReport)))[0] ?? null;
}

/**
 * Submitted reports waiting on this reviewer, oldest first, never their own
 * (Q125). A holder of `reviewProjectReports` sees every project's; an advisor
 * only the projects they advise. `projectId` narrows to one project.
 */
export async function getReviewQueue(
  reviewerId: string,
  scope: { all: boolean; projectId?: string },
): Promise<ProjectReportView[]> {
  const rows = await db
    .select(reportColumns)
    .from(projectReports)
    .innerJoin(projects, eq(projects.id, projectReports.projectId))
    .where(
      sql`${projectReports.status} = 'submitted'
        and ${projectReports.userId} <> ${reviewerId}::uuid
        ${scope.projectId ? sql`and ${projectReports.projectId} = ${scope.projectId}::uuid` : sql``}
        ${scope.all ? sql`` : sql`and ${projects.advisorId} = ${reviewerId}::uuid`}`,
    )
    .orderBy(asc(projectReports.submittedAt));
  return withEvidence(rows.map(asReport));
}

// ── The report form's commit picker ─────────────────────────────────────────

export interface EligibleCommit extends CommitView {
  /** The Eastern day it landed, which is what the date range is compared with. */
  day: string;
  /** True when the report being edited already cites it. */
  selected: boolean;
}

/**
 * The member's own stored commits in the project's approved repos, newest
 * first, that no other report cites. `reportId` keeps the ones the report
 * being edited holds. The form narrows them to its date range.
 */
export async function getEligibleCommits(
  userId: string,
  projectId: string,
  reportId: string | null,
): Promise<EligibleCommit[]> {
  const rows = await db.execute<
    Omit<CommitRow, "reportId"> & { day: string; usedBy: string | null }
  >(sql`
    select distinct on (c.sha) c.sha, c.message, c."committedAt", c.files, c.additions, c.deletions,
      g.owner, g.name as repo,
      to_char((c."committedAt" at time zone 'America/New_York')::date, 'YYYY-MM-DD') as day,
      pc."reportId" as "usedBy"
    from platform.commits c
    join platform."repoCommits" rc on rc.sha = c.sha
    join platform."projectRepos" pr
      on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = ${projectId}::uuid and pr.approval = 'approved'
    join platform."githubRepos" g on g."githubRepoId" = rc."githubRepoId"
    left join platform."projectReportCommits" pc on pc.sha = c.sha
    where c."userId" = ${userId}::uuid
      and (pc."reportId" is null or pc."reportId" = ${reportId}::uuid)
    order by c.sha, rc."githubRepoId"`);
  return rows
    .map(({ day: eastern, usedBy, ...row }) => ({
      ...asCommit(row),
      day: eastern,
      selected: usedBy !== null,
    }))
    .sort((a, b) => b.committedAt.getTime() - a.committedAt.getTime())
    .slice(0, 300);
}
