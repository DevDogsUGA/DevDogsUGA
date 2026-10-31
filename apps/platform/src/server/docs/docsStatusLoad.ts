import "server-only";
import { createDocsStore } from "./docsStore";
import { docsStatusOf, type DocsStatus } from "./docsStatus";
import { isBundledSlug } from "./previewTarget";

/** The status of one project's docs, from the database. */
export async function getDocsStatus(projectId: string): Promise<{
  status: DocsStatus;
  /** Whether the project has a slug that could carry docs of its own. */
  slug: string | null;
}> {
  const store = createDocsStore();
  const [loaded, proposal] = await Promise.all([
    store.loadProject(projectId),
    store.activeProposal(projectId),
  ]);
  if (!loaded) return { status: { kind: "off" }, slug: null };
  const { project } = loaded;
  return {
    slug: project.slug,
    status: docsStatusOf({
      bundled: project.slug !== null && isBundledSlug(project.slug),
      project,
      proposal,
    }),
  };
}
