import type { Metadata } from "next";
import Link from "next/link";
import DocsProjectMark from "~/components/DocsProjectMark";
import {
  CourseStatus,
  ContinueStrip,
  type HubCourse,
} from "~/components/DocsProgress/HubProgress";
import DocsTileGrid, { type DocsTile } from "~/components/DocsTileGrid";
import type { DocsMenuEntry } from "~/config/docs";
import { DOCS_BASE, docsHref } from "~/lib/docsSlug";
import type { DocsTreeNode } from "~/lib/docsTree";
import "~/components/Docs/docs.css";
import { getContributeMenu, getDocsMenu } from "~/server/docs/menu";
import { getDocsProjects, getDocsTree } from "~/server/docs/queries";

/**
 * The Docs half is built from `docs/` at build time, so it can't change until
 * the next deploy. The Contribute half is
 * read from the Projects (`getContributeMenu`), whose cache is tagged, so a
 * project's first publication or an edit to its name refreshes the page.
 */
export const revalidate = false;

export const metadata: Metadata = {
  title: "Docs | DevDogs",
  description: "Documentation for DevDogs projects.",
};

function tile(entry: DocsMenuEntry): DocsTile {
  return {
    href: entry.href,
    title: entry.name,
    description: entry.description,
    mark: <DocsProjectMark mark={entry.mark} size="lg" />,
  };
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
  const projects = getDocsProjects();
  const [docs, contribute] = await Promise.all([
    getDocsMenu(),
    getContributeMenu(),
  ]);
  const workshops = docs.filter((entry) => entry.project === "workshops");
  const courses =
    workshops.length > 0
      ? coursesIn("workshops", await getDocsTree("workshops"))
      : [];
  // Everything the Docs menu lists except the workshops, which have their own
  // group of courses above.
  const guides = docs.filter((entry) => entry.project !== "workshops");

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
                  mark: <DocsProjectMark mark={workshops[0]!.mark} size="lg" />,
                })),
                ...workshops.map((entry) => tile(entry)),
              ]}
            />
          </section>
        )}

        {guides.length > 0 && (
          <section className="docs-group" aria-labelledby="docs-h-docs">
            <h2 id="docs-h-docs">Tooling and guides</h2>
            <p>
              The shared tooling, how the club runs it, and the guides for
              building on DevDogs.
            </p>
            <DocsTileGrid tiles={guides.map((entry) => tile(entry))} />
          </section>
        )}

        {contribute.length > 0 && (
          <section className="docs-group" aria-labelledby="contribute">
            <h2 id="contribute">Contribute</h2>
            <p>
              How each club project runs, and how to contribute, written by the
              projects themselves. The code is public under BSD-3.
            </p>
            <DocsTileGrid tiles={contribute.map((entry) => tile(entry))} />
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
