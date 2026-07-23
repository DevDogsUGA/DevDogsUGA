import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import FeedbackTopicsField from "~/components/FeedbackTopicsField";
import Input from "~/components/Input";
import OAuthGateDialog from "~/components/OAuthGateDialog";
import PageHeader from "~/components/PageHeader";
import TestFeedbackList from "~/components/TestFeedbackList";
import { FEEDBACK_TOPIC_TEMPLATES } from "~/server/actions/feedbackTopicsData";
import { getFeedbackTestingPageData } from "~/server/loaders/feedback";

export default async function FeedbackAPIPage() {
  const data = await getFeedbackTestingPageData();

  const templates = Object.entries(FEEDBACK_TOPIC_TEMPLATES).map(
    ([key, template]) => ({
      key: key as keyof typeof FEEDBACK_TOPIC_TEMPLATES,
      label: template.label,
    }),
  );

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="amber" />

      <PageHeader
        title="Feedback API"
        description="Let your app's signed-in users submit feedback directly into the DevDogs review queue, then test the full flow with sandboxed test accounts."
        accent="amber"
      />

      <OAuthGateDialog
        key={data.clientId ?? "disabled"}
        clientId={data.clientId}
        hasGithub={data.hasGithub}
      />

      <ConsoleCard.Root id="client-id">
        <ConsoleCard.Header title="Client ID" />
        <ConsoleCard.Content>
          <Field
            id="feedback-client-id"
            label="Client ID"
            description="Public identifier for your app. Pass it to FeedbackClient, or use it directly in the /api/feedback/[clientId] endpoint path."
          >
            <Input mono copy className="max-w-md" value={data.clientId ?? ""} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="topics">
        <ConsoleCard.Header title="Topics" />
        <ConsoleCard.Content>
          <Field
            id="feedback-topics"
            label="Feedback Topics"
            description="The topics your users can choose from when submitting feedback through the API. Apply a template to get started quickly, or add your own."
          >
            <FeedbackTopicsField topics={data.topics} templates={templates} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="feedback-dialog">
        <ConsoleCard.Header title="Using the Feedback Dialog" />
        <ConsoleCard.Content>
          <Field
            id="feedback-dialog-snippet"
            label="Drop-in React Component"
            description="Install @devdogsuga/feedback-client and render the built-in dialog in any Next.js/React app. Import the stylesheet once, then wire up your client."
          >
            <pre className="overflow-x-auto rounded-sm border border-mauve-700 bg-mauve-950 p-4 text-xs text-mauve-200">
              <code>{`// 1. Install
// pnpm add @devdogsuga/feedback-client

// 2. Import the stylesheet once (e.g. in your root layout or globals.css)
// import "@devdogsuga/feedback-client/react/styles.css";

// 3. Render the dialog
import { useState } from "react";
import { FeedbackClient } from "@devdogsuga/feedback-client";
import { FeedbackDialog } from "@devdogsuga/feedback-client/react";

const client = new FeedbackClient({
  baseUrl: "https://devdogs.uga.edu",
  clientId: process.env.NEXT_PUBLIC_DEVDOGS_CLIENT_ID,
});

export function MyFeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Feedback</button>
      <FeedbackDialog
        open={open}
        onOpenChange={setOpen}
        client={client}
        getAccessToken={async () => supabase.auth.getSession()
          .then((r) => r.data.session?.access_token ?? "")}
      />
    </>
  );
}`}</code>
            </pre>
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="test-feedback">
        <ConsoleCard.Header title="Test Feedback" />
        <ConsoleCard.Content>
          <Field
            id="test-feedback-list"
            label="Test Feedback"
            description="Feedback submitted by your test accounts via the API. Use this to verify your integration before going live."
          >
            <TestFeedbackList items={data.testFeedback} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </div>
  );
}
