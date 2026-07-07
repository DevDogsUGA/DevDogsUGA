import Link from "next/link";
import UserRoleForm from "~/components/UserRoleForm";
import { getUserModerationData } from "~/server/loaders/moderation";

export default async function UserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: targetUserId } = await params;
  const { displayName, isBanned, suspension, reports } =
    await getUserModerationData(targetUserId);

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

      <h1 className="mb-1 text-xl font-bold">{displayName}</h1>
      <p className="mb-6 font-mono text-sm text-mauve-500">{targetUserId}</p>

      <section className="shadow-block-sm relative mb-6 border border-black bg-white p-4">
        <h2 className="mb-3 font-semibold">Current Standing</h2>
        <div className="flex items-center gap-2 text-sm">
          {isBanned ? (
            <span className="rounded-sm bg-red-100 px-2.5 py-0.5 text-xs text-red-700">
              Banned
            </span>
          ) : suspension ? (
            <span className="rounded-sm bg-orange-100 px-2.5 py-0.5 text-xs text-orange-700">
              Suspended
            </span>
          ) : (
            <span className="rounded-sm bg-mauve-100 px-2.5 py-0.5 text-xs text-mauve-600">
              Member
            </span>
          )}
          {suspension?.reason && (
            <span className="text-xs text-mauve-400">
              &mdash; {suspension.reason}
            </span>
          )}
        </div>
      </section>

      <section className="shadow-block-sm relative mb-6 border border-black bg-white p-4">
        <h2 className="mb-3 font-semibold">Update Role</h2>
        <UserRoleForm
          targetUserId={targetUserId}
          currentRole={
            isBanned ? "banned" : suspension ? "suspended" : "member"
          }
        />
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          Report History ({reports.length})
        </h2>

        {reports.length === 0 ? (
          <p className="text-sm text-mauve-400">No reports found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/console/moderation/${report.id}`}
                  className="shadow-block-sm flex items-center justify-between border border-black bg-white px-4 py-2.5 text-sm transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-mauve-700">
                      {report.contentType?.label ? `${report.contentType.label}: ` : ""}
                      {report.contentId}
                    </span>
                    <span className="text-xs text-mauve-500">
                      {report.reason?.title ?? "Unknown reason"} &middot;{" "}
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-xs capitalize ${
                        report.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : report.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : "bg-mauve-100 text-mauve-600"
                      }`}
                    >
                      {report.status}
                    </span>
                    {report.resolution?.subjectAction &&
                      report.resolution.subjectAction !== "no_action" && (
                        <span className="rounded-sm bg-rose-100 px-2 py-0.5 text-xs text-rose-700 capitalize">
                          {report.resolution.subjectAction}
                        </span>
                      )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
