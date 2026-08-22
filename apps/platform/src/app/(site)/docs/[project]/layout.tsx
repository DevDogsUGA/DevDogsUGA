import DocsSidebar from "~/components/DocsSidebar";
import { getDocsProjects, getDocsTree } from "~/server/docs/queries";

export default async function DocsProjectLayout({
  children,
  params,
}: LayoutProps<"/docs/[project]">) {
  const { project } = await params;
  const projectSlug = decodeURIComponent(project);

  const projects = getDocsProjects();

  // Unknown project: let the page render its notFound without docs chrome.
  if (!projects.some((p) => p.slug === projectSlug)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-w-0 flex-1 items-start max-lg:flex-col">
      <DocsSidebar
        projects={projects.map(({ slug, name, description }) => ({
          slug,
          name,
          description,
        }))}
        project={projectSlug}
        tree={getDocsTree(projectSlug)}
      />
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        {children}
      </div>
    </div>
  );
}
