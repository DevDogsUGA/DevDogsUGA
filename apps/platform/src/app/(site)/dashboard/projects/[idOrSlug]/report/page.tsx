import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import "~/components/Settings/settings.css";
import ReportForm from "~/components/Projects/ReportForm";
import { commitSize } from "~/components/Projects/ReportCard";
import { requireDashboard, rules } from "~/server/auth/access";
import {
  findProjectId,
  getEligibleCommits,
  getProjectDetail,
  getRelation,
  getReport,
} from "~/server/projects/load";
import { easternDay } from "~/server/projects/policy";
import { FILE_REFUSAL, fileVerdict } from "~/server/projects/records";
import { projectPath } from "~/server/projects/slug";
import { PageHeading } from "~/ui/app-shell";
import Callout from "~/ui/callout";

export const metadata: Metadata = {
  title: "Project report | DevDogs",
  robots: { index: false },
};

const COMMIT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

/** Write an EL report, or edit one that is not yet approved. */
export default async function ProjectReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ idOrSlug: string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  await connection();
  const caller = await requireDashboard();
  const { idOrSlug } = await params;
  const projectId = await findProjectId(idOrSlug);
  if (!projectId) notFound();
  const project = await getProjectDetail(projectId);
  if (!project) notFound();

  const relation = await getRelation(caller.userId, projectId);
  const verdict = fileVerdict({
    isOfficer: rules.officer(caller),
    isContributor: relation.isContributor,
    projectStatus: project.status,
  });

  const requested = (await searchParams).report;
  const existing =
    requested && z.string().uuid().safeParse(requested).success
      ? await getReport(requested)
      : null;
  const editing =
    existing?.authorId === caller.userId && existing.projectId === projectId
      ? existing
      : null;
  const locked = editing?.status === "approved";
  const path = projectPath(project);
  const commits =
    verdict === "yes" && !locked
      ? await getEligibleCommits(caller.userId, projectId, editing?.id ?? null)
      : [];

  return (
    <div className="settings-shell">
      <PageHeading
        crumbs={[
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: path },
          { label: editing ? "Edit report" : "File a report" },
        ]}
        title={editing ? "Edit your report" : "File a report"}
        description={`What you did on ${project.name}, for EL credit. Hours are your actual participation; the project's advisor or a report reviewer confirms them.`}
      />
      {verdict !== "yes" ? (
        <Callout tone="warning" title="You cannot file a report here">
          {FILE_REFUSAL[verdict]}
        </Callout>
      ) : locked ? (
        <Callout tone="success" title="Approved">
          This report is approved and can no longer be changed.
        </Callout>
      ) : (
        <ReportForm
          projectId={project.id}
          projectName={project.name}
          today={easternDay(new Date())}
          projectHref={path}
          values={{
            reportId: editing?.id ?? null,
            startDate: editing?.startDate ?? "",
            endDate: editing?.endDate ?? "",
            hours: editing ? String(editing.hours) : "",
            content: editing?.content ?? "",
          }}
          commits={commits.map((commit) => ({
            sha: commit.sha,
            title: commit.title,
            day: commit.day,
            detail: [COMMIT_DAY.format(commit.committedAt), commitSize(commit)]
              .filter(Boolean)
              .join(" · "),
            url: commit.url,
            repo: commit.repo,
            selected: commit.selected,
          }))}
        />
      )}
    </div>
  );
}
