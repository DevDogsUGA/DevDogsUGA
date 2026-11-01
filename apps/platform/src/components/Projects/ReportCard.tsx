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

const COMMIT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function day(value: string): string {
  return DAY.format(new Date(`${value}T00:00:00Z`));
}

/** The size of a commit as GitHub reports it, or nothing while it is still being counted. */
export function commitSize(commit: {
  files: number | null;
  additions: number | null;
  deletions: number | null;
}): string | null {
  if (commit.additions === null || commit.deletions === null) return null;
  const files =
    commit.files === null
      ? ""
      : `${commit.files} ${commit.files === 1 ? "file" : "files"}, `;
  return `${files}+${commit.additions} −${commit.deletions}`;
}

/** One EL report: range, hours, cited commits and the reflection, with the caller's own actions below. */
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
      {report.commits.length > 0 && (
        <ul className="prj-prs" aria-label="Commits cited">
          {report.commits.map((commit) => (
            <li key={commit.sha} className="prj-pr">
              <TextLink href={commit.url} target="_blank" rel="noreferrer">
                {commit.sha.slice(0, 7)}
              </TextLink>
              <span>{commit.title}</span>
              <span className="prj-meta">
                {COMMIT_DAY.format(commit.committedAt)}
                {commitSize(commit) ? ` · ${commitSize(commit)}` : ""}
              </span>
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
