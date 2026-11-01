"use server";

import {
  expected,
  ExpectedFailure,
  failure,
  success,
  type ActionResult,
} from "~/lib/actionResult";
import { authorize, callerFor, rules } from "~/server/auth/access";

import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { userSuspensions } from "~/server/db/schema";

import { supabaseAdmin } from "~/supabase/admin";

import { raisedMessage } from "~/server/moderation/errors";
import { queueDeliveriesQuietly } from "~/server/moderation/queue";

const STANDING_FORBIDDEN = "You cannot change a user's standing.";

// 10 years in hours, so a permanent ban through Supabase's own ban field.
const BAN_DURATION = "87600h";

/**
 * What the decision functions raise for a report that cannot be decided, as
 * the refusal the moderator reads. Anything else is a bug and still throws.
 */
function reportRefusal(error: unknown): never {
  const raised = raisedMessage(error);
  if (raised.includes("has already been decided")) {
    throw new ExpectedFailure("Someone has already decided this report.");
  }
  if (raised.includes("does not exist")) {
    throw new ExpectedFailure("That report no longer exists.");
  }
  throw error;
}

/** `db` or a transaction on it. */
type Executor = Pick<typeof db, "insert" | "delete" | "execute">;

/** Adds a global suspension record for `userId`. */
async function suspendUser(
  tx: Executor,
  userId: string,
  reason: string | undefined,
  suspendedBy: string,
) {
  await tx
    .insert(userSuspensions)
    .values({ userId, service: "global", reason, suspendedBy })
    .onConflictDoUpdate({
      target: [userSuspensions.userId, userSuspensions.service],
      set: { reason, suspendedBy, suspendedAt: new Date() },
    });
}

/** Removes the global suspension record for `userId` (no-op if none). */
async function unsuspendUser(tx: Executor, userId: string) {
  await tx
    .delete(userSuspensions)
    .where(
      and(
        eq(userSuspensions.userId, userId),
        eq(userSuspensions.service, "global"),
      ),
    );
}

/**
 * Resolves an open report with a moderation decision.
 *
 * The decision itself is `platform.resolve_report()`, not code here. That
 * function updates the report, records the resolution, carries the content
 * action into the app's own data and writes any suspension, all in one
 * transaction, so a content action that cannot be applied aborts the whole
 * thing rather than leaving a decision whose effect never landed.
 *
 * It lives in SQL because this is not the only caller: the contributor tooling
 * runs in a browser against a *different* instance, where a server action on
 * this one cannot reach. Two implementations of one workflow is what the
 * retired `OAuthReports` component was, and it had already drifted.
 *
 * What stays here is the one thing SQL cannot do: Supabase's native ban. The
 * RPC hands back `bannedUserId` when a decision calls for one, and this caller
 * holds the admin credentials to finish the job.
 *
 * Runs as `postgres` through Drizzle, so `has_permission()` inside the function
 * has no `auth.uid()` to read. This action authorizes the caller itself and
 * passes the caller id in. A report someone else already decided comes back as
 * a failure, not a thrown error.
 */
export async function resolveReport(
  reportId: string,
  subjectAction: "warn" | "suspend" | "ban" | "no_action",
  filerAction: "warn" | "suspend" | "no_action",
  contentAction: "quarantine" | "no_action",
  note?: string,
  applyGlobally?: boolean,
): Promise<ActionResult> {
  const access = await authorize(rules.moderate);
  if (!access.ok) return access;

  const moderatorUserId = access.caller.userId;

  return expected(async (): Promise<undefined> => {
    const rows = await db
      .execute<{
        resolve_report: {
          bannedUserId: string | null;
          deliveryIds?: string[];
        };
      }>(
        sql`select "platform".resolve_report_as(
          ${moderatorUserId}::uuid,
          ${reportId}::uuid,
          ${subjectAction}::"platform"."subjectAction",
          ${filerAction}::"platform"."filerAction",
          ${contentAction}::"platform"."contentAction",
          ${note ?? null},
          ${applyGlobally ?? false}
        ) as resolve_report`,
      )
      .catch(reportRefusal);

    const bannedUserId = rows[0]?.resolve_report?.bannedUserId ?? null;
    if (bannedUserId) {
      await supabaseAdmin.auth.admin.updateUserById(bannedUserId, {
        ban_duration: BAN_DURATION,
      });
    }

    // A report on an app outside this database leaves signed deliveries behind,
    // written in the decision's own transaction. Queuing them is best effort:
    // the 15-minute cron picks up any that did not make it onto the queue.
    await queueDeliveriesQuietly(rows[0]?.resolve_report?.deliveryIds ?? []);
  }, "Report resolved.");
}

/** Dismisses an open report without acting against the users or the content. */
export async function dismissReport(
  reportId: string,
  note?: string,
): Promise<ActionResult> {
  const access = await authorize(rules.moderate);
  if (!access.ok) return access;

  const moderatorUserId = access.caller.userId;

  return expected(async (): Promise<undefined> => {
    await db
      .execute(
        sql`select "platform".dismiss_report_as(
          ${moderatorUserId}::uuid, ${reportId}::uuid, ${note ?? null}
        )`,
      )
      .catch(reportRefusal);
  }, "Report dismissed.");
}

/**
 * Directly sets a user's org-wide standing, from the user management panel.
 *
 * - `"member"` → clears the suspension and any Supabase ban
 * - `"suspended"` → records a global suspension
 * - `"banned"` → suspension plus Supabase's native ban
 *
 * A caller without the permission gets a failure, not a thrown error.
 */
export async function updateUserRole(
  userId: string,
  role: "member" | "suspended" | "banned",
  reason?: string,
): Promise<ActionResult> {
  const access = await authorize(rules.manageSuspensions);
  if (!access.ok) return failure(STANDING_FORBIDDEN);

  const callerUserId = access.caller.userId;

  if (!(await callerFor(callerUserId).then(rules.manageSuspensions))) {
    return failure(STANDING_FORBIDDEN);
  }

  // The standing change and the deliveries that tell external apps about it
  // commit together; queuing them comes after.
  const deliveryIds = await db.transaction(async (tx) => {
    if (role === "member") await unsuspendUser(tx, userId);
    else await suspendUser(tx, userId, reason, callerUserId);
    return enqueueStanding(
      tx,
      userId,
      role === "member" ? "restore" : role === "banned" ? "ban" : "suspend",
    );
  });

  if (role === "member") {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
  } else if (role === "banned") {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: BAN_DURATION,
    });
  }

  await queueDeliveriesQuietly(deliveryIds);
  return success(
    undefined,
    role === "member"
      ? "Standing restored."
      : role === "banned"
        ? "User banned."
        : "User suspended.",
  );
}

/**
 * Owes every external app a standing message for `userId`. The reason is left
 * out: a console suspension's reason is internal.
 */
async function enqueueStanding(
  tx: Executor,
  userId: string,
  action: "suspend" | "ban" | "restore",
): Promise<string[]> {
  const rows = await tx.execute<{ ids: string[] }>(
    sql`select to_jsonb("platform".enqueue_user_standing(
          ${userId}::uuid, ${action}, null, null, null
        )) as ids`,
  );
  const ids = rows[0]?.ids ?? [];
  if (ids.length === 0) return [];

  // Only what is ready to send goes on the queue: a delivery recorded as failed
  // (its app has no endpoint) waits for a person and a resend.
  const pending = await tx.execute<{ id: string }>(
    sql`select "id" from "platform"."moderationDeliveries"
        where "status" = 'pending'
          and "id" in (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
  );
  return pending.map((row) => row.id);
}
