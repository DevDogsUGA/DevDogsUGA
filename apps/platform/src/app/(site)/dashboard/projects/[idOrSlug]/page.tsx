import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import "~/components/Settings/settings.css";
import ProjectDraft from "~/components/Projects/ProjectDraft";
import {
  LinkRepoForm,
  ProjectCommand,
  RefreshCommitsCommand,
} from "~/components/Projects/ProjectCommands";
import { StatusBadge } from "~/components/Projects/ProjectBadges";
import ReportCard from "~/components/Projects/ReportCard";
import ReviewForm from "~/components/Projects/ReviewForm";
import "~/components/Projects/projects.css";
import {
  addOwnerAction,
  archiveProjectAction,
  decideRepoLinkAction,
  deleteProjectAction,
  deleteReportAction,
  makeDevdogsOwnedAction,
  removeOwnerAction,
  setAdvisorAction,
  unarchiveProjectAction,
  unlinkRepoAction,
} from "~/server/actions/projects";
import { requireDashboard, rules } from "~/server/auth/access";
import {
  findProjectId,
  getMyReports,
  getProjectDetail,
  getRelation,
  getReviewQueue,
  searchMembers,
} from "~/server/projects/load";
import { PROJECT_MAX_REPOS } from "~/server/projects/policy";
import {
  fileVerdict,
  mayEdit,
  mayManageOwners,
  mayUnarchive,
  type ProjectFacts,
} from "~/server/projects/records";
import { projectPath } from "~/server/projects/slug";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Button, buttonVariants } from "~/ui/button";
import Callout from "~/ui/callout";
import { EmptyState } from "~/ui/empty-state";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { TextLink } from "~/ui/text-link";

export const metadata: Metadata = {
  title: "Project | DevDogs",
  robots: { index: false },
};

const SYNCED = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * One project, by slug or by UUID (old links use the UUID). Any signed-in
 * member sees it, active or archived. What the page offers follows the Record
 * rules in `server/projects/records.ts`: an Owner edits, a Contributor files a
 * report, an Officer gets the officer-only controls, and the advisor or a
 * report reviewer sees the reports waiting on them.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ idOrSlug: string }>;
  searchParams: Promise<{ find?: string }>;
}) {
  await connection();
  const caller = await requireDashboard();
  const { idOrSlug } = await params;
  const projectId = await findProjectId(idOrSlug);
  if (!projectId) notFound();
  const project = await getProjectDetail(projectId);
  const officer = rules.officer(caller);
  if (!project) notFound();

  const reviewer = rules.reviewProjectReports(caller);
  const find = ((await searchParams).find ?? "").trim().slice(0, 80);
  const relation = await getRelation(caller.userId, projectId);
  const facts: ProjectFacts = {
    status: project.status,
    devdogsOwned: project.devdogsOwned,
    advisorId: project.advisorId,
    ownerIds: project.owners.map((owner) => owner.userId),
  };
  const actor = { userId: caller.userId, isOfficer: officer };
  const canEdit = mayEdit(facts, actor);
  const canManageOwners = mayManageOwners(facts, actor);
  const canUnarchive = mayUnarchive(facts, actor);
  const canFile =
    fileVerdict({
      isOfficer: officer,
      isContributor: relation.isContributor,
      projectStatus: project.status,
    }) === "yes";
  const reviewsHere = relation.isAdvisor || reviewer;
  const canRefresh = relation.isOwner || relation.isContributor || officer;
  const [reviewQueue, myReports, matches] = await Promise.all([
    reviewsHere
      ? getReviewQueue(caller.userId, { all: reviewer, projectId })
      : Promise.resolve([]),
    getMyReports(caller.userId).then((reports) =>
      reports.filter((report) => report.projectId === projectId),
    ),
    canManageOwners || officer ? searchMembers(find) : Promise.resolve([]),
  ]);
  const path = projectPath(project);
  const orphan = project.owners.length === 0 && !project.devdogsOwned;

  return (
    <div className="settings-shell">
      <PageHeading
        crumbs={[
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name },
        ]}
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <>
            <StatusBadge status={project.status} />
            {canFile && (
              <Link
                href={`${path}/report`}
                className={buttonVariants({ size: "sm" })}
              >
                File a report
              </Link>
            )}
          </>
        }
      />

      {project.status === "archived" && (
        <Callout tone="info" title="This project is archived">
          It takes no new reports. An owner or an officer can restore it once at
          least one repository is approved.
        </Callout>
      )}
      {orphan && officer && (
        <Callout tone="warning" title="This project has no owners">
          Add an owner below, or take the project over as DevDogs-owned.
        </Callout>
      )}

      <Panel id="about" title="Details">
        <div className="prj-acts">
          {project.devdogsOwned && <Badge>DevDogs-owned</Badge>}
          {project.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <p className="prj-meta">
          {project.advisorName
            ? `Advisor ${project.advisorName}`
            : "No advisor assigned"}
        </p>
        {officer && (
          <>
            {project.advisorId && (
              <ProjectCommand
                action={setAdvisorAction}
                args={[project.id, null]}
                label="Clear advisor"
              />
            )}
          </>
        )}
      </Panel>

      {canEdit && (
        <ProjectDraft
          projectId={project.id}
          values={{
            name: project.name,
            description: project.description ?? "",
            tags: project.tags,
          }}
        />
      )}

      <Panel
        id="repos"
        title="Repositories"
        help="A project's evidence comes from commits on these repos' default branches. Only public repos count; a repo that goes private is marked unavailable and its synced commits stay valid."
      >
        {project.repos.length === 0 ? (
          <EmptyState title="No repositories linked" />
        ) : (
          <ul className="prj-list">
            {project.repos.map((repo) => (
              <li key={repo.githubRepoId} className="prj-item">
                <div className="prj-head">
                  <TextLink href={repo.url} target="_blank" rel="noreferrer">
                    {repo.owner}/{repo.name}
                  </TextLink>
                  {repo.approval === "approved" ? (
                    repo.health === "available" ? (
                      <Badge variant="success">Available</Badge>
                    ) : (
                      <Badge variant="warning">Unavailable</Badge>
                    )
                  ) : (
                    <Badge variant="warning">
                      {repo.approval === "pending"
                        ? "Waiting for an officer"
                        : "Declined"}
                    </Badge>
                  )}
                </div>
                {repo.approval === "approved" && (
                  <p className="prj-meta">
                    {repo.health === "unavailable" && repo.unavailableSince
                      ? `Private or deleted since ${SYNCED.format(repo.unavailableSince)} Eastern. Synced commits still count.`
                      : repo.lastCheckedAt
                        ? `Checked ${SYNCED.format(repo.lastCheckedAt)} Eastern.`
                        : "Not checked yet."}
                  </p>
                )}
                <div className="prj-acts">
                  {repo.approval === "approved" && canRefresh && (
                    <RefreshCommitsCommand
                      projectId={project.id}
                      githubRepoId={repo.githubRepoId}
                    />
                  )}
                  {officer && repo.approval === "pending" && (
                    <>
                      <ProjectCommand
                        action={decideRepoLinkAction}
                        args={[project.id, repo.githubRepoId, "approve"]}
                        label="Approve"
                        variant="default"
                      />
                      <ProjectCommand
                        action={decideRepoLinkAction}
                        args={[project.id, repo.githubRepoId, "decline"]}
                        label="Decline"
                      />
                    </>
                  )}
                  {canEdit && (
                    <ProjectCommand
                      action={unlinkRepoAction}
                      args={[project.id, repo.githubRepoId]}
                      label="Unlink"
                      variant="destructive"
                      confirm={{
                        title: `Unlink ${repo.owner}/${repo.name}?`,
                        description:
                          "Its commits stop counting for new reports. A repo that existing reports cite cannot be unlinked.",
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit && project.repos.length < PROJECT_MAX_REPOS && (
          <LinkRepoForm projectId={project.id} />
        )}
      </Panel>

      <Panel
        id="owners"
        title="Owners"
        help={
          project.devdogsOwned
            ? "Officers are this project's owners."
            : "Owners edit the project and its repos, and add co-owners."
        }
      >
        {project.owners.length === 0 ? (
          <EmptyState
            title={project.devdogsOwned ? "Owned by the officers" : "No owners"}
          />
        ) : (
          <ul className="prj-list">
            {project.owners.map((owner) => (
              <li key={owner.userId} className="prj-item">
                <div className="prj-head">
                  <span className="prj-title">{owner.name ?? "Member"}</span>
                  {owner.handle && (
                    <Link
                      href={`/community/@${owner.handle}`}
                      className="prj-meta"
                    >
                      @{owner.handle}
                    </Link>
                  )}
                  {canManageOwners && (
                    <ProjectCommand
                      action={removeOwnerAction}
                      args={[project.id, owner.userId]}
                      label="Remove"
                      variant="destructive"
                      confirm={{
                        title: `Remove ${owner.name ?? "this owner"}?`,
                        description:
                          "They can no longer edit the project. A project keeps at least one owner.",
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {(canManageOwners || officer) && (
          <>
            <form method="get" className="prj-inline">
              <Field
                label={officer ? "Find a member" : "Find a co-owner"}
                htmlFor="prj-find"
                description={
                  officer
                    ? "An owner must have linked GitHub. An advisor can be any member."
                    : "Owners are chosen from members who have linked GitHub."
                }
              >
                <Input
                  id="prj-find"
                  name="find"
                  defaultValue={find}
                  maxLength={80}
                />
              </Field>
              <Button type="submit" size="sm" variant="secondary">
                Search
              </Button>
            </form>
            {find !== "" &&
              (matches.length === 0 ? (
                <EmptyState title="No one matches that search" />
              ) : (
                <ul className="prj-list">
                  {matches.map((member) => (
                    <li key={member.userId} className="prj-item">
                      <div className="prj-head">
                        <span className="prj-title">{member.name}</span>
                        {member.handle && (
                          <span className="prj-meta">@{member.handle}</span>
                        )}
                        {!member.linked && <Badge>No linked GitHub</Badge>}
                      </div>
                      <div className="prj-acts">
                        {canManageOwners &&
                          member.linked &&
                          !facts.ownerIds.includes(member.userId) && (
                            <ProjectCommand
                              action={addOwnerAction}
                              args={[project.id, member.userId]}
                              label="Make owner"
                            />
                          )}
                        {officer && member.userId !== project.advisorId && (
                          <ProjectCommand
                            action={setAdvisorAction}
                            args={[project.id, member.userId]}
                            label="Make advisor"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        )}
      </Panel>

      <Panel id="submissions" title="Hackathon submissions">
        {project.submissions.length === 0 ? (
          <EmptyState title="No submissions yet" />
        ) : (
          <ul className="prj-list">
            {project.submissions.map((submission) => (
              <li key={submission.id} className="prj-item">
                <div className="prj-head">
                  <TextLink
                    href={submission.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {submission.hackathon}
                  </TextLink>
                  {submission.result && <Badge>{submission.result}</Badge>}
                </div>
                {submission.team.length > 0 && (
                  <p className="prj-meta">{submission.team.join(", ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* TODO(D4): the record-a-submission form for owners lands with the hackathons stage. */}
      </Panel>

      {myReports.length > 0 && (
        <Panel id="my-reports" title="Your reports on this project">
          <ul className="prj-list">
            {myReports.map((report) => (
              <ReportCard key={report.id} report={report}>
                {report.status !== "approved" &&
                  report.legacyPullRequests.length === 0 && (
                    <div className="prj-acts">
                      <Link
                        href={`${path}/report?report=${report.id}`}
                        className={buttonVariants({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Edit
                      </Link>
                      <ProjectCommand
                        action={deleteReportAction}
                        args={[report.id]}
                        label="Delete"
                        variant="destructive"
                        confirm={{
                          title: "Delete this report?",
                          description:
                            "The report is removed and its commits can back another report.",
                        }}
                      />
                    </div>
                  )}
              </ReportCard>
            ))}
          </ul>
        </Panel>
      )}

      {reviewsHere && (
        <Panel
          id="review"
          title="Reports to review"
          help="Hours already credited to a workshop do not count again; adjust the hours if a report claims them. You cannot review your own report."
        >
          {reviewQueue.length === 0 ? (
            <EmptyState title="Nothing waiting for review" />
          ) : (
            <ul className="prj-list">
              {reviewQueue.map((report) => (
                <ReportCard key={report.id} report={report} showAuthor>
                  <ReviewForm
                    reportId={report.id}
                    claimedHours={report.hours}
                  />
                </ReportCard>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {(canEdit || canUnarchive || officer) && (
        <Panel id="lifecycle" title="Lifecycle">
          <div className="prj-acts">
            {canEdit && project.status === "active" && (
              <ProjectCommand
                action={archiveProjectAction}
                args={[project.id]}
                label="Archive project"
                confirm={{
                  title: "Archive this project?",
                  description:
                    "It takes no new reports while archived. An owner or an officer can restore it.",
                }}
              />
            )}
            {canUnarchive && project.status === "archived" && (
              <ProjectCommand
                action={unarchiveProjectAction}
                args={[project.id]}
                label="Restore project"
                variant="default"
              />
            )}
            {officer && !project.devdogsOwned && (
              <ProjectCommand
                action={makeDevdogsOwnedAction}
                args={[project.id]}
                label="Make DevDogs-owned"
                confirm={{
                  title: "Make this project DevDogs-owned?",
                  description:
                    "Officers become its owners and it can never be deleted. This cannot be undone.",
                }}
              />
            )}
            {canEdit && !project.devdogsOwned && (
              <ProjectCommand
                action={deleteProjectAction}
                args={[project.id]}
                label="Delete project"
                variant="destructive"
                confirm={{
                  title: "Delete this project?",
                  description:
                    "This removes the project and its repo links. It is refused when the project has reports or submissions; archive it instead.",
                }}
              />
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
