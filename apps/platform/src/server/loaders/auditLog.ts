import { count, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { canUserViewAuditLog } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { db } from "~/server/db";
import { apps, reportReasons, reports } from "~/server/db/schema";

export const PAGE_SIZE = 50;

export type AuditLogEntry = {
  id: string;
  appId: string;
  appName: string;
  contentType: string;
  contentRef: string;
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
    await requirePermission(canUserViewAuditLog);

    const offset = (page - 1) * PAGE_SIZE;

    // Previously restricted to reports filed against `production`-type OAuth
    // registrations, which was how "real" was distinguished from "a developer
    // testing". Testing no longer happens on this instance at all, so every
    // report here is real and the log covers all of them.
    const [countRow] = await db.select({ value: count() }).from(reports);

    const totalCount = countRow?.value ?? 0;

    const rows = await db
      .select({
        id: reports.id,
        appId: reports.appId,
        appName: apps.displayName,
        contentType: reports.contentType,
        contentRef: reports.contentRef,
        reasonTitle: reportReasons.title,
        status: reports.status,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
      })
      .from(reports)
      .innerJoin(apps, eq(apps.id, reports.appId))
      .leftJoin(reportReasons, eq(reports.reason, reportReasons.reason))
      .orderBy(desc(reports.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    const entries: AuditLogEntry[] = rows.map((r) => ({
      id: r.id,
      appId: r.appId,
      appName: r.appName,
      contentType: r.contentType,
      contentRef: r.contentRef,
      reasonTitle: r.reasonTitle ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));

    return { entries, page, totalCount, pageSize: PAGE_SIZE };
  },
);
