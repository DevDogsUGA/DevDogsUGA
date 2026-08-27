import Link from "next/link";
import PageShell from "~/components/PageShell";
import ReportListItem from "~/components/ReportListItem";
import { StandingBadge, standingOf } from "~/components/StatusBadges";
import UserRoleForm from "~/components/UserRoleForm";
import { getUserModerationData } from "~/server/loaders/moderation";
import { ConsoleCard } from "~/ui/card";

export default async function UserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: targetUserId } = await params;
  const { displayName, isBanned, suspension, reports } =
    await getUserModerationData(targetUserId);

  return (
    <PageShell
      accent="rose"
      title={displayName}
      description={<span className="font-mono">{targetUserId}</span>}
      actions={
        <Link
          href="/console/moderation"
          className="rounded-sm text-sm text-mauve-400 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
        >
          &larr; Back to dashboard
        </Link>
      }
    >
      <ConsoleCard.Root id="current-standing">
        <ConsoleCard.Header title="Current Standing" />
        <ConsoleCard.Content>
          <StandingBadge
            standing={standingOf(isBanned, suspension)}
            detail={suspension?.reason}
          />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="update-role">
        <ConsoleCard.Header title="Update Role" />
        <ConsoleCard.Content>
          <UserRoleForm
            targetUserId={targetUserId}
            currentRole={
              isBanned ? "banned" : suspension ? "suspended" : "member"
            }
          />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="report-history">
        <ConsoleCard.Header title={`Report History (${reports.length})`} />
        <ConsoleCard.Content>
          {reports.length === 0 ? (
            <p className="text-sm text-mauve-400">No reports found.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reports.map((report) => (
                <li key={report.id}>
                  <ReportListItem
                    id={report.id}
                    contentId={report.contentRef}
                    contentTypeLabel={report.contentType}
                    reasonTitle={report.reasonDetail?.title}
                    status={report.status}
                    createdAt={report.createdAt}
                  />
                </li>
              ))}
            </ul>
          )}
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}
