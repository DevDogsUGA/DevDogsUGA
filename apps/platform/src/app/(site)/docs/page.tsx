import type { Metadata } from "next";
import Link from "next/link";
import DocsProjectMark from "~/components/DocsProjectMark";
import {
  CourseStatus,
  ContinueStrip,
  type HubCourse,
} from "~/components/DocsProgress/HubProgress";
import DocsTileGrid, { type DocsTile } from "~/components/DocsTileGrid";
import {
  DOCS_LANDING_LARGE,
  DOCS_LANDING_SMALL,
  DOCS_LANDING_WORKSHOPS,
} from "~/config/docs";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import type { DocsTreeNode } from "~/lib/docsTree";
import { formatEventShortDate } from "~/lib/eventTime";
import "~/components/Docs/docs.css";
import {
  getDocsUpcoming,
  getDocsTree,
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

function tile(project: DocsProject): DocsTile {
  return {
    href: `/docs/${encodeURIComponent(project.slug)}`,
    title: project.name,
    description: project.description,
    mark: <DocsProjectMark slug={project.slug} size="lg" />,
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

/** Every `steps: true` folder under a project, as a course. A course's steps are its direct pages. */
function coursesIn(
  project: string,
  nodes: DocsTreeNode[],
  trail: string[] = [],
): HubCourse[] {
  return nodes.flatMap((node): HubCourse[] => {
    if (node.type !== "folder") return [];
    if (!node.steps)
      return coursesIn(project, node.children, [...trail, node.name]);
    const steps = node.children.flatMap((child) =>
      child.type === "page"
        ? [
            {
              path: child.path,
              title: child.title,
              href: docsHref(project, child.path.split("/"), DOCS_BASE),
            },
          ]
        : [],
    );
    if (steps.length === 0) return [];
    return [
      {
        project,
        name: [...trail.slice(-1), node.name].join(" · "),
        href: docsHref(project, node.path.split("/"), DOCS_BASE),
        steps,
      },
    ];
  });
}

export default async function DocsLandingPage() {
  const projects = await getVisibleDocsProjects();
  const upcoming = [...(await getDocsUpcoming()).values()]
    .flat()
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const workshops = projectsFor(projects, DOCS_LANDING_WORKSHOPS);
  const courses = (
    await Promise.all(
      workshops.map(async (project) =>
        coursesIn(project.slug, await getDocsTree(project.slug)),
      ),
    )
  ).flat();
  const projectRows = [
    ...projectsFor(projects, DOCS_LANDING_LARGE),
    ...projectsFor(projects, DOCS_LANDING_SMALL),
  ];

  return (
    <div className="wrap">
      <div className="docs-hub">
        <h1>Docs</h1>
        <p className="docs-hub-lead">
          Follow a workshop course one step at a time, or read how a DevDogs
          project works. Everything here is free and open source.
        </p>

        <ContinueStrip courses={courses} />

        {(courses.length > 0 || workshops.length > 0) && (
          <section className="docs-group" aria-labelledby="docs-h-courses">
            <h2 id="docs-h-courses">Workshop courses</h2>
            <p>
              Step-by-step courses from our workshops. A new step opens after
              each workshop.
            </p>
            <DocsTileGrid
              tiles={[
                ...courses.map((course): DocsTile => ({
                  href: course.href,
                  title: course.name,
                  description: `${course.steps.length} steps`,
                  status: <CourseStatus course={course} />,
                  mark: <DocsProjectMark slug={course.project} size="lg" />,
                })),
                ...workshops.map((project) => tile(project)),
              ]}
            />
          </section>
        )}

        {projectRows.length > 0 && (
          <section className="docs-group" aria-labelledby="docs-h-projects">
            <h2 id="docs-h-projects">Projects</h2>
            <p>
              How each club project runs, and how to contribute. The code is
              public under BSD-3.
            </p>
            <DocsTileGrid tiles={projectRows.map((project) => tile(project))} />
          </section>
        )}

        {/* Named, dated, and not linked: there is nothing to open yet. */}
        {upcoming.length > 0 && (
          <section className="docs-group" aria-labelledby="docs-h-soon">
            <h2 id="docs-h-soon">Coming soon</h2>
            <ul className="muted small">
              {upcoming.map((item) => (
                <li key={`${item.name}:${item.publishAt}`}>
                  {item.name}: {formatEventShortDate(item.publishAt)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {projects.length === 0 && (
          <p className="docs-hubfoot">
            No documentation has been published yet.
          </p>
        )}

        <p className="docs-hubfoot">
          Stuck? Ask in{" "}
          <a className="textlink" href="/discord">
            Discord
          </a>
          . Want to register an app that signs in with DevDogs? See{" "}
          <Link className="textlink" href="/dashboard/oauth">
            OAuth apps
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
