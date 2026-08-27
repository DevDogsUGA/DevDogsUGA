import { count, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  canUserManageSuspensions,
  canUserModerate,
} from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { db } from "~/server/db";
import {
  apps,
  reportCorroborations,
  reportReasons,
  reports,
  userSuspensions,
} from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";

export type ReportListEntry = {
  id: string;
  appId: string;
  contentType: string;
  contentRef: string;
  reasonTitle: string | null;
  status: string;
  createdAt: string;
  corroborationCount: number;
};

/**
 * The moderation queue.
 *
 * Scoped by `canModerate` alone. Moderation is centralised, so there is no
 * per-app grant to intersect with and a moderator sees every app's reports.
 *
 * The gate is enforced here rather than reported back as a flag. Returning an
 * empty queue plus `canModerate: false` and leaving the page to redirect meant
 * the one loader in the tree whose answer the caller had to check before
 * trusting it — and a second caller that forgot would have rendered an empty
 * dashboard to somebody with no business seeing one.
 */
export const getModerationPageData = cache(async () => {
  const userId = await requirePermission(canUserModerate);

  const corroborationSq = db
    .select({
      reportId: reportCorroborations.reportId,
      corroborationCount: count(reportCorroborations.id).as(
        "corroborationCount",
      ),
    })
    .from(reportCorroborations)
    .groupBy(reportCorroborations.reportId)
    .as("corroborations");

  const rows = await db
    .select({
      id: reports.id,
      appId: reports.appId,
      contentType: reports.contentType,
      contentRef: reports.contentRef,
      reasonTitle: reportReasons.title,
      status: reports.status,
      createdAt: reports.createdAt,
      corroborationCount:
        sql<number>`COALESCE(${corroborationSq.corroborationCount}, 0)`.as(
          "corroborationCount",
        ),
    })
    .from(reports)
    .leftJoin(corroborationSq, eq(reports.id, corroborationSq.reportId))
    .leftJoin(reportReasons, eq(reports.reason, reportReasons.reason))
    .orderBy(desc(sql`COALESCE(${corroborationSq.corroborationCount}, 0)`));

  const appRows = await db
    .select({ id: apps.id, displayName: apps.displayName })
    .from(apps);
  const appNames = Object.fromEntries(
    appRows.map((a) => [a.id, a.displayName]),
  );

  const mapped: ReportListEntry[] = rows.map((r) => ({
    id: r.id,
    appId: r.appId,
    contentType: r.contentType,
    contentRef: r.contentRef,
    reasonTitle: r.reasonTitle ?? null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    corroborationCount: r.corroborationCount,
  }));

  return {
    userId,
    openReports: mapped.filter((r) => r.status === "open"),
    resolvedReports: mapped.filter((r) => r.status !== "open"),
    appNames,
  };
});

export const getReportDetailData = cache(async (reportId: string) => {
  await requirePermission(canUserModerate);

  const report = await db.query.reports.findFirst({
    where: { id: reportId },
    with: {
      resolution: true,
      reasonDetail: { columns: { title: true } },
      app: { columns: { displayName: true, slug: true } },
      corroborations: {
        columns: { reporterUserId: true, description: true },
      },
    },
  });

  if (!report) notFound();

  // Not every reportable type can be quarantined -- a profile is reportable, but
  // the remedy is suspending its owner rather than hiding a row. Resolving with
  // "quarantine" against such a type raises inside the transaction, so the
  // console asks first and stops offering the option rather than relying on that
  // backstop.
  //
  // False is also the honest answer when the type has been dropped since the
  // report was filed: content_types() returns no row, and the frozen snapshot on
  // the report is all that is left to act on.
  const quarantinable = await isQuarantinable(report.appId, report.contentType);

  const [corroborationRow] = await db
    .select({ value: count() })
    .from(reportCorroborations)
    .where(eq(reportCorroborations.reportId, reportId));
  const corroborationCount = corroborationRow?.value ?? 0;

  const [reporterData, reportedData] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(report.reporterUserId),
    supabaseAdmin.auth.admin.getUserById(report.reportedUserId),
  ]);

  function getDisplayName(
    data: Awaited<ReturnType<typeof supabaseAdmin.auth.admin.getUserById>>,
  ): string {
    const meta = data.data?.user?.user_metadata;
    if (meta && typeof meta === "object") {
      if ("preferred_name" in meta && typeof meta.preferred_name === "string") {
        return meta.preferred_name;
      }
      if ("display_name" in meta && typeof meta.display_name === "string") {
        return meta.display_name;
      }
    }
    return data.data?.user?.email ?? "(unknown)";
  }

  const suspension = await db.query.userSuspensions.findFirst({
    columns: { reason: true },
    where: { userId: report.reportedUserId, service: "global" },
  });
  const bannedUntil = reportedData.data?.user?.banned_until;
  const isBanned = bannedUntil != null && new Date(bannedUntil) > new Date();

  return {
    report,
    corroborationCount,
    quarantinable,
    reporterName: getDisplayName(reporterData),
    reportedName: getDisplayName(reportedData),
    suspension,
    isBanned,
  };
});

/**
 * Whether a content type's table carries the foreign key to
 * `platform."reportResolutions"` that quarantine writes to.
 *
 * Derived from the catalog on every call rather than cached: the answer is a
 * property of the schema, so a migration that adds or drops the column changes
 * it with nothing to invalidate.
 */
async function isQuarantinable(
  appId: string,
  contentType: string,
): Promise<boolean> {
  const rows = await db.execute<{ quarantinable: boolean }>(
    sql`select "quarantineColumn" is not null as "quarantinable"
        from "platform".content_types()
        where "appId" = ${appId}::uuid and "contentType" = ${contentType}`,
  );
  return rows[0]?.quarantinable ?? false;
}

export const getUserModerationData = cache(async (targetUserId: string) => {
  await requirePermission(canUserManageSuspensions);

  const { data: userData } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (!userData?.user) notFound();

  const supabaseUser = userData.user;
  const meta = supabaseUser.user_metadata;
  const displayName =
    (meta &&
    typeof meta === "object" &&
    "preferred_name" in meta &&
    typeof meta.preferred_name === "string"
      ? meta.preferred_name
      : null) ??
    (meta &&
    typeof meta === "object" &&
    "display_name" in meta &&
    typeof meta.display_name === "string"
      ? meta.display_name
      : null) ??
    supabaseUser.email ??
    "(unknown)";

  const bannedUntil = supabaseUser.banned_until;
  const isBanned = bannedUntil != null && new Date(bannedUntil) > new Date();

  const suspension = await db.query.userSuspensions.findFirst({
    where: { userId: targetUserId, service: "global" },
  });

  const userReports = await db.query.reports.findMany({
    where: { reportedUserId: targetUserId },
    with: {
      resolution: {
        columns: {
          subjectAction: true,
          filerAction: true,
          contentAction: true,
          appliedGlobally: true,
        },
      },
      reasonDetail: { columns: { title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    targetUserId,
    displayName,
    isBanned,
    suspension,
    reports: userReports,
  };
});

export { userSuspensions };
