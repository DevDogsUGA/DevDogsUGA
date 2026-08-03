import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon } from "@phosphor-icons/react/ssr";
import { getDocsProjects } from "~/server/docs/queries";

export const metadata: Metadata = {
  title: "Docs | DevDogs",
  description: "Documentation for DevDogs projects.",
};

export default function DocsLandingPage() {
  const projects = getDocsProjects();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-white">
        Documentation
      </h1>
      <p className="mt-2 text-mauve-300">
        Guides and references for DevDogs projects, published straight from the
        monorepo.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.slug}
            href={`/docs/${encodeURIComponent(project.slug)}`}
            className="group flex flex-col gap-2 rounded-md border border-mauve-800 bg-mauve-900/50 p-5 transition-colors hover:border-mauve-600 hover:bg-mauve-900"
          >
            <span className="flex items-center gap-2 font-semibold text-white">
              <BookOpenIcon className="size-5 text-cyan-400" />
              {project.name}
            </span>
            {project.description && (
              <span className="text-sm text-mauve-300">
                {project.description}
              </span>
            )}
          </Link>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="mt-8 text-mauve-400">
          No documentation has been published yet.
        </p>
      )}
    </div>
  );
}
