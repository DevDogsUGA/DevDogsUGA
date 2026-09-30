import type { Metadata } from "next";
import { DocsPageRoute, docsPageMetadata } from "~/components/DocsRoute";

export async function generateMetadata({
  params,
}: PageProps<"/preview/docs/[project]/[...slug]">): Promise<Metadata> {
  const { project, slug } = await params;
  return docsPageMetadata({
    project: decodeURIComponent(project),
    slug: slug.map(decodeURIComponent),
    mode: "preview",
  });
}

export default async function DocsPreviewPage({
  params,
}: PageProps<"/preview/docs/[project]/[...slug]">) {
  const { project, slug } = await params;
  return (
    <DocsPageRoute
      project={decodeURIComponent(project)}
      slug={slug.map(decodeURIComponent)}
      mode="preview"
    />
  );
}
