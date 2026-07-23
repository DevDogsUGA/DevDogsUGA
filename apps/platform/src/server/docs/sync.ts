import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "~/server/db";
import { docsBranches, docsPages } from "~/server/db/schema";
import {
  docsBranchesTag,
  docsPageTag,
  docsProjectsTag,
  docsTreeTag,
} from "../cacheTags";
import { getBlob, getBranchHead, getDocsTree } from "./github";
import { parseDocFile } from "./parse";

const BLOB_CONCURRENCY = 8;

/**
 * Which branches get ingested: the repo's default branch, plus any branch
 * opting in via the docs/* naming convention (documentation previews).
 */
export function isTrackedBranch(branch: string, defaultBranch: string) {
  return branch === defaultBranch || branch.startsWith("docs/");
}

export interface SyncResult {
  status: "synced" | "unchanged" | "unknown-repo" | "missing-branch";
  added?: number;
  updated?: number;
  removed?: number;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

/**
 * Incrementally syncs one branch's docs/ content into Postgres. Pages are
 * diffed by git blob sha, so only files that actually changed are fetched,
 * parsed, and revalidated — a push touching one page re-renders one page.
 */
export async function syncBranch(
  repoSlug: string,
  branchName: string,
): Promise<SyncResult> {
  const repo = await db.query.docsRepos.findFirst({
    where: { slug: repoSlug },
  });
  if (!repo) return { status: "unknown-repo" };

  const head = await getBranchHead(repoSlug, branchName);
  if (!head) return { status: "missing-branch" };

  const existingBranch = await db.query.docsBranches.findFirst({
    where: { repoId: repo.id, name: branchName },
  });
  if (existingBranch?.lastSyncedCommit === head) {
    return { status: "unchanged" };
  }

  const tree = await getDocsTree(repoSlug, head);
  const treeByPath = new Map(
    tree.map((entry) => [entry.path.replace(/\.md$/, ""), entry]),
  );

  const existingPages = existingBranch
    ? await db
        .select({
          path: docsPages.path,
          blobSha: docsPages.blobSha,
          title: docsPages.title,
        })
        .from(docsPages)
        .where(eq(docsPages.branchId, existingBranch.id))
    : [];
  const existingByPath = new Map(existingPages.map((p) => [p.path, p]));

  const stale = [...treeByPath.entries()].filter(
    ([path, entry]) => existingByPath.get(path)?.blobSha !== entry.blobSha,
  );
  const removedPaths = existingPages
    .map((p) => p.path)
    .filter((path) => !treeByPath.has(path));

  const parsed = await mapWithConcurrency(
    stale,
    BLOB_CONCURRENCY,
    async ([path, entry]) => ({
      path,
      blobSha: entry.blobSha,
      ...parseDocFile(
        await getBlob(repoSlug, entry.blobSha),
        path.split("/").at(-1)!,
      ),
    }),
  );

  await db.transaction(async (tx) => {
    const [branch] = await tx
      .insert(docsBranches)
      .values({
        repoId: repo.id,
        name: branchName,
        lastSyncedCommit: head,
        lastSyncedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [docsBranches.repoId, docsBranches.name],
        set: {
          lastSyncedCommit: head,
          lastSyncedAt: sql`now()`,
        },
      })
      .returning({ id: docsBranches.id });

    if (parsed.length > 0) {
      await tx
        .insert(docsPages)
        .values(
          parsed.map((page) => ({
            branchId: branch!.id,
            path: page.path,
            blobSha: page.blobSha,
            title: page.title,
            description: page.description,
            frontmatter: page.frontmatter,
            headings: page.headings,
            content: page.content,
            plainText: page.plainText,
          })),
        )
        .onConflictDoUpdate({
          target: [docsPages.branchId, docsPages.path],
          set: {
            blobSha: sql`excluded."blobSha"`,
            title: sql`excluded."title"`,
            description: sql`excluded."description"`,
            frontmatter: sql`excluded."frontmatter"`,
            headings: sql`excluded."headings"`,
            content: sql`excluded."content"`,
            plainText: sql`excluded."plainText"`,
            updatedAt: sql`now()`,
          },
        });
    }

    if (removedPaths.length > 0) {
      await tx
        .delete(docsPages)
        .where(
          and(
            eq(docsPages.branchId, branch!.id),
            inArray(docsPages.path, removedPaths),
          ),
        );
    }
  });

  // Targeted invalidation: each touched page, plus the tree only when the
  // sidebar could differ (page set or a title changed), plus the branch list
  // only when this branch is new.
  for (const page of parsed) {
    revalidateTag(docsPageTag(repoSlug, branchName, page.path), "max");
  }
  for (const path of removedPaths) {
    revalidateTag(docsPageTag(repoSlug, branchName, path), "max");
  }

  const structureChanged =
    removedPaths.length > 0 ||
    parsed.some((page) => existingByPath.get(page.path)?.title !== page.title);
  if (structureChanged) {
    revalidateTag(docsTreeTag(repoSlug, branchName), "max");
  }
  if (!existingBranch) {
    revalidateTag(docsBranchesTag(repoSlug), "max");
  }
  // Projects (and their index-page metadata) are derived from the default
  // branch, so any change there can add/remove a project or restyle its card.
  if (
    branchName === repo.defaultBranch &&
    (parsed.length > 0 || removedPaths.length > 0)
  ) {
    revalidateTag(docsProjectsTag(), "max");
  }

  return {
    status: "synced",
    added: parsed.filter((p) => !existingByPath.has(p.path)).length,
    updated: parsed.filter((p) => existingByPath.has(p.path)).length,
    removed: removedPaths.length,
  };
}

/** Drops a branch (and, via cascade, its pages) after it's deleted on GitHub. */
export async function removeBranch(repoSlug: string, branchName: string) {
  const repo = await db.query.docsRepos.findFirst({
    where: { slug: repoSlug },
  });
  if (!repo) return { status: "unknown-repo" as const };

  const branch = await db.query.docsBranches.findFirst({
    where: { repoId: repo.id, name: branchName },
  });
  if (!branch) return { status: "missing-branch" as const };

  const pages = await db
    .select({ path: docsPages.path })
    .from(docsPages)
    .where(eq(docsPages.branchId, branch.id));

  await db.delete(docsBranches).where(eq(docsBranches.id, branch.id));

  for (const page of pages) {
    revalidateTag(docsPageTag(repoSlug, branchName, page.path), "max");
  }
  revalidateTag(docsTreeTag(repoSlug, branchName), "max");
  revalidateTag(docsBranchesTag(repoSlug), "max");

  return { status: "removed" as const };
}
