import type { Metadata } from "next";
import ScheduleDeletionPanel from "~/components/AccountDeletion/ScheduleDeletionPanel";
import ConsoleShell from "~/components/Console/ConsoleShell";
import ReportListItem from "~/components/ReportListItem";
import { StandingBadge, standingOf } from "~/components/StatusBadges";
import UserRoleForm from "~/components/UserRoleForm";
import { formatDeletionDate } from "~/server/accountDeletion/dates";
import { getPendingDeletion } from "~/server/accountDeletion/schedule";
import { canUserDeleteAccounts } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { getUserModerationData } from "~/server/loaders/moderation";
import { PageHeading, Panel } from "~/ui/app-shell";
import { EmptyState } from "~/ui/empty-state";

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
  const canDelete = await canUserDeleteAccounts(viewerId);
  const pendingDeletion = canDelete
    ? await getPendingDeletion(targetUserId)
    : null;

  return (
    <ConsoleShell current="/console/moderation">
      <PageHeading
        crumbs={[
          { label: "Moderation", href: "/console/moderation" },
          { label: displayName },
        ]}
        title={displayName}
        description={<code className="con-code">{targetUserId}</code>}
      />

      <Panel id="current-standing" title="Current standing">
        <StandingBadge
          standing={standingOf(isBanned, suspension)}
          detail={suspension?.reason}
        />
      </Panel>

      <Panel id="update-role" title="Update role">
        <UserRoleForm
          targetUserId={targetUserId}
          currentRole={
            isBanned ? "banned" : suspension ? "suspended" : "member"
          }
        />
      </Panel>

      {/* Your own account is deleted from Settings, where the dialog signs you
          out to the pending page; scheduling it here would revoke the session
          this page is rendering for. */}
      {canDelete && targetUserId !== viewerId && (
        <Panel
          id="account-deletion"
          title="Account deletion"
          help="Holders of the delete-accounts permission only. Audited with you as the actor."
        >
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
        </Panel>
      )}

      <Panel id="report-history" title={`Report history (${reports.length})`}>
        {reports.length === 0 ? (
          <EmptyState title="No reports found" />
        ) : (
          <ul className="con-list">
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
      </Panel>
    </ConsoleShell>
  );
}
