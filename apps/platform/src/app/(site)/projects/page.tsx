import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import SettingsShell from "~/components/Settings/SettingsShell";
import ProjectActionForm from "~/components/Projects/ProjectActionForm";
import ProposeProjectForm from "~/components/Projects/ProposeProjectForm";
import ReportCard from "~/components/Projects/ReportCard";
import "~/components/Projects/projects.css";
import { isOfficer } from "~/server/actions/permissions";
import { deleteReportAction } from "~/server/actions/projects";
import { requireSession } from "~/server/auth/require";
import {
  advisesAnyProject,
  getMyProjects,
  getMyReports,
} from "~/server/projects/load";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { EmptyState } from "~/ui/empty-state";
import { buttonVariants } from "~/ui/button";

export const metadata: Metadata = {
  title: "Projects | DevDogs",
  robots: { index: false },
};

const STATUS_LABEL = {
  proposed: "Awaiting leadership",
  active: "Active",
  declined: "Declined",
  archived: "Archived",
} as const;

/**
 * A member's projects: the ones they are on or advise, a form to propose one,
 * and the EL reports they have written. Reports are needed only for EL credit;
 * a merged pull request counts toward a streak without one.
 */
export default async function ProjectsPage() {
  await connection();
  const userId = await requireSession();
  const [projects, reports, advisor, officer] = await Promise.all([
    getMyProjects(userId),
    getMyReports(userId),
    advisesAnyProject(userId),
    isOfficer(userId),
  ]);

  return (
    <SettingsShell current="/projects">
      <PageHeading
        title="Projects"
        description="Long-running DevDogs projects. Members propose one, leadership approves it and assigns an advisor, and the advisor keeps its member list. You write a project report only to earn EL credit; any merged pull request already counts toward your streak."
        actions={
          (advisor || officer) && (
            <Link
              href="/console/projects"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Review queue
            </Link>
          )
        }
      />
      <Panel id="mine" title="Your projects">
        {projects.length === 0 ? (
          <EmptyState title="You are not on a project yet" />
        ) : (
          <ul className="prj-list">
            {projects.map((project) => (
              <li key={project.id} className="prj-item">
                <div className="prj-head">
                  <span className="prj-title">{project.name}</span>
                  <Badge
                    variant={project.status === "active" ? "success" : "default"}
                  >
                    {STATUS_LABEL[project.status]}
                  </Badge>
                  {project.isAdvisor && <Badge variant="info">Advisor</Badge>}
                </div>
                {project.description && (
                  <p className="prj-meta">{project.description}</p>
                )}
                <p className="prj-meta">
                  {project.repos.length > 0
                    ? project.repos.join(", ")
                    : "No repositories listed"}
                  {" · "}
                  {project.advisorName
                    ? `Advisor ${project.advisorName}`
                    : "No advisor yet"}
                </p>
                {project.status === "active" && (
                  <div className="prj-acts">
                    <Link
                      href={`/projects/${project.id}/report`}
                      className={buttonVariants({ size: "sm" })}
                    >
                      Write a report
                    </Link>
                    {(project.isAdvisor || officer) && (
                      <Link
                        href={`/console/projects/${project.id}`}
                        className={buttonVariants({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        Manage members
                      </Link>
                    )}
                  </div>
                )}
              </li>
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
                {report.status !== "approved" && (
                  <div className="prj-acts">
                    <Link
                      href={`/projects/${report.projectId}/report?report=${report.id}`}
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Edit
                    </Link>
                    <ProjectActionForm
                      action={deleteReportAction}
                      fields={{ reportId: report.id }}
                      label="Delete"
                      variant="destructive"
                    />
                  </div>
                )}
              </ReportCard>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        id="propose"
        title="Propose a project"
        help="Leadership reviews proposals, approves the ones that fit, and assigns each an advisor."
      >
        <ProposeProjectForm />
      </Panel>
    </SettingsShell>
  );
}
