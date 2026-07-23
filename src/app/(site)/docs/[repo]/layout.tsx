import DocsSidebar from "~/components/DocsSidebar";
import type { DocsTreeNode } from "~/lib/docsTree";
import {
  getDocsBranches,
  getDocsRepos,
  getDocsTree,
} from "~/server/docs/queries";

export default async function DocsRepoLayout({
  children,
  params,
}: LayoutProps<"/docs/[repo]">) {
  const { repo } = await params;
  const repoSlug = decodeURIComponent(repo);

  const [repos, branches] = await Promise.all([
    getDocsRepos(),
    getDocsBranches(repoSlug),
  ]);

  // Unknown repo: let the page render its notFound without docs chrome.
  if (!branches) return <>{children}</>;

  const treesByBranch: Record<string, DocsTreeNode[]> = Object.fromEntries(
    await Promise.all(
      branches.names.map(
        async (branch) => [branch, await getDocsTree(repoSlug, branch)] as const,
      ),
    ),
  );

  return (
    <div className="flex min-w-0 flex-1 items-start max-lg:flex-col">
      <DocsSidebar
        repos={repos.map(({ slug, name }) => ({ slug, name }))}
        repo={repoSlug}
        branches={branches.names}
        defaultBranch={branches.defaultBranch}
        treesByBranch={treesByBranch}
      />
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        {children}
      </div>
    </div>
  );
}
