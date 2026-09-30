import { DocsProjectIndex } from "~/components/DocsRoute";
import { getDocsProjects } from "~/server/docs/queries";

/**
 * Built from `docs/` at build time, so it can't change until the next
 * deploy, except for what a project schedules: the lookups under
 * `DocsProjectIndex` carry the time of the project's next reveal into this
 * page's cache lifetime (see `visibleView`).
 */
export const revalidate = false;

export function generateStaticParams() {
  return getDocsProjects().map((project) => ({ project: project.slug }));
}

export default async function DocsProjectPage({
  params,
}: PageProps<"/docs/[project]">) {
  const { project } = await params;
  return (
    <DocsProjectIndex project={decodeURIComponent(project)} mode="public" />
  );
}
