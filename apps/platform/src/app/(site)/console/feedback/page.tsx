import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import FeedbackField from "~/components/FeedbackField";
import PageHeader from "~/components/PageHeader";
import { TableSkeleton } from "~/components/Skeletons";
import type { FeedbackFilters } from "~/server/actions/feedback";
import { getFeedbackPageData } from "~/server/loaders/feedback";
import { emptyToUndefined } from "~/lib/blank";

async function FeedbackData({ filters }: { filters: FeedbackFilters }) {
  const { items } = await getFeedbackPageData(filters);

  return <FeedbackField items={items} filters={filters} />;
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    severity?: string;
    search?: string;
  }>;
}) {
  const params = await searchParams;
  const filters: FeedbackFilters = {
    tab: params.tab === "archive" ? "archive" : "inbox",
    type: emptyToUndefined(params.type),
    severity: emptyToUndefined(params.severity),
    search: emptyToUndefined(params.search),
  };

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="amber" />

      <PageHeader
        title="Feedback"
        description="Review feedback submitted through the website and by partner applications, and track it through to resolution."
        accent="amber"
      />

      <Suspense fallback={<TableSkeleton />}>
        <FeedbackData filters={filters} />
      </Suspense>
    </div>
  );
}
