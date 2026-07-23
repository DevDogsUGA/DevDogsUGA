/**
 * URL scheme for docs pages. The default branch is canonical and omits its
 * branch segment (/docs/Repo/guides/setup); any other branch is embedded
 * GitHub-style, even when its name contains slashes
 * (/docs/Repo/docs/preview-x/guides/setup for branch "docs/preview-x").
 *
 * Resolution longest-prefix matches the joined slug against the known branch
 * list. Branch matching runs first and wins, so a tracked branch name shadows
 * an identically-named default-branch path — with the docs/* branch naming
 * convention this needs a top-level docs/docs/ folder to ever collide.
 */

export interface ResolvedDocsSlug {
  branch: string;
  path: string[];
  /** True when the URL spelled out the default branch and should be canonicalized. */
  redundantBranchPrefix: boolean;
}

export function resolveDocsSlug(
  slug: string[],
  branches: string[],
  defaultBranch: string,
): ResolvedDocsSlug {
  const joined = slug.join("/");

  const candidates = [...branches].sort((a, b) => b.length - a.length);
  for (const branch of candidates) {
    if (joined === branch || joined.startsWith(branch + "/")) {
      return {
        branch,
        path:
          joined === branch
            ? []
            : joined.slice(branch.length + 1).split("/"),
        redundantBranchPrefix: branch === defaultBranch,
      };
    }
  }

  return { branch: defaultBranch, path: slug, redundantBranchPrefix: false };
}

export function docsHref(
  repo: string,
  branch: string,
  path: string[],
  defaultBranch: string,
): string {
  const branchSegments = branch === defaultBranch ? [] : branch.split("/");
  return (
    "/" +
    ["docs", repo, ...branchSegments, ...path]
      .map(encodeURIComponent)
      .join("/")
  );
}
