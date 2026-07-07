/**
 * Tag builders for docs cache invalidation, used by both cacheTag() and
 * revalidateTag() call sites. Tags are page-granular so a push only
 * re-renders the pages it touched.
 */

export function docsReposTag() {
  return "docs:repos";
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
