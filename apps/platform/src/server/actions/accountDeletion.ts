"use server";

import {
  expected,
  ExpectedFailure,
  failure,
  type ActionResult,
} from "~/lib/actionResult";
import { authorizeSession, authorize, rules } from "~/server/auth/access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { expectSession } from "~/server/auth";
import {
  cancelAccountDeletion,
  NOT_ALLOWED,
  scheduleAccountDeletion,
} from "~/server/accountDeletion/schedule";

const MAX_REASON_LENGTH = 500;

/**
 * Schedules a deletion of `userId`'s account: the caller's own, or, for an
 * officer holding `canDeleteAccounts`, any member's. Fourteen days from now,
 * with the caller's session as the actor.
 *
 * The actor is read from the session here and never accepted from the browser:
 * a server action is a public endpoint, and `scheduleAccountDeletion` (the
 * function behind it, `~/server/accountDeletion/schedule`) trusts the actor it
 * is given. Returns the date as an ISO string, which the caller formats.
 *
 * Refuses the sole holder of President ("Grant President to someone else
 * first"), and an officer without `canDeleteAccounts`. A refusal comes back as
 * a failure, not a throw: Next replaces the message of an error thrown from a
 * server action with a generic one in production, and that sentence is
 * exactly what the member needs to read. A member who schedules their own
 * deletion is signed out by it, so the caller should send them to
 * `/dashboard/deletion` afterwards.
 */
export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<ActionResult<{ scheduledFor: string }>> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (access.caller.userId !== userId) {
    const permission = await authorize(rules.deleteAccounts);
    if (!permission.ok) return failure(NOT_ALLOWED);
  }

  const actorUserId = access.caller.userId;
  // An empty reason is no reason.
  const sliced = reason?.trim().slice(0, MAX_REASON_LENGTH);
  const trimmedReason = sliced === undefined || sliced === "" ? null : sliced;
  return expected(async () => {
    const result = await scheduleAccountDeletion(userId, actorUserId, {
      reason: trimmedReason,
    });
    revalidatePath("/dashboard/moderation/users/[userId]", "page");
    return { scheduledFor: result.scheduledFor.toISOString() };
  }, "Account scheduled for deletion.");
}

/**
 * An officer cancels a member's pending deletion from the console. The
 * member's own route is `keepMyAccount`. Needs `canDeleteAccounts`; it fails
 * with a message when there was nothing to cancel or the job has already
 * started.
 */
export async function cancelMemberDeletion(
  userId: string,
): Promise<ActionResult> {
  const access = await authorizeSession();
  if (!access.ok) return access;
  if (access.caller.userId !== userId) {
    const permission = await authorize(rules.deleteAccounts);
    if (!permission.ok) return failure(NOT_ALLOWED);
  }

  const actorUserId = access.caller.userId;
  return expected(async (): Promise<undefined> => {
    const cancelled = await cancelAccountDeletion(userId, actorUserId);
    if (!cancelled) {
      throw new ExpectedFailure(
        "There is no pending deletion to cancel, or it has started.",
      );
    }
    revalidatePath("/dashboard/moderation/users/[userId]", "page");
  }, "Deletion cancelled.");
}

/**
 * "Keep my account": cancels the signed-in member's own pending deletion and
 * takes them to their profile settings. Nothing to cancel (or too late) goes
 * back to the pending page, which says which.
 */
export async function keepMyAccount(): Promise<void> {
  const access = await authorizeSession();
  if (!access.ok) {
    await expectSession().catch(() =>
      redirect("/auth?callbackPath=%2Fdashboard%2Fdeletion"),
    );
    throw new Error(access.message);
  }

  const userId = await expectSession().catch(() =>
    redirect("/auth?callbackPath=%2Fdashboard%2Fdeletion"),
  );
  const kept = await cancelAccountDeletion(userId);
  redirect(kept ? "/dashboard/profile" : "/dashboard/deletion");
}
