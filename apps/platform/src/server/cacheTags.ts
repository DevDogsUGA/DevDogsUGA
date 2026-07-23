/**
 * Tag builders for docs cache invalidation, used by both cacheTag() and
 * revalidateTag() call sites. Tags are page-granular so a push only
 * re-renders the pages it touched.
 */

/**
 * The derived project list (immediate subfolders of docs/, with metadata from
 * each project's index page). Revalidated by any default-branch content change.
 */
export function docsProjectsTag() {
  return "docs:projects";
}

export function docsBranchesTag(repo: string) {
  return `docs:${repo}:branches`;
}

export function docsTreeTag(repo: string, branch: string) {
  return `docs:${repo}:${branch}:tree`;
}

export function docsPageTag(repo: string, branch: string, path: string) {
  return `docs:${repo}:${branch}:page:${path}`;
}
