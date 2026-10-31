import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import "~/components/Settings/settings.css";
import NewProjectForm from "~/components/Projects/NewProjectForm";
import { ProjectCommand } from "~/components/Projects/ProjectCommands";
import { StatusBadge } from "~/components/Projects/ProjectBadges";
import ReportCard from "~/components/Projects/ReportCard";
import "~/components/Projects/projects.css";
import { deleteReportAction } from "~/server/actions/projects";
import { requireDashboard, rules } from "~/server/auth/access";
import {
  getAllProjects,
  getMyProjects,
  getMyReports,
  type ProjectSummary,
} from "~/server/projects/load";
import { projectPath } from "~/server/projects/slug";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { buttonVariants } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";

export const metadata: Metadata = {
  title: "Projects | DevDogs",
  robots: { index: false },
};

function ProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <li className="prj-item">
      <div className="prj-head">
        <Link href={projectPath(project)} className="prj-title">
          {project.name}
        </Link>
        <StatusBadge status={project.status} />
        {project.isOwner && <Badge variant="info">Owner</Badge>}
        {project.isAdvisor && <Badge variant="info">Advisor</Badge>}
      </div>
      {project.description && <p className="prj-meta">{project.description}</p>}
    </li>
  );
}

/**
 * Projects for every signed-in member: the ones they own, the ones they
 * contribute to or advise, their EL reports, and a form to create a project
 * from a GitHub repo. Officers also get every project, with the ones that
 * need them first.
 */
export default async function ProjectsPage() {
  await connection();
  const caller = await requireDashboard();
  const officer = rules.officer(caller);
  const [projects, reports, all] = await Promise.all([
    getMyProjects(caller.userId),
    getMyReports(caller.userId),
    officer ? getAllProjects() : Promise.resolve([]),
  ]);
  const owned = projects.filter((project) => project.isOwner);
  const other = projects.filter((project) => !project.isOwner);

  return (
    <div className="settings-shell">
      <PageHeading
        title="Projects"
        description="Long-running DevDogs projects, each anchored to a public GitHub repo. Anyone with a commit in a project's repos is a contributor. You write a report only to earn EL credit; your commits already count toward your streak."
        actions={
          rules.reviewProjectReports(caller) && (
            <Link
              href="/dashboard/reviews"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Review queue
            </Link>
          )
        }
      />
      <Panel id="mine" title="Your projects">
        {owned.length === 0 ? (
          <EmptyState title="You do not own a project yet" />
        ) : (
          <ul className="prj-list">
            {owned.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel id="contributing" title="Projects you contribute to or advise">
        {other.length === 0 ? (
          <EmptyState title="No commits in a project's repos yet" />
        ) : (
          <ul className="prj-list">
            {other.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        id="reports"
        title="Your reports"
        help="Only approved hours count toward EL credit. A returned report can be edited and sent again."
      >
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" />
        ) : (
          <ul className="prj-list">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report}>
                {report.status !== "approved" &&
                  report.legacyPullRequests.length === 0 && (
                    <div className="prj-acts">
                      <Link
                        href={`${projectPath({ slug: report.projectSlug })}/report?report=${report.id}`}
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
        )}
      </Panel>
      <Panel
        id="new"
        title="New project"
        help="Every project is tied to at least one public GitHub repo you can prove you control."
      >
        <NewProjectForm />
      </Panel>
      {officer && (
        <Panel id="all" title="All projects">
          {all.length === 0 ? (
            <EmptyState title="No projects yet" />
          ) : (
            <ul className="prj-list">
              {all.map((project) => (
                <li key={project.id} className="prj-item">
                  <div className="prj-head">
                    <Link href={projectPath(project)} className="prj-title">
                      {project.name}
                    </Link>
                    <StatusBadge status={project.status} />
                    {project.devdogsOwned && <Badge>DevDogs-owned</Badge>}
                    {project.pendingLinks > 0 && (
                      <Badge variant="warning">
                        {project.pendingLinks} repo{" "}
                        {project.pendingLinks === 1 ? "link" : "links"} to
                        approve
                      </Badge>
                    )}
                    {project.ownerCount === 0 && !project.devdogsOwned && (
                      <Badge variant="warning">No owners</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
