import { eq, sql } from "drizzle-orm";

import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";
import { rules, type Caller } from "~/server/auth/access";
import { db } from "~/server/db";
import { projectReports } from "~/server/db/schema";
import { conflictingSha, guardMessage, isUniqueViolationOf } from "./dbErrors";
import {
  commitTitle,
  easternDay,
  isQuarterHours,
  REPORT_MAX_HOURS,
  REPORT_PROBLEM_MESSAGE,
  reportProblem,
  REVIEW_NOTE_MAX,
  type ReportProblem,
} from "./policy";
import {
  editVerdict,
  FILE_REFUSAL,
  fileVerdict,
  legacyBlock,
  REVIEW_REFUSAL,
  reviewVerdict,
} from "./records";
import { audit, type Tx } from "./tx";

/**
 * Writes for EL reports (Q119 to Q121): file, edit, delete and review. Like
 * the project store these are domain code returning Action results, with
 * the Record rules read from facts inside the transaction.
 *
 * Evidence is commits only (Q38). A report cites commits the author owns, that
 * were stored from one of the Project's approved repos, and that landed on the
 * Eastern days in its range. Each commit backs at most one report; the
 * database's `projectReportCommits_sha_key` is the arbiter, and this module
 * pre-checks it so a clash is named by the commit's own title.
 */

function refuse(message: string, fieldErrors?: Record<string, string>): never {
  throw new ExpectedFailure(message, fieldErrors);
}

const SHA = /^[0-9a-f]{40}$/u;
const shortSha = (sha: string) => sha.slice(0, 7);

/** The field a problem belongs under, for the form. */
const PROBLEM_FIELD: Record<ReportProblem, string> = {
  bad_dates: "endDate",
  future: "endDate",
  range_too_long: "endDate",
  bad_hours: "hours",
  too_short: "content",
  no_commits: "shas",
};

/** The sentence for a commit another report already cites. */
export function commitTakenMessage(sha: string, message: string | null) {
  const title = message ? commitTitle(message) : "";
  return `Commit ${shortSha(sha)}${title ? ` "${title}"` : ""} is already cited by another report. Each commit backs at most one report.`;
}

export interface ReportInput {
  /** Set to edit a report that is not yet approved. */
  reportId?: string;
  projectId: string;
  startDate: string;
  endDate: string;
  hours: number;
  content: string;
  shas: string[];
}

/** A commit that is another report's, named by its title. */
async function commitTaken(sha: string): Promise<string> {
  const [row] = await db.execute<{ message: string }>(
    sql`select message from platform.commits where sha = ${sha}`,
  );
  return commitTakenMessage(sha, row?.message ?? null);
}

/** Is the member a Contributor: a stored commit in an approved repo of the Project? */
async function isContributor(
  tx: Tx,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    select 1
    from platform.commits c
    join platform."repoCommits" rc on rc.sha = c.sha
    join platform."projectRepos" pr
      on pr."githubRepoId" = rc."githubRepoId" and pr."projectId" = ${projectId}::uuid
      and pr.approval = 'approved'
    where c."userId" = ${userId}::uuid limit 1`);
  return rows.length > 0;
}

/**
 * File an EL report, or edit one the author has not had approved (a returned
 * report is editable again, and resubmitting sends it back to the queue).
 * Officers cannot file (Q125).
 */
export function fileReport(
  actor: Caller,
  input: ReportInput,
  now = new Date(),
): Promise<ActionResult<{ reportId: string }>> {
  return expected(async () => {
    const shas = [...new Set(input.shas)];
    const problem = reportProblem({ ...input, shas }, easternDay(now));
    if (problem)
      refuse(REPORT_PROBLEM_MESSAGE[problem], {
        [PROBLEM_FIELD[problem]]: REPORT_PROBLEM_MESSAGE[problem],
      });
    if (shas.some((sha) => !SHA.test(sha)))
      refuse("One of the cited commits is not valid.", {
        shas: "One of the cited commits is not valid.",
      });
    const content = input.content.trim();

    try {
      return await db.transaction(async (tx) => {
        const [project] = await tx.execute<{ status: string }>(sql`
          select status from platform.projects
          where id = ${input.projectId}::uuid for share`);
        if (!project) refuse("That project was not found.");
        const legacy = legacyBlock(project.status);
        if (legacy) refuse(legacy);
        const verdict = fileVerdict({
          isOfficer: rules.officer(actor),
          isContributor: await isContributor(tx, actor.userId, input.projectId),
          projectStatus: project.status,
        });
        if (verdict !== "yes") refuse(FILE_REFUSAL[verdict]);

        if (input.reportId) {
          const [existing] = await tx
            .select({
              status: projectReports.status,
              projectId: projectReports.projectId,
              authorId: projectReports.userId,
            })
            .from(projectReports)
            .where(eq(projectReports.id, input.reportId))
            .for("update");
          if (existing?.projectId !== input.projectId)
            refuse("That report was not found.");
          const edit = editVerdict({ ...existing, actorId: actor.userId });
          if (edit === "not_author") refuse("That report was not found.");
          if (edit === "approved")
            refuse("An approved report cannot be changed.");
          const [legacyEvidence] = await tx.execute(sql`
            select 1 from platform."projectReportContributions"
            where "reportId" = ${input.reportId}::uuid limit 1`);
          if (legacyEvidence)
            refuse(
              "This report cites pull requests from before commit evidence, so it can no longer be edited.",
            );
        }

        // Each cited commit: the member's own, from an approved repo of this
        // project, on a day inside the range (the database repeats this in
        // `validate_report_commit`).
        const eligible = await tx.execute<{ sha: string; repoId: string }>(sql`
          select distinct on (c.sha) c.sha, rc."githubRepoId"::text as "repoId"
          from platform.commits c
          join platform."repoCommits" rc on rc.sha = c.sha
          join platform."projectRepos" pr
            on pr."githubRepoId" = rc."githubRepoId"
            and pr."projectId" = ${input.projectId}::uuid and pr.approval = 'approved'
          where c."userId" = ${actor.userId}::uuid
            and c.sha in (${sql.join(
              shas.map((sha) => sql`${sha}`),
              sql`, `,
            )})
            and (c."committedAt" at time zone 'America/New_York')::date
              between ${input.startDate}::date and ${input.endDate}::date
          order by c.sha, rc."githubRepoId"`);
        const found = new Map(eligible.map((row) => [row.sha, row.repoId]));
        const missing = shas.find((sha) => !found.has(sha));
        if (missing) {
          const message = `Commit ${shortSha(missing)} is not one of your commits in this project's repositories within that date range.`;
          refuse(message, { shas: message });
        }

        // A commit another report holds; the report being edited keeps its own.
        const [taken] = await tx.execute<{ sha: string; message: string }>(sql`
          select pc.sha, c.message
          from platform."projectReportCommits" pc
          join platform.commits c on c.sha = pc.sha
          where pc.sha in (${sql.join(
            shas.map((sha) => sql`${sha}`),
            sql`, `,
          )})
            and pc."reportId" is distinct from ${input.reportId ?? null}::uuid
          limit 1`);
        if (taken) {
          const message = commitTakenMessage(taken.sha, taken.message);
          refuse(message, { shas: message });
        }

        let reportId = input.reportId;
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
              reviewNote: null,
              updatedAt: new Date(),
              submittedAt: new Date(),
            })
            .where(eq(projectReports.id, reportId));
          await tx.execute(sql`
            delete from platform."projectReportCommits" where "reportId" = ${reportId}::uuid`);
        } else {
          const [created] = await tx
            .insert(projectReports)
            .values({
              userId: actor.userId,
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
        for (const sha of shas) {
          await tx.execute(sql`
            insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId")
            values (${reportId}::uuid, ${sha}, ${found.get(sha)!}::bigint)`);
        }
        await audit(
          tx,
          actor.userId,
          "projectReport.submitted",
          "projectReport",
          reportId,
          {
            projectId: input.projectId,
            hours: input.hours,
            startDate: input.startDate,
            endDate: input.endDate,
            commits: shas.length,
            resubmitted: Boolean(input.reportId),
          },
        );
        return { reportId };
      });
    } catch (error) {
      if (error instanceof ExpectedFailure) throw error;
      // Two members, or two tabs, citing one commit at once: the table's
      // UNIQUE decides, and the loser is told which commit it was.
      if (isUniqueViolationOf(error, "projectReportCommits_sha_key")) {
        const sha =
          conflictingSha(error) ??
          (await firstCitedElsewhere(shas, input.reportId));
        const message = sha
          ? await commitTaken(sha)
          : "One of those commits is already cited by another report.";
        refuse(message, { shas: message });
      }
      const guarded = guardMessage(error);
      if (guarded) refuse(guarded, { shas: guarded });
      throw error;
    }
  }, "Report submitted for review.");
}

async function firstCitedElsewhere(
  shas: string[],
  reportId: string | undefined,
): Promise<string | null> {
  const rows = await db.execute<{ sha: string }>(sql`
    select sha from platform."projectReportCommits"
    where sha in (${sql.join(
      shas.map((sha) => sql`${sha}`),
      sql`, `,
    )})
      and "reportId" is distinct from ${reportId ?? null}::uuid
    limit 1`);
  return rows[0]?.sha ?? null;
}

/** The author withdraws a report that has not been approved; its commits are freed. */
export function deleteReport(
  actor: Caller,
  reportId: string,
): Promise<ActionResult<void>> {
  return expected(async () => {
    await db.transaction(async (tx) => {
      const [report] = await tx
        .select({
          status: projectReports.status,
          projectId: projectReports.projectId,
          authorId: projectReports.userId,
        })
        .from(projectReports)
        .where(eq(projectReports.id, reportId))
        .for("update");
      if (!report) refuse("That report was not found.");
      const verdict = editVerdict({ ...report, actorId: actor.userId });
      if (verdict === "not_author") refuse("That report was not found.");
      if (verdict === "approved")
        refuse("An approved report cannot be deleted.");
      await tx.delete(projectReports).where(eq(projectReports.id, reportId));
      await audit(
        tx,
        actor.userId,
        "projectReport.deleted",
        "projectReport",
        reportId,
        { projectId: report.projectId },
      );
    });
  }, "Report deleted.");
}

export type ReviewDecision =
  { action: "approve"; hours: number } | { action: "return"; note: string };

/**
 * The advisor, or a holder of `reviewProjectReports`, reviews a submitted
 * report (Q119): approve it, confirming or adjusting the hours, or return it
 * with a note the author can act on. Never the author's own report.
 */
export function reviewReport(
  actor: Caller,
  reportId: string,
  decision: ReviewDecision,
): Promise<ActionResult<{ authorId: string }>> {
  const done =
    decision.action === "approve" ? "Report approved." : "Report returned.";
  return expected(async () => {
    const note = decision.action === "return" ? decision.note.trim() : "";
    if (decision.action === "return") {
      if (note === "")
        refuse("Say what the author should change.", {
          note: "Say what the author should change.",
        });
      if (note.length > REVIEW_NOTE_MAX)
        refuse("The note is too long.", { note: "The note is too long." });
    } else if (
      !isQuarterHours(decision.hours) ||
      decision.hours <= 0 ||
      decision.hours > REPORT_MAX_HOURS
    ) {
      const message = `Hours must be in quarter-hour steps, above 0 and no more than ${REPORT_MAX_HOURS}.`;
      refuse(message, { hours: message });
    }

    return db.transaction(async (tx) => {
      const [report] = await tx.execute<{
        userId: string;
        projectId: string;
        status: string;
        hours: string;
        advisorId: string | null;
      }>(sql`
        select r."userId", r."projectId", r.status, r.hours::text, p."advisorId"
        from platform."projectReports" r
        join platform.projects p on p.id = r."projectId"
        where r.id = ${reportId}::uuid
        for update of r`);
      if (!report) refuse("That report was not found.");
      const verdict = reviewVerdict({
        actorId: actor.userId,
        canReview: rules.reviewProjectReports(actor),
        advisorId: report.advisorId,
        authorId: report.userId,
      });
      if (verdict !== "yes") refuse(REVIEW_REFUSAL[verdict]);
      if (report.status !== "submitted")
        refuse("That report was already reviewed.");

      if (decision.action === "approve") {
        await tx
          .update(projectReports)
          .set({
            status: "approved",
            approvedHours: decision.hours.toFixed(2),
            reviewedBy: actor.userId,
            reviewedAt: new Date(),
            reviewNote: null,
            updatedAt: new Date(),
          })
          .where(eq(projectReports.id, reportId));
        await audit(
          tx,
          actor.userId,
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
      } else {
        await tx
          .update(projectReports)
          .set({
            status: "returned",
            approvedHours: null,
            reviewedBy: actor.userId,
            reviewedAt: new Date(),
            reviewNote: note,
            updatedAt: new Date(),
          })
          .where(eq(projectReports.id, reportId));
        await audit(
          tx,
          actor.userId,
          "projectReport.returned",
          "projectReport",
          reportId,
          { authorId: report.userId, projectId: report.projectId, note },
        );
      }
      return { authorId: report.userId };
    });
  }, done);
}
