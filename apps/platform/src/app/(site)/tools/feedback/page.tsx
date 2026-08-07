import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageHeader from "~/components/PageHeader";
import { TableSkeleton } from "~/components/Skeletons";
import AppSelect from "~/components/AppSelect";
import FeedbackTopicsField from "~/components/FeedbackTopicsField";
import {
  getFeedbackTopicsPageData,
  listApps,
  selectedApp,
} from "~/server/loaders/moderationConfig";

/**
 * Configures the topics users may file feedback under, per app.
 *
 * See the moderation page for why this is server-rendered against production
 * rather than pointed at a nominated instance. Submissions themselves are read
 * in the console at /console/feedback; this page is configuration only.
 */

async function AppPicker({ appSlug }: { appSlug: string }) {
  const [apps, selected] = await Promise.all([
    listApps(),
    selectedApp(appSlug),
  ]);
  if (!selected) {
    return (
      <p className="text-sm text-mauve-400">
        No apps are registered in this instance.
      </p>
    );
  }
  return <AppSelect apps={apps} selectedSlug={selected.slug} />;
}

async function TopicsList({ appSlug }: { appSlug: string }) {
  const selected = await selectedApp(appSlug);
  if (!selected) return null;

  const { canEdit, topics } = await getFeedbackTopicsPageData(selected.id);

  return (
    <FeedbackTopicsField
      appId={selected.id}
      initialTopics={topics}
      canEdit={canEdit}
    />
  );
}

export default async function FeedbackToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  const appSlug = app ?? "";

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="amber" />

      <PageHeader
        title="Feedback"
        description="Configure the feedback topics available to each DevDogs application."
        accent="amber"
      />

      <ConsoleCard.Root id="topics">
        <ConsoleCard.Header title="Feedback Topics" />
        <ConsoleCard.Content>
          <Field
            id="app"
            label="Application"
            description="Which registered DevDogs app these topics belong to."
          >
            <Suspense fallback={<TableSkeleton />}>
              <AppPicker appSlug={appSlug} />
            </Suspense>
          </Field>

          <Field
            id="feedback-topics"
            label="Feedback Topics"
            description="The topics users can choose from when submitting feedback about this app. Requires the Manage Feedback permission to change."
          >
            <Suspense fallback={<TableSkeleton />}>
              <TopicsList appSlug={appSlug} />
            </Suspense>
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </div>
  );
}
