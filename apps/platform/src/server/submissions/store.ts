/**
 * A Submission: a Project entered into a Hackathon, with its link, its team of
 * DevDogs members and an optional result (D0 section 2, Q48).
 *
 * Owners record them. Every function takes the actor's id and applies the
 * record rule itself (`mayEdit`) before touching anything, so the three actions
 * in `~/server/actions/submissions.ts` only authorize the session, parse and
 * revalidate. Refusals are `ExpectedFailure`.
 *
 * The database holds the structural rules (a unique link, a link's shape, the
 * foreign keys). The ones a constraint cannot say live here: the Hackathon
 * must be approved, the team has at least one member and every member has a profile
 * (a member, not just a sign-in). A team may later become empty, when an account is erased; the
 * Submission stays.
 */
import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { ExpectedFailure } from "~/lib/actionResult";
import { callerFor, rules } from "~/server/auth/access";
import { db } from "~/server/db";
import {
  hackathons,
  profiles,
  submissionMembers,
  submissions,
} from "~/server/db/schema";
import { canonicalHttpsUrl } from "~/server/hackathons/url";

export const RESULT_MAX = 280;
export const TEAM_MAX = 20;

export type SubmissionInput = {
  url: string;
  teamUserIds: readonly string[];
  result?: string | null;
};

const PG_UNIQUE = "23505";
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === PG_UNIQUE) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * The record rule for a Project's Submissions: an explicit Owner of the
 * Project, or an Officer when the Project is DevDogs-owned. A Project that does
 * not exist is not editable by anyone.
 */
export async function mayEdit(
  actorId: string,
  projectId: string,
): Promise<boolean> {
  const [project] = await db.execute<{ owner: boolean; devdogsOwned: boolean }>(
    sql`select p."devdogsOwned",
      exists (select 1 from platform."projectOwners" o
        where o."projectId" = p.id and o."userId" = ${actorId}::uuid) as owner
      from platform.projects p where p.id = ${projectId}::uuid`,
  );
  if (!project) return false;
  if (project.owner) return true;
  return project.devdogsOwned && (await callerFor(actorId).then(rules.officer));
}

type Checked = { url: string; teamUserIds: string[]; result: string | null };

/** Everything about the input that needs no Hackathon: the link, the result, the team. */
async function check(input: SubmissionInput): Promise<Checked> {
  const errors: Record<string, string> = {};
  const url = canonicalHttpsUrl(input.url);
  if (url === null) errors.url = "Enter the submission's web address (https).";
  const result = input.result?.trim() ?? "";
  if (result.length > RESULT_MAX)
    errors.result = `Use at most ${RESULT_MAX} characters.`;
  const team = [...new Set(input.teamUserIds)];
  if (team.length === 0) errors.team = "Add at least one team member.";
  else if (team.length > TEAM_MAX)
    errors.team = `A team has at most ${TEAM_MAX} members.`;
  if (Object.keys(errors).length > 0 || url === null)
    throw new ExpectedFailure("Check the highlighted fields.", errors);
  const known = await db
    .select({ id: profiles.userId })
    .from(profiles)
    .where(inArray(profiles.userId, team));
  if (known.length !== team.length)
    throw new ExpectedFailure("Every team member must be a DevDogs member.", {
      team: "Every team member must be a DevDogs member.",
    });
  return { url, teamUserIds: team, result: result === "" ? null : result };
}

const LINK_TAKEN = new ExpectedFailure(
  "That submission link is already recorded.",
  {
    url: "That submission link is already recorded.",
  },
);

/** Records a Project's Submission to an approved Hackathon and returns its id. */
export async function saveNewSubmission(
  actorId: string,
  projectId: string,
  hackathonId: string,
  input: SubmissionInput,
): Promise<{ id: string }> {
  if (!(await mayEdit(actorId, projectId)))
    throw new ExpectedFailure(
      "Only the project's owners can record submissions.",
    );
  const valid = await check(input);
  const [hackathon] = await db
    .select({ approval: hackathons.approval })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  if (hackathon?.approval !== "approved")
    throw new ExpectedFailure("That hackathon isn't approved yet.");
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(submissions)
        .values({
          projectId,
          hackathonId,
          url: valid.url,
          result: valid.result,
          recordedBy: actorId,
        })
        .returning({ id: submissions.id });
      if (!created) throw new Error("Submission was not created.");
      await tx.insert(submissionMembers).values(
        valid.teamUserIds.map((userId) => ({
          submissionId: created.id,
          userId,
        })),
      );
      return { id: created.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw LINK_TAKEN;
    throw error;
  }
}

/**
 * The Submission and its Project, for an actor who may edit it. A Submission
 * that does not exist and one the actor may not edit fail the same way, so the
 * message does not say which ids are real.
 */
async function editable(actorId: string, submissionId: string) {
  const [row] = await db
    .select({ projectId: submissions.projectId })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!row || !(await mayEdit(actorId, row.projectId)))
    throw new ExpectedFailure("That submission was not found.");
  return row;
}

/**
 * Replaces a Submission's link, team and result. Its Project and Hackathon are
 * fixed: a Submission to a different event is a different Submission.
 */
export async function saveSubmissionEdit(
  actorId: string,
  submissionId: string,
  input: SubmissionInput,
): Promise<{ projectId: string }> {
  const { projectId } = await editable(actorId, submissionId);
  const valid = await check(input);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({ url: valid.url, result: valid.result })
        .where(eq(submissions.id, submissionId));
      await tx
        .delete(submissionMembers)
        .where(
          and(
            eq(submissionMembers.submissionId, submissionId),
            notInArray(submissionMembers.userId, valid.teamUserIds),
          ),
        );
      await tx
        .insert(submissionMembers)
        .values(valid.teamUserIds.map((userId) => ({ submissionId, userId })))
        .onConflictDoNothing();
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw LINK_TAKEN;
    throw error;
  }
  return { projectId };
}

/** Deletes a Submission; its team goes with it. The Hackathon and Project stay. */
export async function deleteSubmissionRecord(
  actorId: string,
  submissionId: string,
): Promise<{ projectId: string }> {
  const { projectId } = await editable(actorId, submissionId);
  await db.delete(submissions).where(eq(submissions.id, submissionId));
  return { projectId };
}
