"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { userSuspensions } from "~/server/db/schema";
import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";
import { canUserManageSuspensions } from "~/server/actions/permissions";

// 10 years in hours — effectively permanent ban via Supabase's native mechanism
const BAN_DURATION = "87600h";

/** Adds a global suspension record for `userId`. */
async function suspendUser(
  userId: string,
  reason: string | undefined,
  suspendedBy: string,
) {
  await db
    .insert(userSuspensions)
    .values({ userId, service: "global", reason, suspendedBy })
    .onConflictDoUpdate({
      target: [userSuspensions.userId, userSuspensions.service],
      set: { reason, suspendedBy, suspendedAt: new Date() },
    });
}

/** Removes the global suspension record for `userId` (no-op if none). */
async function unsuspendUser(userId: string) {
  await db
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
 * action into the app's own data and writes any suspension — all in one
 * transaction, so a content action that cannot be applied aborts the whole
 * thing rather than leaving a decision whose effect never landed.
 *
 * It lives in SQL because this is not the only caller: the contributor tooling
 * runs in a browser against a *different* instance, where a server action on
 * this one cannot reach. Two implementations of one workflow is what the
 * retired `OAuthReports` component was, and it had already drifted.
 *
 * What stays here is the one thing SQL cannot do — Supabase's native ban. The
 * RPC hands back `bannedUserId` when a decision calls for one, and this caller,
 * which holds admin credentials, finishes the job.
 *
 * Runs as `postgres` through Drizzle, so `has_permission()` inside the function
 * has no `auth.uid()` to read; authorization is therefore established here and
 * the caller is passed explicitly.
 */
export async function resolveReport(
  reportId: string,
  subjectAction: "warn" | "suspend" | "ban" | "no_action",
  filerAction: "warn" | "suspend" | "no_action",
  contentAction: "quarantine" | "no_action",
  note?: string,
  applyGlobally?: boolean,
): Promise<void> {
  const moderatorUserId = await expectSession();

  const rows = await db.execute<{
    resolve_report: { bannedUserId: string | null };
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
  );

  const bannedUserId = rows[0]?.resolve_report?.bannedUserId ?? null;
  if (bannedUserId) {
    await supabaseAdmin.auth.admin.updateUserById(bannedUserId, {
      ban_duration: BAN_DURATION,
    });
  }
}

/** Dismisses an open report without acting against the users or the content. */
export async function dismissReport(
  reportId: string,
  note?: string,
): Promise<void> {
  const moderatorUserId = await expectSession();

  await db.execute(
    sql`select "platform".dismiss_report_as(
          ${moderatorUserId}::uuid, ${reportId}::uuid, ${note ?? null}
        )`,
  );
}

/**
 * Directly sets a user's org-wide standing, from the user management panel.
 *
 * - `"member"` → clears the suspension and any Supabase ban
 * - `"suspended"` → records a global suspension
 * - `"banned"` → suspension plus Supabase's native ban
 */
export async function updateUserRole(
  userId: string,
  role: "member" | "suspended" | "banned",
  reason?: string,
): Promise<void> {
  const callerUserId = await expectSession();

  if (!(await canUserManageSuspensions(callerUserId))) {
    throw new Error("Not authorized to change user standing");
  }

  if (role === "member") {
    await Promise.all([
      unsuspendUser(userId),
      supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "none" }),
    ]);
  } else if (role === "suspended") {
    await suspendUser(userId, reason, callerUserId);
  } else {
    await Promise.all([
      suspendUser(userId, reason, callerUserId),
      supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: BAN_DURATION,
      }),
    ]);
  }
}
