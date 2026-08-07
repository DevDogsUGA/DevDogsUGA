import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageHeader from "~/components/PageHeader";
import { TableSkeleton } from "~/components/Skeletons";
import AppSelect from "~/components/AppSelect";
import ReportReasonsField from "~/components/ReportReasonsField";
import {
  getReportReasonsPageData,
  listApps,
  selectedApp,
} from "~/server/loaders/moderationConfig";

/**
 * Configures what users may report, per app.
 *
 * This is a *production* surface, which is the whole reason it is server-
 * rendered through Drizzle: the reasons a real user picks from when reporting
 * forum content are set here. Instances a contributor develops against get
 * theirs from seeds, and the local loop for exercising the system end to end is
 * `pnpm devtools` -- see docs/platform/reporting-and-feedback.md.
 *
 * Content types are deliberately absent. They are derived from each app's own
 * schema rather than configured, so there is nothing to set; `pnpm devtools`
 * reports what the catalog detected and whether the integration holds up.
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

async function ReasonsList({ appSlug }: { appSlug: string }) {
  const selected = await selectedApp(appSlug);
  if (!selected) return null;

  const { canEdit, reasons } = await getReportReasonsPageData(selected.id);

  return (
    <ReportReasonsField
      appId={selected.id}
      initialReasons={reasons}
      canEdit={canEdit}
    />
  );
}

export default async function ModerationToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string }>;
}) {
  const { app } = await searchParams;
  const appSlug = app ?? "";

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="rose" />

      <PageHeader
        title="Moderation"
        description="Configure the report reasons available to each DevDogs application."
        accent="rose"
      />

      <ConsoleCard.Root id="reasons">
        <ConsoleCard.Header title="Report Reasons" />
        <ConsoleCard.Content>
          <Field
            id="app"
            label="Application"
            description="Which registered DevDogs app these reasons belong to."
          >
            <Suspense fallback={<TableSkeleton />}>
              <AppPicker appSlug={appSlug} />
            </Suspense>
          </Field>

          <Field
            id="report-reasons"
            label="Report Reasons"
            description="The reasons a user can select when filing a content report against this app. Requires the Moderate permission to change."
          >
            <Suspense fallback={<TableSkeleton />}>
              <ReasonsList appSlug={appSlug} />
            </Suspense>
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </div>
  );
}
