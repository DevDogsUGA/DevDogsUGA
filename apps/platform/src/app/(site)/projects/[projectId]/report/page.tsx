import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import SettingsShell from "~/components/Settings/SettingsShell";
import ReportForm from "~/components/Projects/ReportForm";
import { formatEventDateTime } from "~/lib/eventTime";
import { requireSession } from "~/server/auth/require";
import {
  getEligiblePullRequests,
  getProject,
  getReport,
  isProjectMember,
} from "~/server/projects/load";
import { easternDay } from "~/server/projects/policy";
import { PageHeading } from "~/ui/app-shell";
import Callout from "~/ui/callout";

export const metadata: Metadata = {
  title: "Project report | DevDogs",
  robots: { index: false },
};

/** Write a project report, or edit one that was returned. */
export default async function ProjectReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  await connection();
  const userId = await requireSession();
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const project = await getProject(projectId);
  if (!project || !(await isProjectMember(projectId, userId))) notFound();

  const requested = (await searchParams).report;
  const existing =
    requested && z.string().uuid().safeParse(requested).success
      ? await getReport(requested)
      : null;
  const editing =
    existing?.authorId === userId && existing.projectId === projectId
      ? existing
      : null;
  const locked = editing?.status === "approved";
  const pullRequests = await getEligiblePullRequests(
    userId,
    project,
    editing?.id ?? null,
  );

  return (
    <SettingsShell current="/projects">
      <PageHeading
        crumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
        title={editing ? "Edit your report" : "Write a report"}
        description={`What you did on ${project.name}, for EL credit. Hours are your actual participation; the project's advisor or leadership confirms them.`}
      />
      {project.status !== "active" ? (
        <Callout tone="warning" title="This project is not active">
          Reports are taken only for active projects.
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
          values={{
            reportId: editing?.id ?? null,
            startDate: editing?.startDate ?? "",
            endDate: editing?.endDate ?? "",
            hours: editing ? String(editing.hours) : "",
            content: editing?.content ?? "",
          }}
          pullRequests={pullRequests.map((pr) => ({
            id: pr.id,
            repo: pr.repo,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            merged: formatEventDateTime(pr.mergedAt),
            selected: pr.selected,
          }))}
        />
      )}
    </SettingsShell>
  );
}
