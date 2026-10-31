import { rules, loadCaller } from "~/server/auth/access";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "~/components/Console/console.css";
import ReportCard from "~/components/Projects/ReportCard";
import ReviewForm from "~/components/Projects/ReviewForm";
import "~/components/Projects/projects.css";

import { requireSession } from "~/server/auth/require";
import {
  advisesAnyProject,
  getAllProjects,
  getReviewQueue,
} from "~/server/projects/load";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { EmptyState } from "~/ui/empty-state";

export const metadata: Metadata = {
  title: "Projects | Console | DevDogs",
  robots: { index: false },
};

const STATUS_LABEL = {
  proposed: "Awaiting approval",
  active: "Active",
  declined: "Declined",
  archived: "Archived",
} as const;

/**
 * The project console. Leadership sees every project and every report waiting
 * for review, and decides proposals; an advisor sees the reports of the
 * projects they advise. Nobody sees their own report here: they cannot review it.
 */
export default async function ProjectsConsolePage() {
  const userId = await requireSession();
  const officer = await loadCaller().then(
    (caller) =>
      caller !== null && caller.userId === userId && rules.officer(caller),
  );
  if (!officer && !(await advisesAnyProject(userId))) notFound();
  const [queue, projects] = await Promise.all([
    getReviewQueue(userId, officer),
    officer ? getAllProjects() : Promise.resolve([]),
  ]);

  return (
    <div className="con">
      <PageHeading
        title="Projects"
        description="Approve project proposals and assign advisors, and review members' project reports: approve them, adjusting the hours if needed, or return them with a note. Every decision is written to the audit log."
      />
      <Panel
        id="reports"
        title="Reports to review"
        help="Hours already credited to a workshop do not count again; adjust the hours if a report claims them."
      >
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting for review" />
        ) : (
          <ul className="prj-list">
            {queue.map((report) => (
              <ReportCard key={report.id} report={report} showAuthor>
                <ReviewForm reportId={report.id} claimedHours={report.hours} />
              </ReportCard>
            ))}
          </ul>
        )}
      </Panel>
      {officer && (
        <Panel id="projects" title="All projects">
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" />
          ) : (
            <ul className="prj-list">
              {projects.map((project) => (
                <li key={project.id} className="prj-item">
                  <div className="prj-head">
                    <Link
                      href={`/dashboard/reviews/${project.id}`}
                      className="prj-title"
                    >
                      {project.name}
                    </Link>
                    <Badge
                      variant={
                        project.status === "active"
                          ? "success"
                          : project.status === "proposed"
                            ? "warning"
                            : "default"
                      }
                    >
                      {STATUS_LABEL[project.status]}
                    </Badge>
                  </div>
                  <p className="prj-meta">
                    {project.advisorName
                      ? `Advisor ${project.advisorName}`
                      : "No advisor"}
                    {project.proposedByName &&
                      ` · proposed by ${project.proposedByName}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
