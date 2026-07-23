import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import { env } from "~/env";
import { docsHref, projectPath, resolveDocsSlug } from "~/lib/docsSlug";
import { firstPagePath } from "~/lib/docsTree";
import {
  getDocsBranches,
  getDocsPage,
  getDocsProjects,
  getDocsTree,
} from "~/server/docs/queries";
import { toTitleCase } from "~/server/docs/parse";

interface Resolved {
  repoSlug: string;
  project: string;
  branch: string;
  path: string[];
}

/**
 * Resolves the catch-all slug to a branch + project-relative page path,
 * issuing canonical redirects along the way. Branch names may contain slashes,
 * so the branch is longest-prefix matched against the (monorepo-global) branch
 * list (see ~/lib/docsSlug).
 */
async function resolve(
  params: Promise<{ project: string; slug: string[] }>,
): Promise<Resolved> {
  const { project, slug } = await params;
  const projectSlug = decodeURIComponent(project);
  const segments = slug.map(decodeURIComponent);

  const branches = await getDocsBranches();
  if (!branches) notFound();

  const resolved = resolveDocsSlug(
    segments,
    branches.names,
    branches.defaultBranch,
  );

  // Canonicalize /docs/project/main/... to /docs/project/...
  if (resolved.redundantBranchPrefix) {
    redirect(
      docsHref(
        projectSlug,
        resolved.branch,
        resolved.path,
        branches.defaultBranch,
      ),
    );
  }

  // A branch root has no page: land on the project's first page for that branch.
  if (resolved.path.length === 0) {
    const tree = await getDocsTree(
      branches.repoSlug,
      projectSlug,
      resolved.branch,
    );
    const first = firstPagePath(tree);
    if (!first) notFound();
    redirect(
      docsHref(
        projectSlug,
        resolved.branch,
        first.split("/"),
        branches.defaultBranch,
      ),
    );
  }

  return {
    repoSlug: branches.repoSlug,
    project: projectSlug,
    branch: resolved.branch,
    path: resolved.path,
  };
}

export async function generateStaticParams() {
  const [projects, branches] = await Promise.all([
    getDocsProjects(),
    getDocsBranches(),
  ]);
  if (!branches) return [];

  const params: { project: string; slug: string[] }[] = [];
  for (const project of projects) {
    const tree = await getDocsTree(
      branches.repoSlug,
      project.slug,
      branches.defaultBranch,
    );
    const collect = (nodes: typeof tree) => {
      for (const node of nodes) {
        if (node.type === "page") {
          params.push({ project: project.slug, slug: node.path.split("/") });
        } else {
          collect(node.children);
        }
      }
    };
    collect(tree);
  }
  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[project]/[...slug]">): Promise<Metadata> {
  const { repoSlug, project, branch, path } = await resolve(params);
  const page = await getDocsPage(repoSlug, project, branch, path.join("/"));
  if (!page) return {};
  return {
    title: `${page.title} | DevDogs Docs`,
    description: page.description ?? undefined,
  };
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[project]/[...slug]">) {
  const { repoSlug, project, branch, path } = await resolve(params);

  const page = await getDocsPage(repoSlug, project, branch, path.join("/"));
  if (!page) notFound();

  const breadcrumbs = [
    toTitleCase(project),
    ...path.slice(0, -1).map(toTitleCase),
  ];
  const githubUrl = `https://github.com/${env.GITHUB_ORG}/${repoSlug}/blob/${branch}/docs/${projectPath(project, path.join("/"))}.md`;

  return (
    <DocPageContent
      source={page.content}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      githubUrl={githubUrl}
    />
  );
}
