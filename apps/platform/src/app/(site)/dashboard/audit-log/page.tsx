import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import { Suspense } from "react";
import AuditLogContent from "~/components/AuditLogContent";
import "~/components/Console/console.css";
import { TableSkeleton } from "~/components/Skeletons";
import { PageHeading } from "~/ui/app-shell";
import { parseAuditSource } from "~/lib/audit";

import {
  getAuditLogPageData,
  type AuditLogFilters,
} from "~/server/loaders/auditLog";

async function AuditLogData({
  page,
  filters,
}: {
  page: number;
  filters: AuditLogFilters;
}) {
  const data = await getAuditLogPageData(page, filters);

  return <AuditLogContent {...data} />;
}

export const metadata: Metadata = {
  title: "Audit log | Console | DevDogs",
  robots: { index: false },
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    source?: string | string[];
    action?: string | string[];
    targetType?: string | string[];
  }>;
}) {
  await requireAccess(rules.viewAuditLog);
  const params = await searchParams;
  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;
  const nonEmpty = (value: string | string[] | undefined) => {
    const trimmed = single(value)?.trim();
    return trimmed === "" ? undefined : trimmed;
  };
  const pageParam = single(params.page);
  const parsedPage = parseInt(pageParam ?? "1", 10);
  const page = Math.max(1, Number.isNaN(parsedPage) ? 1 : parsedPage);
  const filters: AuditLogFilters = {
    source: parseAuditSource(single(params.source)),
    action: nonEmpty(params.action),
    targetType: nonEmpty(params.targetType),
  };

  return (
    <div className="con">
      <PageHeading
        title="Audit log"
        description="The append-only history of attendance, reflections, exports, moderation actions, and production OAuth client changes. Nothing here can be edited or removed."
      />
      <Suspense fallback={<TableSkeleton />}>
        <AuditLogData page={page} filters={filters} />
      </Suspense>
    </div>
  );
}
