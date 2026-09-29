import type { Metadata } from "next";
import PageShell from "~/components/PageShell";
import DocsProjectMark from "~/components/DocsProjectMark";
import DocsTileGrid, { type DocsTile } from "~/components/DocsTileGrid";
import {
  DOCS_LANDING_LARGE,
  DOCS_LANDING_SMALL,
  DOCS_LANDING_WORKSHOPS,
} from "~/config/docs";
import { formatEventShortDate } from "~/lib/eventTime";
import {
  getDocsUpcoming,
  getVisibleDocsProjects,
  type DocsProject,
} from "~/server/docs/queries";

/**
 * Built from `docs/` at build time, so it can't change until the next
 * deploy, apart from what is scheduled: `getDocsUpcoming` and
 * `getVisibleDocsProjects` carry the next reveal into this page's cache
 * lifetime, so it refreshes when something goes live.
 */
export const revalidate = false;

export const metadata: Metadata = {
  title: "Docs | DevDogs",
  description: "Documentation for DevDogs projects.",
};

function tile(project: DocsProject, size: "sm" | "lg"): DocsTile {
  return {
    href: `/docs/${encodeURIComponent(project.slug)}`,
    title: project.name,
    description: project.description,
    mark: <DocsProjectMark slug={project.slug} size={size} />,
  };
}

/** `slugs` in listing order, keeping only the projects that actually exist —
 * a slug named here with no matching `docs/<slug>/index.md` drops silently
 * rather than throwing: documenting a project must never break this page. */
function projectsFor(
  projects: DocsProject[],
  slugs: readonly string[],
): DocsProject[] {
  return slugs
    .map((slug) => projects.find((project) => project.slug === slug))
    .filter((project): project is DocsProject => project != null);
}

export default async function DocsLandingPage() {
  const projects = await getVisibleDocsProjects();
  const upcoming = [...(await getDocsUpcoming()).values()]
    .flat()
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const large = projectsFor(projects, DOCS_LANDING_LARGE);
  const small = projectsFor(projects, DOCS_LANDING_SMALL);
  const workshops = projectsFor(projects, DOCS_LANDING_WORKSHOPS);

  return (
    <PageShell
      accent="cyan"
      title="Documentation"
      description="Guides and references for DevDogs projects, published straight from the monorepo."
    >
      <div className="flex flex-col gap-8">
        {/* The front door: which competition team a new contributor is
            actually choosing between. Large marks, because this is the one
            place in the docs a reader is picking a destination rather than
            looking something up. */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
            Which team are you on?
          </h2>
          <DocsTileGrid tiles={large.map((project) => tile(project, "lg"))} />
          <p className="text-sm text-mauve-400">
            Not on a team yet?{" "}
            <a
              href="/discord"
              className="font-medium text-mauve-200 underline-offset-4 hover:text-white hover:underline"
            >
              Ask in Discord
            </a>
            .
          </p>
        </section>

        {workshops.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
              Missed a workshop?
            </h2>
            <DocsTileGrid
              tiles={workshops.map((project) => tile(project, "sm"))}
            />
          </section>
        )}

        {/* Everyone touches these two regardless of team, so they stay one
            tap away without competing with the choice above. */}
        {small.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
              Repo-wide
            </h2>
            <DocsTileGrid tiles={small.map((project) => tile(project, "sm"))} />
          </section>
        )}
      </div>

      {/* Named, dated, and not linked: there is nothing to open yet. */}
      {upcoming.length > 0 && (
        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-mauve-400 uppercase">
            Coming soon
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-mauve-300">
            {upcoming.map((item) => (
              <li key={`${item.name}:${item.publishAt}`}>
                {item.name}: {formatEventShortDate(item.publishAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length === 0 && (
        <p className="text-sm text-mauve-400">
          No documentation has been published yet.
        </p>
      )}
    </PageShell>
  );
}
