import { DocsProjectIndex } from "~/components/DocsRoute";
import { getDocsProjects } from "~/server/docs/queries";

/** Built from `docs/` at build time, so it can't change until the next deploy. */
export const revalidate = false;

export function generateStaticParams() {
  return getDocsProjects().map((project) => ({ project: project.slug }));
}

export default async function DocsProjectPage({
  params,
}: PageProps<"/docs/[project]">) {
  const { project } = await params;
  return <DocsProjectIndex project={decodeURIComponent(project)} />;
}
