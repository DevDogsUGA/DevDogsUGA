import { redirect } from "next/navigation";
import Link from "next/link";
import { getModerationPageData } from "~/server/loaders/moderation";

export default async function ModerationDashboard() {
  const data = await getModerationPageData();

  if (!data.canModerate) redirect("/");

  const { pendingReports: pending, resolvedReports: resolved, clientNames } = data;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Moderation Dashboard</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-mauve-800">
          Pending Reports{" "}
          {pending.length > 0 && (
            <span className="ml-1 rounded-sm bg-rose-600 px-2 py-0.5 text-sm font-normal text-white">
              {pending.length}
            </span>
          )}
        </h2>

        {pending.length === 0 ? (
          <p className="text-mauve-400">No pending reports.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/console/moderation/${report.id}`}
                  className="shadow-block-sm flex items-center justify-between border border-black bg-white px-4 py-3 transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm text-mauve-700">
                      {report.contentTypeLabel ? `${report.contentTypeLabel}: ` : ""}
                      {report.contentId}
                    </span>
                    <span className="text-xs text-mauve-500">
                      {clientNames[report.clientId] ?? report.clientId} &middot;{" "}
                      {report.reasonTitle ?? "Unknown reason"} &middot;{" "}
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {report.corroborationCount > 0 && (
                      <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        +{report.corroborationCount} corroboration
                        {report.corroborationCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-mauve-400">&rarr;</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-mauve-600">
            Recent Resolved
          </h2>
          <ul className="flex flex-col gap-2">
            {resolved.slice(0, 20).map((report) => (
              <li key={report.id}>
                <Link
                  href={`/console/moderation/${report.id}`}
                  className="shadow-block-sm flex items-center justify-between border border-black bg-mauve-50 px-4 py-2.5 text-sm text-mauve-500 transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:text-mauve-800"
                >
                  <span className="font-mono">
                    {report.contentTypeLabel ? `${report.contentTypeLabel}: ` : ""}
                    {report.contentId}
                  </span>
                  <span className="text-mauve-500 capitalize">
                    {report.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
