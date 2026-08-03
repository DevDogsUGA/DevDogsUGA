import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import { DOCS_BRANCH, DOCS_REPO } from "~/config/docs";
import { env } from "~/env";
import { projectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
import type { DocsTreeNode } from "~/lib/docsTree";
import {
  getDocsPage,
  getDocsProjects,
  getDocsTree,
} from "~/server/docs/queries";

// Every docs page is enumerated below and prerendered at build time. Anything
// else renders on demand and 404s via notFound() — safe on Workers because the
// lookup reads a bundled constant, not the filesystem. (`dynamicParams` can't
// express that here: Cache Components rejects the route segment config.)
export function generateStaticParams() {
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
    collect(project.slug, getDocsTree(project.slug));
  }

  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[project]/[...slug]">): Promise<Metadata> {
  const { project, slug } = await params;
  const page = getDocsPage(
    decodeURIComponent(project),
    slug.map(decodeURIComponent).join("/"),
  );
  if (!page) return {};

  return {
    title: `${page.title} | DevDogs Docs`,
    description: page.description ?? undefined,
  };
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[project]/[...slug]">) {
  const { project, slug } = await params;
  const projectSlug = decodeURIComponent(project);
  const path = slug.map(decodeURIComponent);

  const page = getDocsPage(projectSlug, path.join("/"));
  if (!page) notFound();

  const breadcrumbs = [
    toTitleCase(projectSlug),
    ...path.slice(0, -1).map(toTitleCase),
  ];
  const githubUrl = `https://github.com/${env.GITHUB_ORG}/${DOCS_REPO}/blob/${DOCS_BRANCH}/docs/${projectPath(projectSlug, path.join("/"))}.md`;

  return (
    <DocPageContent
      source={page.content}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      githubUrl={githubUrl}
    />
  );
}
