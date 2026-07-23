"use cache";

import { and, eq, like } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { projectPath, splitProjectPath } from "~/lib/docsSlug";
import { buildDocsTree, type DocsTreeNode } from "~/lib/docsTree";
import type { DocHeading } from "~/lib/toc";
import {
  docsBranchesTag,
  docsPageTag,
  docsProjectsTag,
  docsTreeTag,
} from "~/server/cacheTags";
import { db } from "~/server/db";
import { docsBranches, docsPages, docsRepos } from "~/server/db/schema";
import { toTitleCase } from "./parse";

// Everything here is cached until the sync pipeline revalidates its tag —
// reads never race GitHub, only our own Postgres.
//
// Docs live in a single monorepo (one docsRepos row). Its `docs/` folder is
// grouped into projects: each immediate subfolder is a project, and a page's
// project is the first segment of its stored path. Branches (main, docs/*
// previews) are monorepo-global and shared across every project.

export interface DocsProject {
  slug: string;
  name: string;
  description: string | null;
}

/**
 * The projects shown on the docs landing page and the sidebar selector,
 * derived from the immediate subfolders of docs/ on the default branch. A
 * project's name/description come from its index page's frontmatter
 * (index.md or README.md), falling back to the title-cased folder name.
 */
export async function getDocsProjects(): Promise<DocsProject[]> {
  cacheTag(docsProjectsTag());
  cacheLife("max");

  const repo = await db.query.docsRepos.findFirst({
    orderBy: { sortOrder: "asc" },
  });
  if (!repo) return [];

  const pages = await db
    .select({
      path: docsPages.path,
      description: docsPages.description,
      frontmatter: docsPages.frontmatter,
    })
    .from(docsPages)
    .innerJoin(docsBranches, eq(docsPages.branchId, docsBranches.id))
    .where(
      and(
        eq(docsBranches.repoId, repo.id),
        eq(docsBranches.name, repo.defaultBranch),
      ),
    );

  const byProject = new Map<string, DocsProject>();
  for (const page of pages) {
    const { project, path } = splitProjectPath(page.path);
    if (!byProject.has(project)) {
      byProject.set(project, {
        slug: project,
        name: toTitleCase(project),
        description: null,
      });
    }

    // A project's index page seeds its display name + description.
    const base = (path.split("/").at(-1) ?? "").toLowerCase();
    if (path === "" || base === "index" || base === "readme") {
      const entry = byProject.get(project)!;
      const frontmatter = page.frontmatter as Record<string, unknown>;
      if (typeof frontmatter.name === "string") entry.name = frontmatter.name;
      if (page.description) entry.description = page.description;
    }
  }

  return [...byProject.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The monorepo's tracked branches (default + docs/* previews). */
export async function getDocsBranches() {
  cacheLife("max");

  const repo = await db.query.docsRepos.findFirst({
    orderBy: { sortOrder: "asc" },
    with: { branches: { columns: { name: true } } },
  });
  if (!repo) return null;

  cacheTag(docsBranchesTag(repo.slug));

  return {
    repoSlug: repo.slug,
    defaultBranch: repo.defaultBranch,
    names: repo.branches.map((branch) => branch.name).sort(),
  };
}

/**
 * The sidebar tree for one project on one branch. Pages are scoped to the
 * project's folder and returned with project-relative paths, so the tree and
 * the URLs it builds never carry the project prefix.
 */
export async function getDocsTree(
  repoSlug: string,
  project: string,
  branch: string,
): Promise<DocsTreeNode[]> {
  cacheTag(docsTreeTag(repoSlug, branch));
  cacheLife("max");

  const pages = await db
    .select({ path: docsPages.path, title: docsPages.title })
    .from(docsPages)
    .innerJoin(docsBranches, eq(docsPages.branchId, docsBranches.id))
    .innerJoin(docsRepos, eq(docsBranches.repoId, docsRepos.id))
    .where(
      and(
        eq(docsRepos.slug, repoSlug),
        eq(docsBranches.name, branch),
        like(docsPages.path, `${project}/%`),
      ),
    );

  return buildDocsTree(
    pages.map((page) => ({
      path: splitProjectPath(page.path).path,
      title: page.title,
    })),
  );
}

export async function getDocsPage(
  repoSlug: string,
  project: string,
  branch: string,
  path: string,
) {
  const fullPath = projectPath(project, path);
  cacheTag(docsPageTag(repoSlug, branch, fullPath));
  cacheLife("max");

  const [page] = await db
    .select({
      title: docsPages.title,
      description: docsPages.description,
      headings: docsPages.headings,
      content: docsPages.content,
    })
    .from(docsPages)
    .innerJoin(docsBranches, eq(docsPages.branchId, docsBranches.id))
    .innerJoin(docsRepos, eq(docsBranches.repoId, docsRepos.id))
    .where(
      and(
        eq(docsRepos.slug, repoSlug),
        eq(docsBranches.name, branch),
        eq(docsPages.path, fullPath),
      ),
    )
    .limit(1);

  if (!page) return null;
  return { ...page, headings: page.headings as DocHeading[] };
}
