import type { Metadata } from "next";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import ExternalAppsField from "~/classic/components/ExternalAppsField";
import ModerationDeliveries from "~/classic/components/ModerationDeliveries";
import PageShell from "~/classic/components/PageShell";
import ReportListItem from "~/classic/components/ReportListItem";
import { getModerationPageData } from "~/server/loaders/moderation";
import { ConsoleCard } from "~/classic/ui/card";

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
    <ConsoleFrame>
      <PageShell
        accent="rose"
        title="Moderation"
        description="Review content reports filed against community profiles and resolve them with the appropriate action."
      >
        <ConsoleCard.Root id="open-reports">
          <ConsoleCard.Header title="Open Reports" />
          <ConsoleCard.Content>
            {open.length === 0 ? (
              <p className="text-sm text-mauve-400">No open reports.</p>
            ) : (
              <ul className="flex flex-col gap-3">
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
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        {undeliveredDeliveries.length > 0 && (
          <ConsoleCard.Root id="undelivered">
            <ConsoleCard.Header title="Undelivered Decisions" />
            <ConsoleCard.Content>
              <ModerationDeliveries
                deliveries={undeliveredDeliveries}
                linkReports
              />
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        )}

        {resolved.length > 0 && (
          <ConsoleCard.Root id="recent-resolved">
            <ConsoleCard.Header title="Recent Resolved" />
            <ConsoleCard.Content>
              <ul className="flex flex-col gap-2">
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
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        )}

        <ConsoleCard.Root id="external-apps">
          <ConsoleCard.Header title="Apps Outside the Platform" />
          <ConsoleCard.Content>
            <ExternalAppsField
              apps={externalApps}
              canRegister={canRegisterApps}
            />
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </PageShell>
    </ConsoleFrame>
  );
}
