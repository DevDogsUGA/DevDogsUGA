"use server";

import { redirect } from "next/navigation";
import { expectSession } from "~/server/auth";
import {
  cancelAccountDeletion,
  scheduleAccountDeletion,
} from "~/server/accountDeletion/schedule";

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
 * Throws "Grant President to someone else first" for the sole holder of
 * President. A member who schedules their own deletion is signed out by it, so
 * the caller should send them to `/account/deletion` afterwards.
 */
export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<{ scheduledFor: string }> {
  const actorUserId = await expectSession();
  const result = await scheduleAccountDeletion(userId, actorUserId, {
    reason: reason ?? null,
  });
  return { scheduledFor: result.scheduledFor.toISOString() };
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
