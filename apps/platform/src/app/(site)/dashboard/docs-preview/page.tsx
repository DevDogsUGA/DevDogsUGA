import PageShell from "~/components/PageShell";
import DocsProjectMark from "~/components/DocsProjectMark";
import DocsTileGrid from "~/components/DocsTileGrid";
import { DOCS_PREVIEW_BASE } from "~/lib/docsSlug";
import { getVisibleDocsProjects } from "~/server/docs/queries";

/** Every project, as the preview sees it: with what is not live yet included. */
export default async function DocsPreviewLandingPage() {
  const projects = await getVisibleDocsProjects("preview");

  return (
    <PageShell
      accent="cyan"
      title="Docs preview"
      description="The docs as they will be, including pages scheduled for later. Anything not live yet is marked with the time it goes live, and returns a 404 on /docs until then."
    >
      <DocsTileGrid
        tiles={projects.map((project) => ({
          href: `${DOCS_PREVIEW_BASE}/${encodeURIComponent(project.slug)}`,
          title: project.name,
          description: project.description,
          mark: <DocsProjectMark slug={project.slug} size="sm" />,
        }))}
      />
    </PageShell>
  );
}
