import { Suspense } from "react";
import AuditLogContent from "~/components/AuditLogContent";
import PageShell from "~/components/PageShell";
import { TableSkeleton } from "~/components/Skeletons";
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
    <PageShell
      accent="blue"
      title="Audit Log"
      description="The append-only history of attendance, Airtable corrections, reflections, exports, and moderation actions."
    >
      <Suspense fallback={<TableSkeleton />}>
        <AuditLogData page={page} filters={filters} />
      </Suspense>
    </PageShell>
  );
}
