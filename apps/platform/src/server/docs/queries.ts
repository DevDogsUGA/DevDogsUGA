import {
  pages,
  projects,
  type DocsPage,
  type DocsProject,
} from "@devdogsuga/docs";
import { projectPath, splitProjectPath } from "~/lib/docsSlug";
import { buildDocsTree, type DocsTreeNode } from "~/lib/docsTree";
import type { DocHeading } from "~/lib/toc";

// Docs are parsed from the repo's `docs/` folder at build time by
// @devdogsuga/docs, so every read here is an in-memory lookup over a bundled
// constant — no database, no cache, and nothing to revalidate. `docs/` is
// grouped by project: each immediate subfolder is one project, and the first
// segment of a stored page path is its project.

export type { DocsProject };

const pagesByPath = new Map<string, DocsPage>(
  pages.map((page) => [page.path, page]),
);

/** The projects shown on the docs landing page and the sidebar selector. */
export function getDocsProjects(): DocsProject[] {
  return projects;
}

/**
 * The sidebar tree for one project. Pages are returned with project-relative
 * paths, so the tree and the URLs it builds never carry the project prefix.
 */
export function getDocsTree(project: string): DocsTreeNode[] {
  return buildDocsTree(
    pages
      .filter((page) => page.project === project)
      .map((page) => ({
        path: splitProjectPath(page.path).path,
        title: page.title,
      })),
  );
}

export interface DocsPageContent {
  title: string;
  description: string | null;
  headings: DocHeading[];
  content: string;
}

export function getDocsPage(
  project: string,
  path: string,
): DocsPageContent | null {
  const page = pagesByPath.get(projectPath(project, path));
  if (!page) return null;

  return {
    title: page.title,
    description: page.description,
    headings: page.headings,
    content: page.content,
  };
}
