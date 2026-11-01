import type { Metadata } from "next";
import { DocsPageRoute, docsPageMetadata } from "~/components/DocsRoute";
import { allFolders, type DocsTreeNode } from "~/lib/docsTree";
import { getDocsProjects, getDocsTree } from "~/server/docs/queries";

// Every docs page AND every folder is enumerated below and prerendered.
// Anything else, a path that does not exist, renders on demand and 404s via
// notFound(), which is safe on Workers because the lookup reads a bundled
// constant, not the filesystem.
/** Built from `docs/` at build time, so it can't change until the next deploy. */
export const revalidate = false;

export async function generateStaticParams() {
  const params: { project: string; slug: string[] }[] = [];

  function collect(project: string, nodes: DocsTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "page") {
        params.push({ project, slug: node.path.split("/") });
      } else {
        collect(project, node.children);
      }
    }
  }

  for (const project of getDocsProjects()) {
    const tree = await getDocsTree(project.slug);
    collect(project.slug, tree);
    // A folder is a destination of its own: the sidebar's section headings
    // link to one, and it answers with its index page or with its contents.
    for (const folder of allFolders(tree)) {
      params.push({ project: project.slug, slug: folder.path.split("/") });
    }
  }

  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[project]/[...slug]">): Promise<Metadata> {
  const { project, slug } = await params;
  return docsPageMetadata({
    project: decodeURIComponent(project),
    slug: slug.map(decodeURIComponent),
  });
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[project]/[...slug]">) {
  const { project, slug } = await params;
  return (
    <DocsPageRoute
      project={decodeURIComponent(project)}
      slug={slug.map(decodeURIComponent)}
    />
  );
}
