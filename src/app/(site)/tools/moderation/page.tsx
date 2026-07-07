import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import Field from "~/ui/field";
import OAuthGateDialog from "~/components/OAuthGateDialog";
import OAuthReports from "~/components/OAuthReports";
import PageHeader from "~/components/PageHeader";
import ReportContentTypesField from "~/components/ReportContentTypesField";
import ReportReasonsField from "~/components/ReportReasonsField";
import WebhookConnectField from "~/components/WebhookConnectField";
import { getModerationPageData } from "~/server/loaders/moderation";

export default async function ReportingAPIPage() {
  const data = await getModerationPageData();

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="rose" />

      <PageHeader
        title="Moderation API"
        description="Configure report reasons and content types for your client, then test the full flow with sandboxed test accounts."
        accent="rose"
      />

      <OAuthGateDialog
        key={data.clientId ?? "disabled"}
        clientId={data.clientId}
        hasGithub={data.hasGithub}
      />

      {data.clientId && (
        <>
          <ConsoleCard.Root id="reasons">
            <ConsoleCard.Header title="Report Reasons" />
            <ConsoleCard.Content>
              <Field
                id="report-reasons"
                label="Reasons"
                description="The reasons a user can select when filing a content report. Added directly to your client via your session."
              >
                <ReportReasonsField clientId={data.clientId} />
              </Field>
            </ConsoleCard.Content>
          </ConsoleCard.Root>

          <ConsoleCard.Root id="content-types">
            <ConsoleCard.Header title="Content Types" />
            <ConsoleCard.Content>
              <Field
                id="report-content-types"
                label="Content Types"
                description="Optional labels that describe the kind of content being reported (e.g. Post, Comment). Leave empty to omit from reports."
              >
                <ReportContentTypesField clientId={data.clientId} />
              </Field>
            </ConsoleCard.Content>
          </ConsoleCard.Root>

          <ConsoleCard.Root id="webhook">
            <ConsoleCard.Header title="Local Webhook" />
            <ConsoleCard.Content>
              <Field
                id="webhook-url"
                label="Webhook URL"
                description="Enter your local server's webhook endpoint and click Connect. Your server must accept CORS requests from this origin."
              >
                <WebhookConnectField clientId={data.clientId} />
              </Field>
            </ConsoleCard.Content>
          </ConsoleCard.Root>

          <ConsoleCard.Root id="test-reports">
            <ConsoleCard.Header title="Test Reports" />
            <ConsoleCard.Content>
              <Field
                id="test-reports-list"
                label="Test Reports"
                description="Reports filed by your test accounts that have been verified and are awaiting moderation."
              >
                {data.devReports.length > 0 && (
                  <p className="mb-3 text-sm">
                    <span className="rounded-sm bg-rose-600 px-2 py-0.5 text-sm font-medium text-white">
                      {data.devReports.length}
                    </span>{" "}
                    pending
                  </p>
                )}
                <OAuthReports reports={data.devReports} />
              </Field>
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        </>
      )}
    </div>
  );
}
