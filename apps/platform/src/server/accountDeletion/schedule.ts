import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { env } from "~/env";
import { COMMUNITY_PATH, profilePath } from "~/lib/profilePath";
import { canUserDeleteAccounts } from "~/server/actions/permissions";
import { db } from "~/server/db";
import {
  accountDeletions,
  auditEvents,
  profiles,
  userRoles,
} from "~/server/db/schema";
import { sendTemplate } from "~/server/email/send";
import { revalidateOfficers } from "~/server/loaders/officers";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { accountDeletionAuditEvent } from "./audit";
import { deletionDueAt, formatDeletionDate } from "./dates";

/** The President role's fixed id (`seed/roles/president.sql`). */
export const PRESIDENT_ROLE_ID = "00000000-0000-0000-0000-000000000002";

export const SOLE_PRESIDENT_ERROR = "Grant President to someone else first";
export const NOT_ALLOWED = "Not authorized: canDeleteAccounts required";
export const NO_SUCH_MEMBER = "No such member";

/** What the emails call a member: their preferred name, or "there". */
export function greetingName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "there";
  return trimmed;
}

export type ScheduledDeletion = {
  userId: string;
  scheduledFor: Date;
  /** False when a deletion was already pending and nothing changed. */
  created: boolean;
};

/**
 * What a member's pending deletion looks like to the page that shows it. Null
 * when none is scheduled.
 */
export async function getPendingDeletion(userId: string): Promise<{
  scheduledFor: Date;
  requestedByOfficer: boolean;
  /** The job has begun: it can no longer be cancelled. */
  started: boolean;
} | null> {
  const [row] = await db
    .select({
      scheduledFor: accountDeletions.scheduledFor,
      requestedBy: accountDeletions.requestedBy,
      lastAttemptAt: accountDeletions.lastAttemptAt,
    })
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    started: row.lastAttemptAt !== null,
    scheduledFor: row.scheduledFor,
    requestedByOfficer: row.requestedBy !== null && row.requestedBy !== userId,
  };
}

/** True when `userId` holds President and nobody else does. */
export async function isSolePresident(userId: string): Promise<boolean> {
  const holders = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, PRESIDENT_ROLE_ID));
  return holders.length === 1 && holders[0]!.userId === userId;
}

/**
 * Drops the cached public pages a member's visibility change shows up on: the
 * directory and their profile, both `revalidate`-cached (account-deletion Q4:
 * hidden on confirm). Call it while the profile row still exists.
 */
export async function revalidateMemberPages(userId: string): Promise<void> {
  const [row] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  revalidatePath(COMMUNITY_PATH);
  if (row?.handle) revalidatePath(profilePath(row.handle));
}

/**
 * Ends every session the member has. Their access tokens stay valid until they
 * expire (GoTrue verifies those without a lookup), which is why the pending
 * page, not the session, is what holds the account closed.
 */
async function revokeSessions(userId: string): Promise<void> {
  await db.execute(
    sql`delete from auth.sessions where user_id = ${userId}::uuid`,
  );
}

/**
 * Schedules a member's account for deletion in fourteen days
 * (account-deletion Q4, Q5, Q13).
 *
 * `actorUserId` is who is asking: the member themself, or an officer holding
 * `canDeleteAccounts`. Anyone else is refused. The sole holder of President is
 * refused too, whoever asks: the role can only be bootstrapped from the
 * command line, and deleting its only holder would strand the club.
 *
 * Scheduling twice is not an error and changes nothing, so a double click or
 * a retried request neither moves the date nor sends a second email.
 *
 * On a first schedule: the row and its audit entry commit together; then the
 * member's sessions are revoked, their profile is hidden (the public-profile
 * view and the officer board both read the row), and the UGA address is told.
 * The email is a notification after a committed write: a failure is logged,
 * not unwound.
 *
 * Not a server action: it trusts `actorUserId`. The callable action is
 * `requestAccountDeletion` in `~/server/actions/accountDeletion`.
 */
export async function scheduleAccountDeletion(
  userId: string,
  actorUserId: string,
  options: { reason?: string | null; now?: Date } = {},
): Promise<ScheduledDeletion> {
  const byOfficer = actorUserId !== userId;
  if (byOfficer && !(await canUserDeleteAccounts(actorUserId))) {
    throw new Error(NOT_ALLOWED);
  }

  const [member] = await db
    .select({ email: usersInAuth.email, name: profiles.preferredName })
    .from(usersInAuth)
    .leftJoin(profiles, eq(profiles.userId, usersInAuth.id))
    .where(eq(usersInAuth.id, userId))
    .limit(1);
  if (!member?.email) throw new Error(NO_SUCH_MEMBER);

  if (await isSolePresident(userId)) throw new Error(SOLE_PRESIDENT_ERROR);

  const now = options.now ?? new Date();
  const scheduledFor = deletionDueAt(now);
  const reason = options.reason?.trim() ? options.reason.trim() : null;

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(accountDeletions)
      .values({
        userId,
        scheduledFor,
        requestedBy: actorUserId,
        reason,
        email: member.email!,
        name: member.name,
      })
      .onConflictDoNothing()
      .returning({ userId: accountDeletions.userId });
    if (inserted.length === 0) return false;

    await tx.insert(auditEvents).values(
      accountDeletionAuditEvent({
        actorUserId,
        action: "user.deletion_scheduled",
        userId,
        metadata: {
          scheduledFor: scheduledFor.toISOString(),
          byOfficer,
          hasReason: reason !== null,
        },
      }),
    );
    return true;
  });

  if (!created) {
    const pending = await getPendingDeletion(userId);
    return {
      userId,
      scheduledFor: pending?.scheduledFor ?? scheduledFor,
      created: false,
    };
  }

  await revokeSessions(userId);
  revalidateOfficers();
  await revalidateMemberPages(userId);

  const result = await sendTemplate(member.email, "AccountDeletionScheduled", {
    name: greetingName(member.name),
    requestedLine: byOfficer
      ? "A DevDogs officer scheduled your account for deletion."
      : "You asked to delete your account.",
    scheduledDate: formatDeletionDate(scheduledFor),
    keepUrl: `${env.BASE_URL}/account/deletion`,
  });
  if (!result.ok) {
    console.error("account_deletion_email_failed", {
      template: "AccountDeletionScheduled",
      reason: result.reason,
    });
  }

  return { userId, scheduledFor, created: true };
}

/**
 * Keep my account: cancels a pending deletion, which restores the profile.
 * Returns false when there was nothing to cancel, or it is too late: the job
 * stamps `lastAttemptAt` before it touches anything, and a deletion it has
 * started may already have removed the member's apps, so it runs to the end.
 * (The row outlives the auth user for a moment, so that is checked too.)
 */
export async function cancelAccountDeletion(
  userId: string,
  /** Who cancels: the member (Keep my account) or an officer holding `canDeleteAccounts`. */
  actorUserId: string = userId,
): Promise<boolean> {
  const cancelledByOfficer = actorUserId !== userId;
  if (cancelledByOfficer && !(await canUserDeleteAccounts(actorUserId))) {
    throw new Error(NOT_ALLOWED);
  }
  const cancelled = await db.transaction(async (tx) => {
    const [stillThere] = await tx
      .select({ id: usersInAuth.id })
      .from(usersInAuth)
      .where(eq(usersInAuth.id, userId))
      .limit(1);
    if (!stillThere) return false;

    const removed = await tx
      .delete(accountDeletions)
      .where(
        and(
          eq(accountDeletions.userId, userId),
          isNull(accountDeletions.lastAttemptAt),
        ),
      )
      .returning({ requestedBy: accountDeletions.requestedBy });
    if (removed.length === 0) return false;

    await tx.insert(auditEvents).values(
      accountDeletionAuditEvent({
        actorUserId,
        action: "user.deletion_cancelled",
        userId,
        metadata: {
          cancelledByOfficer,
          byOfficer:
            removed[0]!.requestedBy !== null &&
            removed[0]!.requestedBy !== userId,
        },
      }),
    );
    return true;
  });
  if (cancelled) {
    revalidateOfficers();
    await revalidateMemberPages(userId);
  }
  return cancelled;
}
