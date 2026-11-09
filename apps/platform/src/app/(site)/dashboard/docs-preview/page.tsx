import PageShell from "~/classic/components/PageShell";
import DocsProjectMark from "~/classic/components/DocsProjectMark";
import DocsTileGrid from "~/classic/components/DocsTileGrid";
import { DOCS_PREVIEW_BASE } from "~/lib/docsSlug";
import { requireDocsPreview } from "~/server/docs/previewAccess";
import { listPreviewableProjects } from "~/server/docs/previewTarget";

/**
 * Every project with a repository to read, for the docs reviewers. A project's
 * owners and contributors reach their own project's preview from its page.
 */
export default async function DocsPreviewLandingPage() {
  await requireDocsPreview();
  const projects = await listPreviewableProjects();

  return (
    <PageShell
      accent="cyan"
      title="Docs preview"
      description="A project's docs as they are on its repository's default branch right now, before they are published."
    >
      <DocsTileGrid
        tiles={projects.map((project) => ({
          href: `${DOCS_PREVIEW_BASE}/${encodeURIComponent(project.slug)}`,
          title: project.name,
          mark: <DocsProjectMark slug={project.slug} size="sm" />,
        }))}
      />
    </PageShell>
  );
}
