import { count, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import { canUserViewAuditLog } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  contentReports,
  oauthRegistrations,
  profiles,
  reportContentTypes,
  reportReasons,
} from "~/server/db/schema";

export const PAGE_SIZE = 50;

export type AuditLogEntry = {
  id: string;
  clientId: string;
  clientOwnerName: string;
  contentId: string;
  contentTypeLabel: string | null;
  reasonTitle: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type AuditLogPageData = {
  entries: AuditLogEntry[];
  page: number;
  totalCount: number;
  pageSize: number;
};

export const getAuditLogPageData = cache(
  async (page: number): Promise<AuditLogPageData> => {
    const userId = await expectSession().catch(() => redirect("/auth"));
    const canView = await canUserViewAuditLog(userId);
    if (!canView) redirect("/");

    const offset = (page - 1) * PAGE_SIZE;

    const [countRow] = await db
      .select({ value: count() })
      .from(contentReports)
      .innerJoin(
        oauthRegistrations,
        eq(oauthRegistrations.clientId, contentReports.clientId),
      )
      .where(eq(oauthRegistrations.type, "production"));

    const totalCount = countRow?.value ?? 0;

    const rows = await db
      .select({
        id: contentReports.id,
        clientId: contentReports.clientId,
        clientOwnerName: profiles.preferredName,
        contentId: contentReports.contentId,
        reasonTitle: reportReasons.title,
        contentTypeLabel: reportContentTypes.label,
        status: contentReports.status,
        createdAt: contentReports.createdAt,
        resolvedAt: contentReports.resolvedAt,
      })
      .from(contentReports)
      .innerJoin(
        oauthRegistrations,
        eq(oauthRegistrations.clientId, contentReports.clientId),
      )
      .innerJoin(profiles, eq(profiles.userId, oauthRegistrations.userId))
      .leftJoin(reportReasons, eq(contentReports.reasonId, reportReasons.id))
      .leftJoin(
        reportContentTypes,
        eq(contentReports.contentTypeId, reportContentTypes.id),
      )
      .where(eq(oauthRegistrations.type, "production"))
      .orderBy(desc(contentReports.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    const entries: AuditLogEntry[] = rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientOwnerName: r.clientOwnerName,
      contentId: r.contentId,
      contentTypeLabel: r.contentTypeLabel ?? null,
      reasonTitle: r.reasonTitle ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));

    return { entries, page, totalCount, pageSize: PAGE_SIZE };
  },
);
