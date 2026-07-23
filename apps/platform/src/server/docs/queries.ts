"use cache";

import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { buildDocsTree, type DocsTreeNode } from "~/lib/docsTree";
import type { DocHeading } from "~/lib/toc";
import {
  docsBranchesTag,
  docsPageTag,
  docsReposTag,
  docsTreeTag,
} from "~/server/cacheTags";
import { db } from "~/server/db";
import { docsBranches, docsPages, docsRepos } from "~/server/db/schema";

// Everything here is cached until the sync pipeline revalidates its tag —
// reads never race GitHub, only our own Postgres.

export async function getDocsRepos() {
  cacheTag(docsReposTag());
  cacheLife("max");

  return db
    .select({
      slug: docsRepos.slug,
      name: docsRepos.name,
      description: docsRepos.description,
      defaultBranch: docsRepos.defaultBranch,
    })
    .from(docsRepos)
    .orderBy(asc(docsRepos.sortOrder), asc(docsRepos.name));
}

export async function getDocsBranches(repoSlug: string) {
  cacheTag(docsBranchesTag(repoSlug));
  cacheLife("max");

  const repo = await db.query.docsRepos.findFirst({
    where: { slug: repoSlug },
    with: { branches: { columns: { name: true } } },
  });
  if (!repo) return null;

  return {
    defaultBranch: repo.defaultBranch,
    names: repo.branches.map((branch) => branch.name).sort(),
  };
}

export async function getDocsTree(
  repoSlug: string,
  branch: string,
): Promise<DocsTreeNode[]> {
  cacheTag(docsTreeTag(repoSlug, branch));
  cacheLife("max");

  const pages = await db
    .select({ path: docsPages.path, title: docsPages.title })
    .from(docsPages)
    .innerJoin(docsBranches, eq(docsPages.branchId, docsBranches.id))
    .innerJoin(docsRepos, eq(docsBranches.repoId, docsRepos.id))
    .where(and(eq(docsRepos.slug, repoSlug), eq(docsBranches.name, branch)));

  return buildDocsTree(pages);
}

export async function getDocsPage(
  repoSlug: string,
  branch: string,
  path: string,
) {
  cacheTag(docsPageTag(repoSlug, branch, path));
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
        eq(docsPages.path, path),
      ),
    )
    .limit(1);

  if (!page) return null;
  return { ...page, headings: page.headings as DocHeading[] };
}
