import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getNavUser } from "~/components/TopNav/data";
import VerificationChecklist from "~/components/VerificationChecklist";
import "~/components/Settings/settings.css";
import * as icons from "~/config/icons";
import { DASHBOARD_GROUPS } from "~/config/dashboard";
import { formatDeletionDate } from "~/server/accountDeletion/dates";
import { getPendingDeletion } from "~/server/accountDeletion/schedule";
import { requireDashboard } from "~/server/auth/access";
import { visibleSections } from "~/server/dashboard/sections";
import { getElSummary } from "~/server/el/summary";
import { getWeeklyParticipation } from "~/server/loaders/weeklyParticipation";
import { getMyProjects } from "~/server/projects/load";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { Card } from "~/ui/card";
import { EmptyState } from "~/ui/empty-state";
import { ListRow } from "~/ui/list-row";
import { StatTile, StatTiles } from "~/ui/stat-tile";
import { TextLink } from "~/ui/text-link";

export const metadata: Metadata = {
  title: "Overview | DevDogs",
  robots: { index: false },
};

const STATUS_LABEL = {
  proposed: "Awaiting leadership",
  active: "Active",
  declined: "Declined",
  archived: "Archived",
} as const;

/**
 * The dashboard landing page: where the member's account stands (a pending
 * deletion, unfinished verification, attendance, projects) and one card per
 * group of sections they can open. The cards read `visibleSections`, the same
 * registry the side nav does, so a member never sees a group they can't use.
 *
 * Reads the session, so it is never cached. Its terminal twin is a browser
 * notice (`terminal/routes.ts`).
 */
export default async function OverviewPage() {
  await connection();
  const caller = await requireDashboard();
  const [user, pending, weekly, el, projects] = await Promise.all([
    getNavUser(),
    getPendingDeletion(caller.userId),
    getWeeklyParticipation(caller.userId),
    getElSummary(caller.userId),
    getMyProjects(caller.userId),
  ]);
  const verification = user?.verification;
  const sections = visibleSections(caller);
  const groups = DASHBOARD_GROUPS.filter(
    (group) =>
      group !== "Overview" &&
      sections.some((section) => section.group === group),
  );

  return (
    <>
      <PageHeading title="Overview" />

      {pending && (
        <Callout tone="warning" title="Your account is scheduled for deletion">
          It will be deleted on {formatDeletionDate(pending.scheduledFor)}.{" "}
          <TextLink href="/dashboard/deletion">View deletion details</TextLink>
        </Callout>
      )}

      {verification && !verification.isVerified && (
        <Panel
          id="verification"
          title="Finish account setup"
          help={
            verification.publicProfiles
              ? "Verified members can choose to appear on the DevDogs community page."
              : "Verification confirms you are a current UGA student in the club."
          }
        >
          <div className="set-rows">
            <VerificationChecklist
              userId={verification.userId}
              verificationStatus={verification.verificationStatus}
              isVerified={verification.isVerified}
              involvementFullName={verification.involvementFullName}
              showPublicProfile={false}
            />
          </div>
        </Panel>
      )}

      <Panel id="attendance" title="Attendance">
        <StatTiles>
          <StatTile label="Workshops attended" value={el.workshopsAttended} />
          <StatTile
            label="Current streak"
            value={weekly.current}
            sub={weekly.current === 1 ? "week" : "weeks"}
          />
        </StatTiles>
      </Panel>

      <Panel id="projects" title="Your projects">
        {projects.length === 0 ? (
          <EmptyState title="You are not on a project yet" />
        ) : (
          projects.map((project) => (
            <ListRow
              key={project.id}
              variant="account"
              title={project.name}
              end={
                <Badge
                  variant={project.status === "active" ? "success" : "default"}
                >
                  {STATUS_LABEL[project.status]}
                </Badge>
              }
            />
          ))
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <Card key={group} as="section" flat aria-labelledby={`${group}-h`}>
            <h2 id={`${group}-h`} className="h3">
              {group}
            </h2>
            {sections
              .filter((section) => section.group === group)
              .map((section) => {
                const Icon = icons[section.icon];
                return (
                  <ListRow
                    key={section.id}
                    variant="account"
                    icon={<Icon />}
                    title={<Link href={section.href}>{section.label}</Link>}
                    description={section.description}
                  />
                );
              })}
          </Card>
        ))}
      </div>
    </>
  );
}
