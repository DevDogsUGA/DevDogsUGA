import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon } from "@phosphor-icons/react/ssr";
import ConsolePageShell from "~/components/ConsolePageShell";
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
      {/* The same tile the app switcher uses for a project: a block-shadowed
          mark beside the name and a one-line blurb, on a flat tile that lifts
          on hover. The link stretches over the whole tile with its own
          ::after, so the tile is one control without nesting block content
          inside an anchor. */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <li
            key={project.slug}
            className="group relative flex items-center gap-4 rounded-md border border-mauve-700 bg-mauve-800 px-4 py-3 transition-colors hover:border-mauve-500 hover:bg-mauve-700"
          >
            <div className="shadow-block-sm flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-cyan-400 text-2xl text-black shadow-black transition-transform group-hover:-translate-y-0.5">
              <BookOpenIcon weight="bold" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <h3 className="font-display leading-none font-bold text-white">
                <Link
                  href={`/docs/${encodeURIComponent(project.slug)}`}
                  className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-white"
                >
                  {project.name}
                </Link>
              </h3>
              {project.description && (
                <p className="text-xs/relaxed text-balance text-mauve-400">
                  {project.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {projects.length === 0 && (
        <p className="text-sm text-mauve-400">
          No documentation has been published yet.
        </p>
      )}
    </ConsolePageShell>
  );
}
