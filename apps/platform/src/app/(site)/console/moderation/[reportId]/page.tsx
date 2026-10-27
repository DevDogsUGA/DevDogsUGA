import type { Metadata } from "next";
import Link from "next/link";
import ConsoleShell from "~/components/Console/ConsoleShell";
import ModerationDeliveries from "~/components/ModerationDeliveries";
import ReportActionForm from "~/components/ReportActionForm";
import { StandingBadge, standingOf } from "~/components/StatusBadges";
import { formatEventDateTime } from "~/lib/eventTime";
import { getReportDetailData } from "~/server/loaders/moderation";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { DefinitionList } from "~/ui/definition-list";
import { TerminalBlock } from "~/ui/terminal-block";

export const metadata: Metadata = {
  title: "Report | Moderation | Console | DevDogs",
  robots: { index: false },
};

/**
 * An app chooses a report's link, so only an https link, or a path on this
 * site, becomes an `href`. The API refuses other schemes, and this is the
 * second line for anything stored before it did.
 */
function isFollowableLink(url: string | null): url is string {
  return (
    url !== null &&
    (url.startsWith("https://") ||
      (url.startsWith("/") && !url.startsWith("//")))
  );
}

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const {
    report,
    corroborationCount,
    quarantinable,
    deliveries,
    reporterName,
    reportedName,
    suspension,
    isBanned,
  } = await getReportDetailData(reportId);

  return (
    <ConsoleShell current="/console/moderation">
      <PageHeading
        crumbs={[
          { label: "Moderation", href: "/console/moderation" },
          { label: "Report" },
        ]}
        title="Report"
        // The id is the page's identity but not its name: it is a uuid, and as
        // a heading it pushed the one word that says what this page is off to
        // the side. It reads first in the description instead.
        description={
          <>
            <code className="con-code">{reportId}</code> &middot;{" "}
            {formatEventDateTime(report.createdAt)} &middot; status:{" "}
            <span className="capitalize">{report.status}</span>
            {corroborationCount > 0 && (
              <>
                {" "}
                &middot; +{corroborationCount} corroboration
                {corroborationCount !== 1 ? "s" : ""}
              </>
            )}
          </>
        }
      />

      <Panel id="content" title="Content">
        <div className="con-meta" style={{ marginBottom: 12 }}>
          <Badge>{report.contentType}</Badge>
          <code className="con-code">ID: {report.contentRef}</code>
          {isFollowableLink(report.contentUrl) && (
            <a
              href={report.contentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="textlink"
            >
              View live &rarr;
            </a>
          )}
        </div>
        <TerminalBlock title="snapshot">{report.contentSnapshot}</TerminalBlock>
      </Panel>

      <Panel id="people" title="Reporter and reported">
        <DefinitionList
          items={[
            {
              term: "Reporter",
              detail: (
                <>
                  {reporterName}
                  <br />
                  {report.reporterUserId && (
                    <code className="con-code">{report.reporterUserId}</code>
                  )}
                </>
              ),
            },
            ...(report.reason
              ? [{ term: "Reason", detail: report.reasonDetail.title }]
              : []),
            ...(report.description
              ? [
                  {
                    term: "Description",
                    detail: <>&ldquo;{report.description}&rdquo;</>,
                  },
                ]
              : []),
            {
              term: "Reported",
              detail: (
                <>
                  {reportedName}
                  <br />
                  {report.reportedUserId && (
                    <code className="con-code">{report.reportedUserId}</code>
                  )}
                </>
              ),
            },
            {
              term: "Standing",
              detail: (
                <span className="con-meta">
                  <StandingBadge standing={standingOf(isBanned, suspension)} />
                  {report.reportedUserId && (
                    <Link
                      href={`/console/moderation/users/${report.reportedUserId}`}
                      className="textlink"
                    >
                      Standing and history
                    </Link>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      {report.resolution ? (
        <Panel id="resolution" title="Resolution">
          <DefinitionList
            items={[
              {
                term: "Subject action",
                detail: (
                  <span className="capitalize">
                    {report.resolution.subjectAction.replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                term: "Filer action",
                detail: (
                  <span className="capitalize">
                    {report.resolution.filerAction.replace(/_/g, " ")}
                  </span>
                ),
              },
              {
                term: "Content action",
                detail: (
                  <span className="capitalize">
                    {report.resolution.contentAction.replace(/_/g, " ")}
                  </span>
                ),
              },
              ...(report.resolution.appliedGlobally
                ? [{ term: "Scope", detail: "Applied globally" }]
                : []),
            ]}
          />
        </Panel>
      ) : (
        <ReportActionForm reportId={reportId} quarantinable={quarantinable} />
      )}

      {deliveries.length > 0 && (
        <Panel id="deliveries" title="Deliveries">
          <ModerationDeliveries deliveries={deliveries} />
        </Panel>
      )}
    </ConsoleShell>
  );
}
