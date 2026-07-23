import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import AuditLogContent from "~/components/AuditLogContent";
import PageHeader from "~/components/PageHeader";
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
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="blue" />

      <PageHeader
        title="Audit Log"
        description="A record of moderation actions and content reports filed across all production OAuth clients."
        accent="blue"
      />

      <Suspense fallback={<TableSkeleton />}>
        <AuditLogData page={page} />
      </Suspense>
    </div>
  );
}
