import type { Metadata } from "next";
import ConsolePageShell from "~/components/ConsolePageShell";
import DocsProjectMark from "~/components/DocsProjectMark";
import DocsTileGrid from "~/components/DocsTileGrid";
import { getDocsProjects } from "~/server/docs/queries";

export const metadata: Metadata = {
  title: "Docs | DevDogs",
  description: "Documentation for DevDogs projects.",
};

export default function DocsLandingPage() {
  const projects = getDocsProjects();

  return (
    <ConsolePageShell
      accent="cyan"
      title="Documentation"
      description="Guides and references for DevDogs projects, published straight from the monorepo."
    >
      <DocsTileGrid
        tiles={projects.map((project) => ({
          href: `/docs/${encodeURIComponent(project.slug)}`,
          title: project.name,
          description: project.description,
          mark: <DocsProjectMark slug={project.slug} size="lg" />,
        }))}
      />

      {projects.length === 0 && (
        <p className="text-sm text-mauve-400">
          No documentation has been published yet.
        </p>
      )}
    </ConsolePageShell>
  );
}
