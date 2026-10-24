import type { ReactNode } from "react";
import { formatHours } from "~/server/el/format";
import type { ProjectReportView } from "~/server/projects/load";
import { reflectionWordCount } from "~/server/reflections/policy";
import Badge from "~/ui/badge";
import { TextLink } from "~/ui/text-link";
import "./projects.css";

const STATUS: Record<
  ProjectReportView["status"],
  { label: string; variant: "default" | "success" | "warning" }
> = {
  submitted: { label: "Awaiting review", variant: "default" },
  approved: { label: "Approved", variant: "success" },
  returned: { label: "Returned", variant: "warning" },
};

const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function day(value: string): string {
  return DAY.format(new Date(`${value}T00:00:00Z`));
}

/** One project report: range, hours, evidence and the reflection, with the caller's own actions below. */
export default function ReportCard({
  report,
  showAuthor = false,
  children,
}: {
  report: ProjectReportView;
  /** Reviewers see who wrote it. */
  showAuthor?: boolean;
  children?: ReactNode;
}) {
  const status = STATUS[report.status];
  return (
    <li className="prj-item" data-testid="project-report">
      <div className="prj-head">
        <span className="prj-title">{report.projectName}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="prj-meta">
        {showAuthor && report.authorName ? `${report.authorName} · ` : ""}
        {day(report.startDate)} to {day(report.endDate)} ·{" "}
        {formatHours(report.hours)} h claimed
        {report.approvedHours !== null &&
          ` · ${formatHours(report.approvedHours)} h approved`}{" "}
        · {reflectionWordCount(report.content)} words
      </p>
      <p className="prj-text">{report.content}</p>
      {report.pullRequests.length > 0 && (
        <ul className="prj-prs" aria-label="Pull requests cited">
          {report.pullRequests.map((pr) => (
            <li key={pr.id} className="prj-pr">
              <TextLink href={pr.url} target="_blank" rel="noreferrer">
                {pr.repo}#{pr.number}
              </TextLink>
              <span>{pr.title}</span>
            </li>
          ))}
        </ul>
      )}
      {report.reviewNote && report.status === "returned" && (
        <p className="prj-note">
          <b>
            {report.reviewedByName ? `${report.reviewedByName} says` : "Note"}:
          </b>{" "}
          {report.reviewNote}
        </p>
      )}
      {children}
    </li>
  );
}
