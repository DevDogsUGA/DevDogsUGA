import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { DevReport } from "~/components/OAuthReports";
import { canUserModerate } from "~/server/actions/permissions";
import { expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import {
  contentReports,
  moderatorRoles,
  oauthRegistrations,
  profiles,
  reportContentTypes,
  reportCorroborations,
  reportReasons,
} from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";

export type ProductionReport = {
  id: string;
  clientId: string;
  contentId: string;
  contentTypeLabel: string | null;
  reasonTitle: string | null;
  status: string;
  createdAt: string;
  corroborationCount: number;
};

export const getModerationPageData = cache(async () => {
  const userId = await expectSession().catch(() => redirect("/auth"));
  const canModerate = await canUserModerate(userId);

  const { profile, githubIdentity, testAccounts } = await expectUserWith({
    profile: {
      with: {
        oauthRegistration: {
          columns: { clientId: true },
        },
      },
    },
    githubIdentity: { columns: { id: true } },
    testAccounts: {
      columns: { createdAt: true },
      with: {
        user: { columns: { id: true } },
      },
    },
  }).catch(() => redirect("/auth"));

  const clientId = profile?.oauthRegistration?.clientId ?? null;
  const hasGithub = githubIdentity !== null;

  // Testing mode: load dev reports (reports filed by test accounts)
  let devReports: DevReport[] = [];
  if (clientId && testAccounts.length > 0) {
    const testUserIds = testAccounts.map((ta) => ta.user.id);

    const rows = await db.query.contentReports.findMany({
      where: { clientId, status: "pending" },
      orderBy: { createdAt: "desc" },
      with: {
        reason: { columns: { title: true } },
        contentType: { columns: { label: true } },
      },
    });

    const testReports = rows.filter((r) =>
      testUserIds.includes(r.reporterUserId),
    );
    const reportIds = testReports.map((r) => r.id);

    const corroborationCounts: Record<string, number> =
      reportIds.length > 0
        ? Object.fromEntries(
            (
              await db
                .select({
                  reportId: reportCorroborations.reportId,
                  c: count(reportCorroborations.id),
                })
                .from(reportCorroborations)
                .where(inArray(reportCorroborations.reportId, reportIds))
                .groupBy(reportCorroborations.reportId)
            ).map(({ reportId, c }) => [reportId, c]),
          )
        : {};

    devReports = testReports.map((r) => ({
      id: r.id,
      contentId: r.contentId,
      contentTypeLabel: r.contentType?.label ?? null,
      contentSnapshot: r.contentSnapshot,
      contentUrl: r.contentUrl ?? null,
      reasonTitle: r.reason?.title ?? null,
      description: r.description ?? null,
      reporterUserId: r.reporterUserId,
      reportedUserId: r.reportedUserId,
      createdAt: r.createdAt.toISOString(),
      corroborationCount: corroborationCounts[r.id] ?? 0,
    }));
  }

  // Production mode: load all reports for moderated clients
  let pendingReports: ProductionReport[] = [];
  let resolvedReports: ProductionReport[] = [];
  let clientNames: Record<string, string> = {};

  if (canModerate) {
    const grants = await db.query.moderatorRoles.findMany({
      columns: { clientId: true },
      where: { userId },
    });

    if (grants.length > 0) {
      const clientIds = grants.map((g) => g.clientId);

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

      const reports = await db
        .select({
          id: contentReports.id,
          clientId: contentReports.clientId,
          contentId: contentReports.contentId,
          reasonTitle: reportReasons.title,
          contentTypeLabel: reportContentTypes.label,
          status: contentReports.status,
          createdAt: contentReports.createdAt,
          corroborationCount:
            sql<number>`COALESCE(${corroborationSq.corroborationCount}, 0)`.as(
              "corroborationCount",
            ),
        })
        .from(contentReports)
        .leftJoin(
          corroborationSq,
          eq(contentReports.id, corroborationSq.reportId),
        )
        .leftJoin(reportReasons, eq(contentReports.reasonId, reportReasons.id))
        .leftJoin(
          reportContentTypes,
          eq(contentReports.contentTypeId, reportContentTypes.id),
        )
        .where(inArray(contentReports.clientId, clientIds))
        .orderBy(desc(sql`COALESCE(${corroborationSq.corroborationCount}, 0)`));

      const registrationRows = await db
        .select({
          clientId: oauthRegistrations.clientId,
          preferredName: profiles.preferredName,
        })
        .from(oauthRegistrations)
        .innerJoin(profiles, eq(profiles.userId, oauthRegistrations.userId))
        .where(inArray(oauthRegistrations.clientId, clientIds));

      clientNames = Object.fromEntries(
        registrationRows.map((r) => [r.clientId, r.preferredName]),
      );

      const mapped = reports.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        contentId: r.contentId,
        contentTypeLabel: r.contentTypeLabel ?? null,
        reasonTitle: r.reasonTitle ?? null,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        corroborationCount: r.corroborationCount,
      }));

      pendingReports = mapped.filter((r) => r.status === "pending");
      resolvedReports = mapped.filter((r) => r.status !== "pending");
    }
  }

  return {
    userId,
    clientId,
    hasGithub,
    canModerate,
    devReports,
    pendingReports,
    resolvedReports,
    clientNames,
  };
});

export const getReportDetailData = cache(async (reportId: string) => {
  const userId = await expectSession().catch(() => redirect("/auth"));

  const report = await db.query.contentReports.findFirst({
    where: { id: reportId },
    with: {
      resolution: true,
      reason: { columns: { title: true } },
      contentType: { columns: { label: true } },
      corroborations: {
        columns: { reporterUserId: true, description: true },
      },
    },
  });

  if (!report) notFound();

  const canModerate = await db.query.moderatorRoles.findFirst({
    columns: { id: true },
    where: { userId, clientId: report.clientId },
  });

  if (!canModerate) redirect("/");

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
    reporterName: getDisplayName(reporterData),
    reportedName: getDisplayName(reportedData),
    suspension,
    isBanned,
  };
});

export const getUserModerationData = cache(async (targetUserId: string) => {
  const callerUserId = await expectSession().catch(() => redirect("/auth"));

  const productionRole = await db
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

  if (productionRole.length === 0) redirect("/");

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

  const reports = await db.query.contentReports.findMany({
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
      reason: { columns: { title: true } },
      contentType: { columns: { label: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { targetUserId, displayName, isBanned, suspension, reports };
});
