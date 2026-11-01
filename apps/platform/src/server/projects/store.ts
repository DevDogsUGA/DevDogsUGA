import { and, count, eq, inArray, sql } from "drizzle-orm";
import { isOfficer } from "~/server/auth/permissions";
import { db } from "~/server/db";
import {
  auditEvents,
  contributions,
  projectMembers,
  projectReportContributions,
  projectReports,
  projects,
} from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import {
  canReviewReport,
  easternDay,
  MAX_OPEN_PROPOSALS,
  parseRepos,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  REPORT_MAX_HOURS,
  REVIEW_NOTE_MAX,
  reportProblem,
  isQuarterHours,
  type ReportProblem,
} from "./policy";

/**
 * Writes for projects and project reports (Q119, Q123, Q170). Every function
 * checks its actor itself rather than trusting the caller, and each write
 * shares a transaction with its audit event. Outcomes are statuses, not
 * exceptions, so the actions can word them.
 *
 * Who may do what:
 *   - any member proposes a project, and reports on an active one they belong to;
 *   - leadership (an officer) approves or declines a proposal, assigns the
 *     advisor and archives;
 *   - the advisor or leadership keeps the member list and the repositories;
 *   - the advisor or leadership reviews a report, never their own.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  targetType: "project" | "projectReport",
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await tx.insert(auditEvents).values({
    actorType: "user",
    actorUserId: actorId,
    source: "platform",
    action,
    targetType,
    targetId,
    metadata,
  });
}

const PG_UNIQUE = "23505";
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === PG_UNIQUE) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

// ── Projects ────────────────────────────────────────────────────────────────

export type ProposeResult =
  | { status: "proposed"; projectId: string }
  | {
      status:
        | "name_invalid"
        | "description_too_long"
        | "too_many_open"
        | "name_taken";
    }
  | { status: "repos_invalid"; message: string };

export async function proposeProject(
  userId: string,
  input: { name: string; description: string; repos: string },
): Promise<ProposeResult> {
  const name = input.name.trim().replace(/\s+/gu, " ");
  if (name.length < PROJECT_NAME_MIN || name.length > PROJECT_NAME_MAX) {
    return { status: "name_invalid" };
  }
  const description = input.description.trim();
  if (description.length > PROJECT_DESCRIPTION_MAX) {
    return { status: "description_too_long" };
  }
  const repos = parseRepos(input.repos);
  if (!repos.ok) return { status: "repos_invalid", message: repos.message };

  try {
    return await db.transaction(async (tx) => {
      const [open] = await tx
        .select({ n: count() })
        .from(projects)
        .where(
          and(eq(projects.proposedBy, userId), eq(projects.status, "proposed")),
        );
      if ((open?.n ?? 0) >= MAX_OPEN_PROPOSALS) {
        return { status: "too_many_open" } as const;
      }
      const [created] = await tx
        .insert(projects)
        .values({
          name,
          description: description === "" ? null : description,
          repos: repos.repos,
          proposedBy: userId,
        })
        .returning({ id: projects.id });
      if (!created) throw new Error("Project was not created.");
      await tx
        .insert(projectMembers)
        .values({ projectId: created.id, userId, addedBy: userId });
      await audit(tx, userId, "project.proposed", "project", created.id, {
        name,
        repos: repos.repos,
      });
      return { status: "proposed", projectId: created.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "name_taken" };
    throw error;
  }
}

export type DecideResult =
  | { status: "approved" | "declined" | "archived" | "advisor_set" }
  | {
      status:
        | "forbidden"
        | "not_found"
        | "not_proposed"
        | "not_active"
        | "unknown_advisor";
    };

async function memberExists(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: usersInAuth.id })
    .from(usersInAuth)
    .where(eq(usersInAuth.id, userId))
    .for("share");
  return Boolean(row);
}

/** Leadership approves a proposal and names its advisor, or declines it. */
export async function decideProject(
  officerId: string,
  projectId: string,
  decision: { action: "approve"; advisorId: string } | { action: "decline" },
): Promise<DecideResult> {
  if (!(await isOfficer(officerId))) return { status: "forbidden" };
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ status: projects.status, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!project) return { status: "not_found" } as const;
    if (project.status !== "proposed")
      return { status: "not_proposed" } as const;

    if (decision.action === "decline") {
      await tx
        .update(projects)
        .set({
          status: "declined",
          approvedBy: officerId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      await audit(tx, officerId, "project.declined", "project", projectId, {
        name: project.name,
      });
      return { status: "declined" } as const;
    }

    if (!(await memberExists(tx, decision.advisorId))) {
      return { status: "unknown_advisor" } as const;
    }
    await tx
      .update(projects)
      .set({
        status: "active",
        advisorId: decision.advisorId,
        approvedBy: officerId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    await audit(tx, officerId, "project.approved", "project", projectId, {
      name: project.name,
      advisorId: decision.advisorId,
    });
    return { status: "approved" } as const;
  });
}

/** Leadership names (or replaces) the advisor of an active project. */
export async function setProjectAdvisor(
  officerId: string,
  projectId: string,
  advisorId: string,
): Promise<DecideResult> {
  if (!(await isOfficer(officerId))) return { status: "forbidden" };
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ status: projects.status, advisorId: projects.advisorId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!project) return { status: "not_found" } as const;
    if (project.status !== "active") return { status: "not_active" } as const;
    if (!(await memberExists(tx, advisorId))) {
      return { status: "unknown_advisor" } as const;
    }
    await tx
      .update(projects)
      .set({ advisorId, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await audit(tx, officerId, "project.advisor_set", "project", projectId, {
      from: project.advisorId,
      to: advisorId,
    });
    return { status: "advisor_set" } as const;
  });
}

export async function archiveProject(
  officerId: string,
  projectId: string,
): Promise<DecideResult> {
  if (!(await isOfficer(officerId))) return { status: "forbidden" };
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!project) return { status: "not_found" } as const;
    if (project.status !== "active") return { status: "not_active" } as const;
    await tx
      .update(projects)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await audit(tx, officerId, "project.archived", "project", projectId, {});
    return { status: "archived" } as const;
  });
}

export type ManageResult =
  | { status: "ok" }
  | { status: "forbidden" | "not_found" | "not_active" | "unknown_member" }
  | { status: "repos_invalid"; message: string };

/** Leadership, or the project's advisor, on an active project; else why not. */
async function projectForManager(tx: Tx, actorId: string, projectId: string) {
  const [project] = await tx
    .select({ status: projects.status, advisorId: projects.advisorId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("update");
  if (!project) return { ok: false, refusal: "not_found" } as const;
  if (project.status !== "active") {
    return { ok: false, refusal: "not_active" } as const;
  }
  if (project.advisorId !== actorId && !(await isOfficer(actorId))) {
    return { ok: false, refusal: "forbidden" } as const;
  }
  return { ok: true } as const;
}

export async function addProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
): Promise<ManageResult> {
  return db.transaction(async (tx) => {
    const found = await projectForManager(tx, actorId, projectId);
    if (!found.ok) return { status: found.refusal } as const;
    if (!(await memberExists(tx, userId))) {
      return { status: "unknown_member" } as const;
    }
    const added = await tx
      .insert(projectMembers)
      .values({ projectId, userId, addedBy: actorId })
      .onConflictDoNothing()
      .returning({ userId: projectMembers.userId });
    if (added.length > 0) {
      await audit(tx, actorId, "project.member_added", "project", projectId, {
        userId,
      });
    }
    return { status: "ok" } as const;
  });
}

export async function removeProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
): Promise<ManageResult> {
  return db.transaction(async (tx) => {
    const found = await projectForManager(tx, actorId, projectId);
    if (!found.ok) return { status: found.refusal } as const;
    const removed = await tx
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .returning({ userId: projectMembers.userId });
    if (removed.length > 0) {
      await audit(tx, actorId, "project.member_removed", "project", projectId, {
        userId,
      });
    }
    return { status: "ok" } as const;
  });
}

export async function updateProjectRepos(
  actorId: string,
  projectId: string,
  input: string,
): Promise<ManageResult> {
  // Leadership sets the scope at registration (Q123); the advisor keeps only
  // the member list, so the repositories that bound the evidence are officers'.
  if (!(await isOfficer(actorId))) return { status: "forbidden" };
  const repos = parseRepos(input);
  if (!repos.ok) return { status: "repos_invalid", message: repos.message };
  return db.transaction(async (tx) => {
    const found = await projectForManager(tx, actorId, projectId);
    if (!found.ok) return { status: found.refusal } as const;
    await tx
      .update(projects)
      .set({ repos: repos.repos, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await audit(tx, actorId, "project.repos_updated", "project", projectId, {
      repos: repos.repos,
    });
    return { status: "ok" } as const;
  });
}

// ── Reports ─────────────────────────────────────────────────────────────────

export interface ReportInput {
  /** Set to edit a report that was returned (or not yet reviewed). */
  reportId?: string;
  projectId: string;
  startDate: string;
  endDate: string;
  hours: number;
  content: string;
  contributionIds: string[];
}

export type SubmitResult =
  | { status: "submitted"; reportId: string }
  | {
      status:
        | "not_found"
        | "not_member"
        | "not_active"
        | "leadership_separate"
        | "locked"
        | "pr_not_yours"
        | "pr_out_of_range"
        | "pr_wrong_repo"
        | "pr_already_used";
    }
  | { status: "invalid"; problem: ReportProblem };

export async function submitProjectReport(
  userId: string,
  input: ReportInput,
  now = new Date(),
): Promise<SubmitResult> {
  const problem = reportProblem(input, easternDay(now));
  if (problem) return { status: "invalid", problem };
  // Leadership's EL is a separate process (Q125), not an ordinary report that
  // another officer approves.
  if (await isOfficer(userId)) return { status: "leadership_separate" };
  const wanted = [...new Set(input.contributionIds)];

  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: projects.status, repos: projects.repos })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .for("share");
      if (!project) return { status: "not_found" } as const;
      if (project.status !== "active") return { status: "not_active" } as const;
      const [membership] = await tx
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, input.projectId),
            eq(projectMembers.userId, userId),
          ),
        );
      if (!membership) return { status: "not_member" } as const;

      if (input.reportId) {
        const [existing] = await tx
          .select({
            status: projectReports.status,
            projectId: projectReports.projectId,
          })
          .from(projectReports)
          .where(
            and(
              eq(projectReports.id, input.reportId),
              eq(projectReports.userId, userId),
            ),
          )
          .for("update");
        if (!existing) return { status: "not_found" } as const;
        if (existing.status === "approved")
          return { status: "locked" } as const;
        if (existing.projectId !== input.projectId) {
          return { status: "not_found" } as const;
        }
      }

      {
        const prs = await tx
          .select({
            id: contributions.id,
            userId: contributions.userId,
            repo: contributions.repo,
            mergedDay: sql<string>`to_char((${contributions.mergedAt} at time zone 'America/New_York')::date, 'YYYY-MM-DD')`,
          })
          .from(contributions)
          .where(inArray(contributions.id, wanted))
          .for("share");
        if (prs.length !== wanted.length) {
          return { status: "pr_not_yours" } as const;
        }
        for (const pr of prs) {
          if (pr.userId !== userId) return { status: "pr_not_yours" } as const;
          if (pr.mergedDay < input.startDate || pr.mergedDay > input.endDate) {
            return { status: "pr_out_of_range" } as const;
          }
          if (
            project.repos.length > 0 &&
            !project.repos.some(
              (repo) => repo.toLowerCase() === pr.repo.toLowerCase(),
            )
          ) {
            return { status: "pr_wrong_repo" } as const;
          }
        }
      }

      let reportId = input.reportId;
      const content = input.content.trim();
      if (reportId) {
        await tx
          .update(projectReports)
          .set({
            startDate: input.startDate,
            endDate: input.endDate,
            hours: input.hours.toFixed(2),
            content,
            status: "submitted",
            approvedHours: null,
            reviewedAt: null,
            reviewedBy: null,
            updatedAt: new Date(),
            submittedAt: new Date(),
          })
          .where(eq(projectReports.id, reportId));
        await tx
          .delete(projectReportContributions)
          .where(eq(projectReportContributions.reportId, reportId));
      } else {
        const [created] = await tx
          .insert(projectReports)
          .values({
            userId,
            projectId: input.projectId,
            startDate: input.startDate,
            endDate: input.endDate,
            hours: input.hours.toFixed(2),
            content,
          })
          .returning({ id: projectReports.id });
        if (!created) throw new Error("Report was not created.");
        reportId = created.id;
      }
      await tx
        .insert(projectReportContributions)
        .values(wanted.map((contributionId) => ({ reportId, contributionId })));
      await audit(
        tx,
        userId,
        "projectReport.submitted",
        "projectReport",
        reportId,
        {
          projectId: input.projectId,
          hours: input.hours,
          startDate: input.startDate,
          endDate: input.endDate,
          pullRequests: wanted.length,
          resubmitted: Boolean(input.reportId),
        },
      );
      return { status: "submitted", reportId } as const;
    });
  } catch (error) {
    // A pull request another report already cites (the table's UNIQUE).
    if (isUniqueViolation(error)) return { status: "pr_already_used" };
    throw error;
  }
}

/** The author withdraws a report that has not been approved; its PRs are freed. */
export async function deleteProjectReport(
  userId: string,
  reportId: string,
): Promise<"deleted" | "not_found" | "locked"> {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({
        status: projectReports.status,
        projectId: projectReports.projectId,
      })
      .from(projectReports)
      .where(
        and(eq(projectReports.id, reportId), eq(projectReports.userId, userId)),
      )
      .for("update");
    if (!report) return "not_found" as const;
    if (report.status === "approved") return "locked" as const;
    await tx.delete(projectReports).where(eq(projectReports.id, reportId));
    await audit(
      tx,
      userId,
      "projectReport.deleted",
      "projectReport",
      reportId,
      {
        projectId: report.projectId,
      },
    );
    return "deleted" as const;
  });
}

export type ReviewResult =
  | { status: "approved" | "returned"; authorId: string }
  | {
      status:
        | "forbidden"
        | "own_report"
        | "not_found"
        | "already_reviewed"
        | "bad_hours"
        | "note_required"
        | "note_too_long";
    };

/**
 * The advisor or leadership reviews a submitted report as submitted, without
 * waiting for a checkpoint (Q119): approve it, confirming or adjusting the
 * hours, or return it with a note the author can act on.
 */
export async function reviewProjectReport(
  actorId: string,
  reportId: string,
  decision:
    { action: "approve"; hours: number } | { action: "return"; note: string },
): Promise<ReviewResult> {
  const note = decision.action === "return" ? decision.note.trim() : "";
  if (decision.action === "return") {
    if (note === "") return { status: "note_required" };
    if (note.length > REVIEW_NOTE_MAX) return { status: "note_too_long" };
  } else if (
    !isQuarterHours(decision.hours) ||
    decision.hours <= 0 ||
    decision.hours > REPORT_MAX_HOURS
  ) {
    return { status: "bad_hours" };
  }
  const officer = await isOfficer(actorId);

  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({
        userId: projectReports.userId,
        projectId: projectReports.projectId,
        status: projectReports.status,
        hours: projectReports.hours,
        advisorId: projects.advisorId,
      })
      .from(projectReports)
      .innerJoin(projects, eq(projects.id, projectReports.projectId))
      .where(eq(projectReports.id, reportId))
      .for("update", { of: projectReports });
    if (!report) return { status: "not_found" } as const;
    const verdict = canReviewReport(
      { userId: actorId, isOfficer: officer, advisorId: report.advisorId },
      report.userId,
    );
    if (verdict !== "yes") return { status: verdict } as const;
    if (report.status !== "submitted") {
      return { status: "already_reviewed" } as const;
    }

    if (decision.action === "approve") {
      await tx
        .update(projectReports)
        .set({
          status: "approved",
          approvedHours: decision.hours.toFixed(2),
          reviewedBy: actorId,
          reviewedAt: new Date(),
          reviewNote: null,
          updatedAt: new Date(),
        })
        .where(eq(projectReports.id, reportId));
      await audit(
        tx,
        actorId,
        "projectReport.approved",
        "projectReport",
        reportId,
        {
          authorId: report.userId,
          projectId: report.projectId,
          claimedHours: Number(report.hours),
          approvedHours: decision.hours,
        },
      );
      return { status: "approved", authorId: report.userId } as const;
    }
    await tx
      .update(projectReports)
      .set({
        status: "returned",
        approvedHours: null,
        reviewedBy: actorId,
        reviewedAt: new Date(),
        reviewNote: note,
        updatedAt: new Date(),
      })
      .where(eq(projectReports.id, reportId));
    await audit(
      tx,
      actorId,
      "projectReport.returned",
      "projectReport",
      reportId,
      {
        authorId: report.userId,
        projectId: report.projectId,
        note,
      },
    );
    return { status: "returned", authorId: report.userId } as const;
  });
}
