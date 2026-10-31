import type { Metadata } from "next";
import "~/components/Console/console.css";
import AppSideNav from "~/components/AppSideNav";
import { AppShell } from "~/ui/app-shell";
import ExternalAppsField from "~/components/ExternalAppsField";
import ModerationDeliveries from "~/components/ModerationDeliveries";
import ReportListItem from "~/components/ReportListItem";
import { getModerationPageData } from "~/server/loaders/moderation";
import { PageHeading, Panel } from "~/ui/app-shell";
import { EmptyState } from "~/ui/empty-state";

export const metadata: Metadata = {
  title: "Moderation | Console | DevDogs",
  robots: { index: false },
};

export default async function ModerationDashboard() {
  // The loader is the gate. It refuses anybody without `canModerate` rather
  // than handing back an empty queue for the page to check.
  const {
    openReports: open,
    resolvedReports: resolved,
    appNames,
    undeliveredDeliveries,
    externalApps,
    canRegisterApps,
  } = await getModerationPageData();

  return (
    <AppShell side={<AppSideNav />} className="con">
      <PageHeading
        title="Moderation"
        description="Review content reports filed against community profiles and resolve them with the appropriate action."
      />

      <Panel id="open-reports" title="Open reports">
        {open.length === 0 ? (
          <EmptyState
            title="No open reports"
            description="The undelivered and recent resolved lists appear below only when they have something in them."
          />
        ) : (
          <ul className="con-list">
            {open.map((report) => (
              <li key={report.id}>
                <ReportListItem
                  id={report.id}
                  contentId={report.contentRef}
                  contentTypeLabel={report.contentType}
                  reasonTitle={report.reasonTitle}
                  status={report.status}
                  createdAt={report.createdAt}
                  corroborationCount={report.corroborationCount}
                  clientName={appNames[report.appId] ?? report.appId}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {undeliveredDeliveries.length > 0 && (
        <Panel
          id="undelivered"
          title="Undelivered decisions"
          help="Signed decisions owed to apps outside the platform. A failed one has used up its retries: fix the app's endpoint, then resend. The app ignores a decision it has already applied, so resending is safe."
        >
          <ModerationDeliveries
            deliveries={undeliveredDeliveries}
            linkReports
          />
        </Panel>
      )}

      {resolved.length > 0 && (
        <Panel id="recent-resolved" title="Recent resolved" help="Latest 20.">
          <ul className="con-list">
            {resolved.slice(0, 20).map((report) => (
              <li key={report.id}>
                {/* Compact, because this list is context for the queue above
                    rather than work: it drops the reason line and the
                    corroboration count and keeps only the status. */}
                <ReportListItem
                  id={report.id}
                  contentId={report.contentRef}
                  contentTypeLabel={report.contentType}
                  reasonTitle={report.reasonTitle}
                  status={report.status}
                  createdAt={report.createdAt}
                  variant="compact"
                />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        id="external-apps"
        title="Apps outside the platform"
        help="Apps with their own database send reports here and get signed decisions back. Registering one needs permission to manage OAuth apps."
      >
        <ExternalAppsField apps={externalApps} canRegister={canRegisterApps} />
      </Panel>
    </AppShell>
  );
}
