"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expected, failure, type ActionResult } from "~/lib/actionResult";
import { authorizeSession } from "~/server/auth/access";
import {
  deleteSubmissionRecord,
  saveNewSubmission,
  saveSubmissionEdit,
} from "~/server/submissions/store";

/**
 * The Submission actions (Q48). Whether this member may touch this Project's
 * Submissions is the record rule in `server/submissions/store.ts` (an Owner, or
 * an Officer on a DevDogs-owned Project), which each of them applies after the
 * session check here. The form that calls them is on the project page.
 */

const id = z.string().uuid();
const body = z.object({
  url: z.string().max(4096),
  teamUserIds: z.array(z.string().uuid()).max(100),
  result: z.string().max(2000).nullish(),
});

function refresh(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/hackathons");
}

/** Records a Project's Submission to an approved Hackathon. */
export async function recordSubmission(
  projectId: string,
  hackathonId: string,
  url: string,
  teamUserIds: string[],
  result?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = z
    .object({ projectId: id, hackathonId: id })
    .and(body)
    .safeParse({ projectId, hackathonId, url, teamUserIds, result });
  if (!parsed.success) return failure("That submission is invalid.");
  const saved = await expected(
    () =>
      saveNewSubmission(
        access.caller.userId,
        parsed.data.projectId,
        parsed.data.hackathonId,
        parsed.data,
      ),
    "Submission recorded.",
  );
  if (saved.ok) refresh(parsed.data.projectId);
  return saved;
}

/** Replaces a Submission's link, team and result. */
export async function updateSubmission(
  submissionId: string,
  url: string,
  teamUserIds: string[],
  result?: string | null,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = z
    .object({ submissionId: id })
    .and(body)
    .safeParse({ submissionId, url, teamUserIds, result });
  if (!parsed.success) return failure("That submission is invalid.");
  const saved = await expected(
    () =>
      saveSubmissionEdit(
        access.caller.userId,
        parsed.data.submissionId,
        parsed.data,
      ),
    "Submission updated.",
  );
  if (!saved.ok) return saved;
  refresh(saved.data!.projectId);
  return { ok: true, message: saved.message };
}

/** Deletes a Submission. */
export async function deleteSubmission(
  submissionId: string,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  const parsed = id.safeParse(submissionId);
  if (!parsed.success) return failure("That submission is invalid.");
  const deleted = await expected(
    () => deleteSubmissionRecord(access.caller.userId, parsed.data),
    "Submission deleted.",
  );
  if (!deleted.ok) return deleted;
  refresh(deleted.data!.projectId);
  return { ok: true, message: deleted.message };
}
