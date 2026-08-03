import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import PageHeader from "~/components/PageHeader";
import InstanceTarget from "~/components/InstanceTarget";
import TargetField from "~/components/InstanceTarget/TargetField";
import FeedbackPanel from "~/components/InstanceTarget/FeedbackPanel";
import FeedbackTopicsPanel from "~/components/InstanceTarget/FeedbackTopicsPanel";

/**
 * Feedback tooling for a contributor's own instance. See the moderation page
 * for why these act on a nominated Supabase project rather than on this one.
 *
 * The test-feedback list that used to live here belonged to the era when a
 * contributor's submissions landed in *this* database. They land on their own
 * instance now, so the tooling reads that instance directly instead of keeping
 * a parallel "test" corner of production.
 */
export default function FeedbackToolsPage() {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="amber" />

      <PageHeader
        title="Feedback"
        description="Point these tools at your own Supabase instance to configure feedback topics and read what has been submitted."
        accent="amber"
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

        <ConsoleCard.Root id="topics">
          <ConsoleCard.Header title="Feedback Topics" />
          <ConsoleCard.Content>
            <Field
              id="feedback-topics"
              label="Feedback Topics"
              description="The topics users can choose from when submitting feedback about an app. Apply a template to get started quickly, or add your own."
            >
              <FeedbackTopicsPanel />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="submissions">
          <ConsoleCard.Header title="Submissions" />
          <ConsoleCard.Content>
            <Field
              id="feedback-submissions"
              label="Submissions"
              description="Feedback on the target instance, subject to row-level security as whoever you signed in as there."
            >
              <FeedbackPanel />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </InstanceTarget>
    </div>
  );
}
