import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import ConsoleShell from "~/components/Console/ConsoleShell";
import ProjectActionForm from "~/components/Projects/ProjectActionForm";
import ReportCard from "~/components/Projects/ReportCard";
import "~/components/Projects/projects.css";
import { isOfficer } from "~/server/actions/permissions";
import {
  addProjectMemberAction,
  archiveProjectAction,
  decideProjectAction,
  removeProjectMemberAction,
  setProjectAdvisorAction,
  updateProjectReposAction,
} from "~/server/actions/projects";
import { requireSession } from "~/server/auth/require";
import { searchMembersForBadges } from "~/server/loaders/badges";
import {
  getProject,
  getProjectMembers,
  getProjectReports,
} from "~/server/projects/load";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import Field from "~/ui/field";
import { Input } from "~/ui/input";
import { Textarea } from "~/ui/textarea";

export const metadata: Metadata = {
  title: "Project | Console | DevDogs",
  robots: { index: false },
};

/**
 * One project, for leadership and its advisor. Leadership decides a proposal
 * (choosing the advisor from a member search), replaces the advisor and
 * archives; the advisor, or leadership, keeps the members and repositories.
 */
export default async function ProjectConsolePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const userId = await requireSession();
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const project = await getProject(projectId);
  if (!project) notFound();
  const officer = await isOfficer(userId);
  const advisor = project.advisorId === userId;
  if (!officer && !advisor) notFound();

  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const [members, reports, matches] = await Promise.all([
    getProjectMembers(projectId),
    getProjectReports(projectId),
    q ? searchMembersForBadges(q) : Promise.resolve([]),
  ]);
  const memberIds = new Set(members.map((member) => member.userId));
  const proposed = project.status === "proposed";
  const active = project.status === "active";

  return (
    <ConsoleShell current="/console/projects">
      <PageHeading
        crumbs={[
          { label: "Projects", href: "/console/projects" },
          { label: project.name },
        ]}
        title={project.name}
        description={project.description ?? undefined}
        actions={<Badge>{project.status}</Badge>}
      />
      <Panel id="about" title="Details">
        <p className="prj-meta">
          {project.advisorName
            ? `Advisor ${project.advisorName}`
            : "No advisor assigned"}
          {project.proposedByName && ` · proposed by ${project.proposedByName}`}
        </p>
        {active && (
          <ProjectActionForm
            action={updateProjectReposAction}
            fields={{ projectId }}
            label="Save repositories"
          >
            <Field label="Repositories" htmlFor="prj-repos">
              <Textarea
                id="prj-repos"
                name="repos"
                defaultValue={project.repos.join("\n")}
                maxLength={2000}
                rows={3}
              />
            </Field>
          </ProjectActionForm>
        )}
        {!active && (
          <p className="prj-meta">
            {project.repos.length > 0
              ? project.repos.join(", ")
              : "No repositories listed"}
          </p>
        )}
      </Panel>

      {(proposed || active) && (
        <Panel
          id="people"
          title={
            proposed
              ? "Choose an advisor"
              : officer
                ? "Advisor and members"
                : "Members"
          }
          help={
            proposed
              ? "Search for the member who will advise this project, then approve with them."
              : "Search for a member to add to the project."
          }
        >
          <form method="get" className="prj-inline">
            <Field label="Name or handle" htmlFor="prj-search">
              <Input id="prj-search" name="q" defaultValue={q} maxLength={80} />
            </Field>
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          {q &&
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
                    </div>
                    <div className="prj-acts">
                      {proposed && officer && (
                        <ProjectActionForm
                          action={decideProjectAction}
                          fields={{
                            projectId,
                            intent: "approve",
                            advisorId: member.userId,
                          }}
                          label="Approve with this advisor"
                          variant="default"
                        />
                      )}
                      {active && officer && (
                        <ProjectActionForm
                          action={setProjectAdvisorAction}
                          fields={{ projectId, advisorId: member.userId }}
                          label="Make advisor"
                        />
                      )}
                      {active && !memberIds.has(member.userId) && (
                        <ProjectActionForm
                          action={addProjectMemberAction}
                          fields={{ projectId, userId: member.userId }}
                          label="Add as member"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          {proposed && officer && (
            <ProjectActionForm
              action={decideProjectAction}
              fields={{ projectId, intent: "decline" }}
              label="Decline proposal"
              variant="destructive"
            />
          )}
        </Panel>
      )}

      <Panel id="members" title="Members">
        {members.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <ul className="prj-list">
            {members.map((member) => (
              <li key={member.userId} className="prj-item">
                <div className="prj-head">
                  <span className="prj-title">{member.name ?? "Member"}</span>
                  {member.handle && (
                    <Link
                      href={`/console/badges/${member.userId}`}
                      className="prj-meta"
                    >
                      @{member.handle}
                    </Link>
                  )}
                </div>
                {active && (
                  <ProjectActionForm
                    action={removeProjectMemberAction}
                    fields={{ projectId, userId: member.userId }}
                    label="Remove"
                    variant="destructive"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="reports" title="Reports">
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" />
        ) : (
          <ul className="prj-list">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} showAuthor />
            ))}
          </ul>
        )}
      </Panel>

      {active && officer && (
        <Panel id="archive" title="Archive">
          <ProjectActionForm
            action={archiveProjectAction}
            fields={{ projectId }}
            label="Archive project"
            variant="destructive"
          />
        </Panel>
      )}
    </ConsoleShell>
  );
}
