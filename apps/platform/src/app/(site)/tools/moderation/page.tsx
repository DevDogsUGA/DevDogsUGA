import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageHeader from "~/components/PageHeader";
import InstanceTarget from "~/components/InstanceTarget";
import TargetField from "~/components/InstanceTarget/TargetField";
import ContentTypesPanel from "~/components/InstanceTarget/ContentTypesPanel";
import ReportReasonsPanel from "~/components/InstanceTarget/ReportReasonsPanel";
import ReportsPanel from "~/components/InstanceTarget/ReportsPanel";

/**
 * Moderation tooling for a contributor's own instance.
 *
 * Everything below runs in the browser against a Supabase project you nominate
 * — your local stack, or your own test project — never against this one. It
 * works because the contract is a set of `platform` RPCs plus the RLS around
 * them, so a tool needs nothing but a URL, a publishable key and a session;
 * there is no server-side loader to replicate.
 *
 * That inversion is deliberate. The forum lives in its own repository, and a
 * forum contributor should not have to clone and boot this monorepo just to get
 * a moderation queue. Running the console locally is still supported, and is
 * the better path when working on the console itself.
 *
 * The page stays server-rendered so its anchors remain static for search;
 * `<InstanceTarget>` is the client boundary.
 */
export default function ModerationToolsPage() {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="rose" />

      <PageHeader
        title="Moderation"
        description="Point these tools at your own Supabase instance to configure reporting and work its moderation queue."
        accent="rose"
      />

      <InstanceTarget>
        <ConsoleCard.Root id="instance">
          <ConsoleCard.Header title="Target Instance" />
          <ConsoleCard.Content>
            <Field
              id="instance-target"
              label="Target Instance"
              description="The Supabase project these tools act on. Production instances are refused."
            >
              <TargetField />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="reasons">
          <ConsoleCard.Header title="Report Reasons" />
          <ConsoleCard.Content>
            <Field
              id="report-reasons"
              label="Report Reasons"
              description="The reasons a user can select when filing a content report against an app."
            >
              <ReportReasonsPanel />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="content-types">
          <ConsoleCard.Header title="Content Types" />
          <ConsoleCard.Content>
            <Field
              id="content-types-list"
              label="Content Types"
              description="What the catalog detected in each app's schema, and whether the integration holds up."
            >
              <ContentTypesPanel />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="queue">
          <ConsoleCard.Header title="Report Queue" />
          <ConsoleCard.Content>
            <Field
              id="report-queue"
              label="Report Queue"
              description="Reports filed on the target instance, and the same resolution form production moderation uses."
            >
              <ReportsPanel />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </InstanceTarget>
    </div>
  );
}
