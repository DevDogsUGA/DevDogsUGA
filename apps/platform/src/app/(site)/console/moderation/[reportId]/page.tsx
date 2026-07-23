import Link from "next/link";
import ReportActionForm from "~/components/ReportActionForm";
import { getReportDetailData } from "~/server/loaders/moderation";

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const {
    report,
    corroborationCount,
    reporterName,
    reportedName,
    suspension,
    isBanned,
  } = await getReportDetailData(reportId);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-4">
        <Link
          href="/console/moderation"
          className="text-sm text-mauve-500 hover:text-mauve-800"
        >
          &larr; Back to dashboard
        </Link>
      </div>

      <h1 className="mb-1 text-xl font-bold">
        Report{" "}
        <span className="font-mono text-base text-mauve-400">{reportId}</span>
      </h1>
      <p className="mb-6 text-sm text-mauve-500">
        {new Date(report.createdAt).toLocaleString()} &middot; status:{" "}
        <span className="capitalize">{report.status}</span>
        {corroborationCount > 0 && (
          <>
            {" "}
            &middot; +{corroborationCount} corroboration
            {corroborationCount !== 1 ? "s" : ""}
          </>
        )}
      </p>

      <section className="shadow-block-sm relative mb-6 border border-black bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Content</h2>
          {report.contentType?.label && (
            <span className="rounded-sm bg-mauve-100 px-2 py-0.5 text-xs text-mauve-600">
              {report.contentType.label}
            </span>
          )}
        </div>
        <p className="mb-1 font-mono text-xs text-mauve-400">
          ID: {report.contentId}
        </p>
        {report.contentUrl && (
          <a
            href={report.contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 block text-xs text-blue-400 hover:text-blue-300"
          >
            View live &rarr;
          </a>
        )}
        <pre className="mt-2 border border-black bg-mauve-50 p-3 font-mono text-sm whitespace-pre-wrap text-mauve-800">
          {report.contentSnapshot}
        </pre>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3">
        <div className="shadow-block-sm border border-black bg-white p-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
            Reporter
          </h2>
          <p className="font-medium">{reporterName}</p>
          <p className="font-mono text-xs text-mauve-500">
            {report.reporterUserId}
          </p>
          {report.reason && (
            <p className="mt-1 text-xs text-mauve-400">
              Reason: <span>{report.reason.title}</span>
            </p>
          )}
          {report.description && (
            <p className="mt-1 text-xs text-mauve-700">
              &ldquo;{report.description}&rdquo;
            </p>
          )}
        </div>

        <div className="shadow-block-sm border border-black bg-white p-4">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
            Reported User
          </h2>
          <p className="font-medium">{reportedName}</p>
          <p className="font-mono text-xs text-mauve-500">
            {report.reportedUserId}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            {isBanned ? (
              <span className="rounded-sm bg-red-100 px-2 py-0.5 text-xs text-red-700">
                Banned
              </span>
            ) : suspension ? (
              <span className="rounded-sm bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                Suspended
              </span>
            ) : (
              <span className="rounded-sm bg-mauve-100 px-2 py-0.5 text-xs text-mauve-600">
                Member
              </span>
            )}
            <Link
              href={`/console/moderation/users/${report.reportedUserId}`}
              className="text-xs text-mauve-500 hover:text-mauve-800"
            >
              View history &rarr;
            </Link>
          </div>
        </div>
      </section>

      {report.resolution ? (
        <section className="shadow-block-sm border border-black bg-white p-4">
          <h2 className="mb-2 font-semibold">Resolution</h2>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-mauve-500">Subject action</dt>
              <dd className="capitalize">
                {report.resolution.subjectAction.replace(/_/g, " ")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-mauve-500">Filer action</dt>
              <dd className="capitalize">
                {report.resolution.filerAction.replace(/_/g, " ")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-mauve-500">Content action</dt>
              <dd className="capitalize">
                {report.resolution.contentAction.replace(/_/g, " ")}
              </dd>
            </div>
          </dl>
          {report.resolution.appliedGlobally && (
            <p className="mt-2 text-xs text-amber-600">Applied globally</p>
          )}
        </section>
      ) : (
        <ReportActionForm reportId={reportId} />
      )}
    </main>
  );
}
