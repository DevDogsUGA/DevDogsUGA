import { Suspense } from "react";
import AuditLogContent from "~/components/AuditLogContent";
import PageShell from "~/components/PageShell";
import { TableSkeleton } from "~/components/Skeletons";
import { getAuditLogPageData } from "~/server/loaders/auditLog";

async function AuditLogData({ page }: { page: number }) {
  const data = await getAuditLogPageData(page);

  return <AuditLogContent {...data} />;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  return (
    <PageShell
      accent="blue"
      title="Audit Log"
      description="A record of moderation actions and content reports filed across all production OAuth clients."
    >
      <Suspense fallback={<TableSkeleton />}>
        <AuditLogData page={page} />
      </Suspense>
    </PageShell>
  );
}
