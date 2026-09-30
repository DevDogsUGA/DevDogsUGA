import { DocsProjectIndex } from "~/components/DocsRoute";

export default async function DocsPreviewProjectPage({
  params,
}: PageProps<"/preview/docs/[project]">) {
  const { project } = await params;
  return (
    <DocsProjectIndex project={decodeURIComponent(project)} mode="preview" />
  );
}
