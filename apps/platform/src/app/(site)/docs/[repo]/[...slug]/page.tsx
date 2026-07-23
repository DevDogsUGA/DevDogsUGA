import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import { env } from "~/env";
import { docsHref, resolveDocsSlug } from "~/lib/docsSlug";
import { firstPagePath } from "~/lib/docsTree";
import {
  getDocsBranches,
  getDocsPage,
  getDocsRepos,
  getDocsTree,
} from "~/server/docs/queries";
import { toTitleCase } from "~/server/docs/parse";

interface Resolved {
  repoSlug: string;
  branch: string;
  path: string[];
}

/**
 * Resolves the catch-all slug to a branch + page path, issuing canonical
 * redirects along the way. Branch names may contain slashes, so the branch is
 * longest-prefix matched against the branch list (see ~/lib/docsSlug).
 */
async function resolve(
  params: Promise<{ repo: string; slug: string[] }>,
): Promise<Resolved> {
  const { repo, slug } = await params;
  const repoSlug = decodeURIComponent(repo);
  const segments = slug.map(decodeURIComponent);

  const branches = await getDocsBranches(repoSlug);
  if (!branches) notFound();

  const resolved = resolveDocsSlug(
    segments,
    branches.names,
    branches.defaultBranch,
  );

  // Canonicalize /docs/repo/main/... to /docs/repo/...
  if (resolved.redundantBranchPrefix) {
    redirect(
      docsHref(
        repoSlug,
        resolved.branch,
        resolved.path,
        branches.defaultBranch,
      ),
    );
  }

  // A branch root has no page: land on the branch's first page.
  if (resolved.path.length === 0) {
    const tree = await getDocsTree(repoSlug, resolved.branch);
    const first = firstPagePath(tree);
    if (!first) notFound();
    redirect(
      docsHref(
        repoSlug,
        resolved.branch,
        first.split("/"),
        branches.defaultBranch,
      ),
    );
  }

  return { repoSlug, branch: resolved.branch, path: resolved.path };
}

export async function generateStaticParams() {
  const repos = await getDocsRepos();

  const params: { repo: string; slug: string[] }[] = [];
  for (const repo of repos) {
    const tree = await getDocsTree(repo.slug, repo.defaultBranch);
    const collect = (nodes: typeof tree) => {
      for (const node of nodes) {
        if (node.type === "page") {
          params.push({ repo: repo.slug, slug: node.path.split("/") });
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
}: PageProps<"/docs/[repo]/[...slug]">): Promise<Metadata> {
  const { repoSlug, branch, path } = await resolve(params);
  const page = await getDocsPage(repoSlug, branch, path.join("/"));
  if (!page) return {};
  return {
    title: `${page.title} | DevDogs Docs`,
    description: page.description ?? undefined,
  };
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[repo]/[...slug]">) {
  const { repoSlug, branch, path } = await resolve(params);

  const page = await getDocsPage(repoSlug, branch, path.join("/"));
  if (!page) notFound();

  const breadcrumbs = [
    toTitleCase(repoSlug),
    ...path.slice(0, -1).map(toTitleCase),
  ];
  const githubUrl = `https://github.com/${env.GITHUB_ORG}/${repoSlug}/blob/${branch}/docs/${path.join("/")}.md`;

  return (
    <DocPageContent
      source={page.content}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      githubUrl={githubUrl}
    />
  );
}
