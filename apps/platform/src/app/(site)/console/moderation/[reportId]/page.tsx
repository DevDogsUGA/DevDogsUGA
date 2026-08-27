import Link from "next/link";
import PageShell from "~/components/PageShell";
import ReportActionForm from "~/components/ReportActionForm";
import { StandingBadge, standingOf } from "~/components/StatusBadges";
import { getReportDetailData } from "~/server/loaders/moderation";
import Badge from "~/ui/badge";
import { ConsoleCard } from "~/ui/card";

/** Every standalone link on this page: quiet until hovered or focused. */
const LINK_CLASS =
  "rounded-sm text-mauve-400 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

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
    reporterName,
    reportedName,
    suspension,
    isBanned,
  } = await getReportDetailData(reportId);

  return (
    <PageShell
      accent="rose"
      title="Report"
      // The id is the page's identity but not its name -- it is a uuid, and as
      // a heading it pushed the one word that says what this page is off to
      // the side. It reads first in the description instead, where the rest of
      // the report's standing metadata already lives.
      description={
        <>
          <span className="font-mono text-mauve-300">{reportId}</span> &middot;{" "}
          {new Date(report.createdAt).toLocaleString()} &middot; status:{" "}
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
      actions={
        <Link href="/console/moderation" className={`text-sm ${LINK_CLASS}`}>
          &larr; Back to dashboard
        </Link>
      }
    >
      <ConsoleCard.Root id="content">
        <ConsoleCard.Header title="Content">
          <Badge>{report.contentType}</Badge>
        </ConsoleCard.Header>
        <ConsoleCard.Content>
          {/* One wrapper child: ConsoleCard.Content rules between its direct
              children, and a divider between an id, a link and a snapshot of
              the same piece of content would be drawing lines through one
              thought. */}
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs text-mauve-400">
              ID: {report.contentRef}
            </p>
            {report.contentUrl && (
              <a
                href={report.contentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-xs text-blue-300 transition-colors outline-none hover:text-blue-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
              >
                View live &rarr;
              </a>
            )}
            <pre className="mt-1 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs whitespace-pre-wrap text-mauve-200">
              {report.contentSnapshot}
            </pre>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <div className="grid gap-3 sm:grid-cols-2">
        <ConsoleCard.Root id="reporter">
          <ConsoleCard.Header title="Reporter" />
          <ConsoleCard.Content>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-white">{reporterName}</p>
              <p className="font-mono text-xs text-mauve-400">
                {report.reporterUserId}
              </p>
              {report.reason && (
                <p className="mt-1 text-xs text-mauve-400">
                  Reason: <span>{report.reasonDetail.title}</span>
                </p>
              )}
              {report.description && (
                <p className="mt-1 text-xs text-mauve-300">
                  &ldquo;{report.description}&rdquo;
                </p>
              )}
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>

        <ConsoleCard.Root id="reported-user">
          <ConsoleCard.Header title="Reported User" />
          <ConsoleCard.Content>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-white">{reportedName}</p>
              <p className="font-mono text-xs text-mauve-400">
                {report.reportedUserId}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StandingBadge standing={standingOf(isBanned, suspension)} />
                <Link
                  href={`/console/moderation/users/${report.reportedUserId}`}
                  className={`text-xs ${LINK_CLASS}`}
                >
                  View history &rarr;
                </Link>
              </div>
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </div>

      {report.resolution ? (
        <ConsoleCard.Root id="resolution">
          <ConsoleCard.Header title="Resolution" />
          <ConsoleCard.Content>
            <div className="flex flex-col gap-2">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-mauve-400">Subject action</dt>
                  <dd className="text-white capitalize">
                    {report.resolution.subjectAction.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-mauve-400">Filer action</dt>
                  <dd className="text-white capitalize">
                    {report.resolution.filerAction.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-mauve-400">Content action</dt>
                  <dd className="text-white capitalize">
                    {report.resolution.contentAction.replace(/_/g, " ")}
                  </dd>
                </div>
              </dl>
              {report.resolution.appliedGlobally && (
                <p className="text-xs text-amber-300">Applied globally</p>
              )}
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      ) : (
        <ReportActionForm reportId={reportId} quarantinable={quarantinable} />
      )}
    </PageShell>
  );
}
