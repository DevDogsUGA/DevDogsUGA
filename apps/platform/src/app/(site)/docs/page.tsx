import type { Metadata } from "next";
import PageShell from "~/components/PageShell";
import DocsProjectMark from "~/components/DocsProjectMark";
import DocsTileGrid from "~/components/DocsTileGrid";
import { groupDocsProjects } from "~/config/docs";
import { getDocsProjects } from "~/server/docs/queries";

export const metadata: Metadata = {
  title: "Docs | DevDogs",
  description: "Documentation for DevDogs projects.",
};

export default function DocsLandingPage() {
  const projects = getDocsProjects();

  return (
    <PageShell
      accent="cyan"
      title="Documentation"
      description="Guides and references for DevDogs projects, published straight from the monorepo."
    >
      {/* Grouped for the same reason the navbar menu and the sidebar switcher
          are: one flat grid of six offers no order to read them in, and this
          is the page a newcomer lands on first. The headings come from the
          same config, so a project cannot sit under "Apps" here and somewhere
          else in the menu. */}
      <div className="flex flex-col gap-8">
        {groupDocsProjects(projects).map((group) => (
          <section key={group.id} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
              {group.label}
            </h2>
            <DocsTileGrid
              tiles={group.projects.map((project) => ({
                href: `/docs/${encodeURIComponent(project.slug)}`,
                title: project.name,
                description: project.description,
                mark: <DocsProjectMark slug={project.slug} size="lg" />,
              }))}
            />
          </section>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="text-sm text-mauve-400">
          No documentation has been published yet.
        </p>
      )}
    </PageShell>
  );
}
