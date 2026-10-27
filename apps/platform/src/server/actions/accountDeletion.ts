"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { expectSession } from "~/server/auth";
import {
  cancelAccountDeletion,
  NO_SUCH_MEMBER,
  NOT_ALLOWED,
  scheduleAccountDeletion,
  SOLE_PRESIDENT_ERROR,
} from "~/server/accountDeletion/schedule";

/**
 * What a deletion action answers. A refusal comes back as a value, not a
 * throw: Next replaces the message of an error thrown from a server action
 * with a generic one in production, and "Grant President to someone else
 * first" is exactly the sentence the member needs to read.
 */
export type DeletionActionResult =
  { ok: true; scheduledFor?: string } | { ok: false; error: string };

/** The refusals written for a person to read; anything else is a real failure. */
const REFUSALS = new Set([SOLE_PRESIDENT_ERROR, NOT_ALLOWED, NO_SUCH_MEMBER]);

function refusal(error: unknown): DeletionActionResult {
  if (error instanceof Error && REFUSALS.has(error.message)) {
    return { ok: false, error: error.message };
  }
  throw error;
}

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
 * first"), and an officer without `canDeleteAccounts`. A member who schedules
 * their own deletion is signed out by it, so the caller should send them to
 * `/account/deletion` afterwards.
 */
export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<DeletionActionResult> {
  const actorUserId = await expectSession();
  // An empty reason is no reason.
  const sliced = reason?.trim().slice(0, MAX_REASON_LENGTH);
  const trimmedReason = sliced === undefined || sliced === "" ? null : sliced;
  try {
    const result = await scheduleAccountDeletion(userId, actorUserId, {
      reason: trimmedReason,
    });
    revalidatePath("/console/moderation/users/[userId]", "page");
    return { ok: true, scheduledFor: result.scheduledFor.toISOString() };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * An officer cancels a member's pending deletion from the console. The
 * member's own route is `keepMyAccount`. Needs `canDeleteAccounts`; `ok` is
 * false with a message when there was nothing to cancel or the job has already
 * started.
 */
export async function cancelMemberDeletion(
  userId: string,
): Promise<DeletionActionResult> {
  const actorUserId = await expectSession();
  try {
    const cancelled = await cancelAccountDeletion(userId, actorUserId);
    if (!cancelled) {
      return {
        ok: false,
        error: "There is no pending deletion to cancel, or it has started.",
      };
    }
    revalidatePath("/console/moderation/users/[userId]", "page");
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * "Keep my account": cancels the signed-in member's own pending deletion and
 * takes them to their profile settings. Nothing to cancel (or too late) goes
 * back to the pending page, which says which.
 */
export async function keepMyAccount(): Promise<void> {
  const userId = await expectSession().catch(() =>
    redirect("/auth?callbackPath=%2Faccount%2Fdeletion"),
  );
  const kept = await cancelAccountDeletion(userId);
  redirect(kept ? "/settings/profile" : "/account/deletion");
}
