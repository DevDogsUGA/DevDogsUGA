"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  contentReports,
  moderatorRoles,
  oauthRegistrations,
  reportContentTypes,
  reportReasons,
  reportResolutions,
  userSuspensions,
} from '~/server/db/schema';
import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";
import { deliverWebhook, type WebhookPayload } from "~/server/reports/webhook";

// 10 years in hours — effectively permanent ban via Supabase's native mechanism
const BAN_DURATION = "87600h";

/**
 * Checks whether `userId` is a moderator for the given OAuth client.
 */
async function isModerator(userId: string, clientId: string): Promise<boolean> {
  const row = await db.query.moderatorRoles.findFirst({
    columns: { id: true },
    where: { userId, clientId },
  });
  return row !== undefined;
}

/**
 * Checks whether `userId` is the owner of the given OAuth client (i.e. the
 * developer who registered it). Used to allow dev-client owners to process
 * reports through the simulated dashboard without a moderatorRoles grant.
 */
async function isClientOwner(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const row = await db.query.oauthRegistrations.findFirst({
    columns: { userId: true },
    where: { clientId },
  });
  return row?.userId === userId;
}

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

// ── Public actions ─────────────────────────────────────────────────────────────

/**
 * Resolves a pending content report with a moderation decision.
 *
 * The caller must either hold a `moderatorRoles` grant for the report's client,
 * or be the registered owner of a development client (dev simulation).
 *
 * When `applyGlobally` is true:
 * - `subjectAction = "suspend"` → upserts `userRoles.role = "suspended"` for the reported user
 * - `subjectAction = "ban"` → upserts `userRoles.role = "suspended"` + Supabase native ban
 * - `filerAction = "suspend"` → upserts `userRoles.role = "suspended"` for the reporter
 * - `"warn"` in either dimension records the reason text but does not change the role
 */
export async function resolveReport(
  reportId: string,
  subjectAction: "warn" | "suspend" | "ban" | "no_action",
  filerAction: "warn" | "suspend" | "no_action",
  contentAction: "quarantine" | "no_action",
  note?: string,
  applyGlobally?: boolean,
): Promise<WebhookPayload | null> {
  const moderatorUserId = await expectSession();

  const report = await db.query.contentReports.findFirst({
    columns: {
      id: true,
      clientId: true,
      reporterUserId: true,
      reportedUserId: true,
      contentId: true,
      contentTypeId: true,
      status: true,
    },
    where: { id: reportId },
  });

  if (!report) throw new Error("Report not found");
  if (report.status !== "pending") throw new Error("Report is not pending");

  const [canModerate, canOwner] = await Promise.all([
    isModerator(moderatorUserId, report.clientId),
    isClientOwner(moderatorUserId, report.clientId),
  ]);

  if (!canModerate && !canOwner) {
    throw new Error("Not authorized to resolve this report");
  }

  let resolutionId: string;

  await db.transaction(async (tx) => {
    // Mark report resolved
    await tx
      .update(contentReports)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(contentReports.id, reportId));

    // Insert resolution
    const [resolution] = await tx
      .insert(reportResolutions)
      .values({
        reportId,
        moderatorUserId,
        subjectAction,
        filerAction,
        contentAction,
        appliedGlobally: applyGlobally ?? false,
        moderatorNote: note,
      })
      .returning({ id: reportResolutions.id });

    resolutionId = resolution!.id;
  });

  // Apply global actions outside the transaction (Supabase admin calls are external)
  if (applyGlobally) {
    if (subjectAction === "suspend") {
      await suspendUser(report.reportedUserId, undefined, moderatorUserId);
    } else if (subjectAction === "ban") {
      await Promise.all([
        suspendUser(report.reportedUserId, undefined, moderatorUserId),
        supabaseAdmin.auth.admin.updateUserById(report.reportedUserId, {
          ban_duration: BAN_DURATION,
        }),
      ]);
    }

    if (filerAction === "suspend") {
      await suspendUser(report.reporterUserId, undefined, moderatorUserId);
    }
  }

  const contentTypeRow = report.contentTypeId
    ? await db.query.reportContentTypes.findFirst({
        where: { id: report.contentTypeId },
        columns: { label: true },
      })
    : null;

  // Attempt inline webhook delivery (failures are retried by the cron job)
  await deliverWebhook(resolutionId!);

  return {
    event: "report.resolved",
    reportId: report.id,
    reportedUserId: report.reportedUserId,
    reporterUserId: report.reporterUserId,
    contentId: report.contentId,
    contentTypeLabel: contentTypeRow?.label ?? null,
    subjectAction,
    filerAction,
    contentAction,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Dismisses a pending report without taking any action against the users or
 * content. Never updates `userRoles` or triggers a Supabase ban.
 */
export async function dismissReport(
  reportId: string,
  note?: string,
): Promise<void> {
  const moderatorUserId = await expectSession();

  const report = await db.query.contentReports.findFirst({
    columns: { id: true, clientId: true, status: true },
    where: { id: reportId },
  });

  if (!report) throw new Error("Report not found");
  if (report.status !== "pending") throw new Error("Report is not pending");

  const [canModerate, canOwner] = await Promise.all([
    isModerator(moderatorUserId, report.clientId),
    isClientOwner(moderatorUserId, report.clientId),
  ]);

  if (!canModerate && !canOwner) {
    throw new Error("Not authorized to dismiss this report");
  }

  let resolutionId: string;

  await db.transaction(async (tx) => {
    await tx
      .update(contentReports)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(eq(contentReports.id, reportId));

    const [resolution] = await tx
      .insert(reportResolutions)
      .values({
        reportId,
        moderatorUserId,
        subjectAction: "no_action",
        filerAction: "no_action",
        contentAction: "no_action",
        appliedGlobally: false,
        moderatorNote: note,
      })
      .returning({ id: reportResolutions.id });

    resolutionId = resolution!.id;
  });

  await deliverWebhook(resolutionId!);
}

/**
 * Directly updates a user's org-wide role. Intended for the user management
 * panel accessible from the moderation dashboard.
 *
 * The caller must hold a `moderatorRoles` grant for at least one production
 * client, or the call is rejected.
 *
 * - `"member"` → removes suspension + clears Supabase native ban (harmless if not banned)
 * - `"suspended"` → upserts `userRoles.role = "suspended"`
 * - `"banned"` → upserts `userRoles.role = "suspended"` + Supabase native ban
 */
export async function updateUserRole(
  userId: string,
  role: "member" | "suspended" | "banned",
  reason?: string,
): Promise<void> {
  const callerUserId = await expectSession();

  // Caller must moderate at least one production client
  const hasProductionRole = await db
    .select({ id: moderatorRoles.id })
    .from(moderatorRoles)
    .innerJoin(
      oauthRegistrations,
      eq(oauthRegistrations.clientId, moderatorRoles.clientId),
    )
    .where(
      and(
        eq(moderatorRoles.userId, callerUserId),
        eq(oauthRegistrations.type, "production"),
      ),
    )
    .limit(1);

  if (hasProductionRole.length === 0) {
    throw new Error(
      "Not authorized: must be a moderator for at least one production client",
    );
  }

  if (role === "member") {
    // Unsuspend: remove suspension row + clear any Supabase ban
    await Promise.all([
      unsuspendUser(userId),
      supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "none" }),
    ]);
  } else if (role === "suspended") {
    await suspendUser(userId, reason, callerUserId);
  } else {
    // "banned": suspend in our DB + Supabase native ban
    await Promise.all([
      suspendUser(userId, reason, callerUserId),
      supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: BAN_DURATION,
      }),
    ]);
  }
}

export interface UnverifiedReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  contentId: string;
  contentSnapshot: string;
  contentUrl: string | null;
  description: string | null;
  reason: { id: string; title: string; description: string | null } | null;
  contentType: { id: string; label: string } | null;
}

/**
 * Returns unverified reports for the given OAuth client.
 * Only accessible to the client owner (the developer who registered it).
 * Used by the webhook Connect relay in the testing dashboard.
 */
export async function getUnverifiedReports(
  clientId: string,
): Promise<UnverifiedReport[]> {
  const userId = await expectSession();

  const reg = await db.query.oauthRegistrations.findFirst({
    columns: { userId: true },
    where: { clientId },
  });
  if (reg?.userId !== userId) return [];

  const rows = await db.query.contentReports.findMany({
    where: { clientId, status: "unverified" },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) return [];

  const reasonIds = [...new Set(rows.map((r) => r.reasonId))];
  const contentTypeIds = [
    ...new Set(
      rows.map((r) => r.contentTypeId).filter((id): id is string => id != null),
    ),
  ];

  const [reasonRows, contentTypeRows] = await Promise.all([
    db
      .select({ id: reportReasons.id, title: reportReasons.title, description: reportReasons.description })
      .from(reportReasons)
      .where(inArray(reportReasons.id, reasonIds)),
    contentTypeIds.length > 0
      ? db
          .select({ id: reportContentTypes.id, label: reportContentTypes.label })
          .from(reportContentTypes)
          .where(inArray(reportContentTypes.id, contentTypeIds))
      : Promise.resolve([]),
  ]);

  const reasonMap = new Map(reasonRows.map((r) => [r.id, r]));
  const contentTypeMap = new Map(contentTypeRows.map((ct) => [ct.id, ct]));

  return rows.map((r) => {
    const reason = reasonMap.get(r.reasonId);
    const contentType = r.contentTypeId ? contentTypeMap.get(r.contentTypeId) : undefined;
    return {
      id: r.id,
      reporterUserId: r.reporterUserId,
      reportedUserId: r.reportedUserId,
      contentId: r.contentId,
      contentSnapshot: r.contentSnapshot,
      contentUrl: r.contentUrl ?? null,
      description: r.description ?? null,
      reason: reason
        ? { id: reason.id, title: reason.title, description: reason.description ?? null }
        : null,
      contentType: contentType ? { id: contentType.id, label: contentType.label } : null,
    };
  });
}

/**
 * Acknowledges a report.verify webhook delivered from the browser Connect relay.
 * - `accepted: true` → promotes the report to `pending`
 * - `accepted: false` → deletes the report (client rejected it with 4xx)
 *
 * The caller must be the owner of the report's OAuth client.
 */
export async function ackVerifyWebhook(
  reportId: string,
  accepted: boolean,
): Promise<void> {
  const userId = await expectSession();

  const report = await db.query.contentReports.findFirst({
    columns: { clientId: true, status: true },
    where: { id: reportId },
  });

  if (!report || report.status !== "unverified") return;

  const reg = await db.query.oauthRegistrations.findFirst({
    columns: { userId: true },
    where: { clientId: report.clientId },
  });
  if (reg?.userId !== userId) return;

  if (accepted) {
    await db
      .update(contentReports)
      .set({ status: "pending" })
      .where(eq(contentReports.id, reportId));
  } else {
    await db.delete(contentReports).where(eq(contentReports.id, reportId));
  }
}
