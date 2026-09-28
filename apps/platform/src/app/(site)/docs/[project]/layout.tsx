import DocsSidebar from "~/components/DocsSidebar";
import DocsVariants from "~/components/DocsVariants";
import {
  getDocsProjects,
  getDocsSidebarTree,
  getDocsVariantGroups,
} from "~/server/docs/queries";

export default async function DocsProjectLayout({
  children,
  params,
}: LayoutProps<"/docs/[project]">) {
  const { project } = await params;
  const projectSlug = decodeURIComponent(project);

  const projects = getDocsProjects();
  const current = projects.find((p) => p.slug === projectSlug);

  // Unknown project: let the page render its notFound without docs chrome.
  if (!current) {
    return <>{children}</>;
  }

  const groups = getDocsVariantGroups();

  return (
    <DocsVariants
      offered={{ os: current.os, supabase: groups.supabase.values }}
      className="flex min-w-0 flex-1 items-start max-lg:flex-col"
    >
      <DocsSidebar
        projects={projects.map(({ slug, name, description }) => ({
          slug,
          name,
          description,
        }))}
        project={projectSlug}
        platforms={current.os.map((value) => ({
          value,
          label: groups.os.labels[value] ?? value,
        }))}
        tree={getDocsSidebarTree(projectSlug)}
      />
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        {children}
      </div>
    </DocsVariants>
  );
}
