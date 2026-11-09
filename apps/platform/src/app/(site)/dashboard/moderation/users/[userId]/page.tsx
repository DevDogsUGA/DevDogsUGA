import { rules, loadCaller } from "~/server/auth/access";
import type { Metadata } from "next";
import Link from "next/link";
import ScheduleDeletionPanel from "~/classic/components/AccountDeletion/ScheduleDeletionPanel";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import PageShell from "~/classic/components/PageShell";
import ReportListItem from "~/classic/components/ReportListItem";
import { StandingBadge, standingOf } from "~/classic/components/StatusBadges";
import UserRoleForm from "~/classic/components/UserRoleForm";
import { formatDeletionDate } from "~/server/accountDeletion/dates";
import { getPendingDeletion } from "~/server/accountDeletion/schedule";

import { expectSession } from "~/server/auth";
import { getUserModerationData } from "~/server/loaders/moderation";
import { ConsoleCard } from "~/classic/ui/card";

export const metadata: Metadata = {
  title: "Standing | Moderation | Console | DevDogs",
  robots: { index: false },
};

export default async function UserModerationPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: targetUserId } = await params;
  const { displayName, isBanned, suspension, reports } =
    await getUserModerationData(targetUserId);
  // The panel is for officers holding canDeleteAccounts; the actions check it
  // again, so hiding it here is only for tidiness.
  const viewerId = await expectSession();
  const canDelete = await loadCaller().then(
    (caller) =>
      caller !== null &&
      caller.userId === viewerId &&
      rules.deleteAccounts(caller),
  );
  const pendingDeletion = canDelete
    ? await getPendingDeletion(targetUserId)
    : null;

  return (
    <ConsoleFrame>
      <PageShell
        accent="rose"
        title={displayName}
        description={<span className="font-mono">{targetUserId}</span>}
        actions={
          <Link
            href="/dashboard/moderation"
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

        {/* Your own account is deleted from Settings, where the dialog signs you
          out to the pending page; scheduling it here would revoke the session
          this page is rendering for. */}
        {canDelete && targetUserId !== viewerId && (
          <ConsoleCard.Root id="account-deletion">
            <ConsoleCard.Header
              title="Account Deletion"
              description="Holders of the delete-accounts permission only. Audited with you as the actor."
            />
            <ConsoleCard.Content>
              <ScheduleDeletionPanel
                targetUserId={targetUserId}
                memberName={displayName}
                pending={
                  pendingDeletion
                    ? {
                        date: formatDeletionDate(pendingDeletion.scheduledFor),
                        started: pendingDeletion.started,
                        requestedBy: pendingDeletion.requestedByOfficer
                          ? "officer"
                          : "member",
                      }
                    : null
                }
              />
            </ConsoleCard.Content>
          </ConsoleCard.Root>
        )}

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
    </ConsoleFrame>
  );
}
