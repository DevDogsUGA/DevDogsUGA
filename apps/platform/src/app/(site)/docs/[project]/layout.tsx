import DocsSidebar from "~/components/DocsSidebar";
import type { DocsTreeNode } from "~/lib/docsTree";
import {
  getDocsBranches,
  getDocsProjects,
  getDocsTree,
} from "~/server/docs/queries";

export default async function DocsProjectLayout({
  children,
  params,
}: LayoutProps<"/docs/[project]">) {
  const { project } = await params;
  const projectSlug = decodeURIComponent(project);

  const [projects, branches] = await Promise.all([
    getDocsProjects(),
    getDocsBranches(),
  ]);

  // Unknown project (or no docs at all): let the page render its notFound
  // without docs chrome.
  if (!branches || !projects.some((p) => p.slug === projectSlug)) {
    return <>{children}</>;
  }

  const treesByBranch: Record<string, DocsTreeNode[]> = Object.fromEntries(
    await Promise.all(
      branches.names.map(
        async (branch) =>
          [
            branch,
            await getDocsTree(branches.repoSlug, projectSlug, branch),
          ] as const,
      ),
    ),
  );

  return (
    <div className="flex min-w-0 flex-1 items-start max-lg:flex-col">
      <DocsSidebar
        projects={projects.map(({ slug, name }) => ({ slug, name }))}
        project={projectSlug}
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
