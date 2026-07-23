/**
 * URL scheme for docs pages. Documentation lives in a single monorepo whose
 * `docs/` folder groups content by project: each immediate subfolder of
 * `docs/` is one project, and the first segment of a stored page path is its
 * project (`platform/guides/setup` → project "platform", page "guides/setup").
 *
 * The first URL segment after /docs is the project. The default branch is
 * canonical and omits its branch segment (/docs/platform/guides/setup); any
 * other branch is embedded GitHub-style, even when its name contains slashes
 * (/docs/platform/docs/preview-x/guides/setup for branch "docs/preview-x").
 *
 * Branch resolution runs on the slug *after* the project segment and
 * longest-prefix matches against the (monorepo-global) branch list. Branch
 * matching wins over a page path, so with the docs/* branch naming convention
 * a collision would need a project whose own tree contains a docs/docs/ folder.
 */

export interface ResolvedDocsSlug {
  branch: string;
  /** Project-relative page path segments (the project is the URL segment before this slug). */
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

/**
 * Builds a canonical docs URL. `path` is project-relative — the segments below
 * the project folder, without the project itself.
 */
export function docsHref(
  project: string,
  branch: string,
  path: string[],
  defaultBranch: string,
): string {
  const branchSegments = branch === defaultBranch ? [] : branch.split("/");
  return (
    "/" +
    ["docs", project, ...branchSegments, ...path]
      .map(encodeURIComponent)
      .join("/")
  );
}

/**
 * Splits a stored page path (relative to `docs/`) into its project segment and
 * the project-relative page path. `platform/guides/setup` →
 * `{ project: "platform", path: "guides/setup" }`; a top-level file with no
 * folder → `{ project: <name>, path: "" }`.
 */
export function splitProjectPath(fullPath: string): {
  project: string;
  path: string;
} {
  const slash = fullPath.indexOf("/");
  if (slash === -1) return { project: fullPath, path: "" };
  return { project: fullPath.slice(0, slash), path: fullPath.slice(slash + 1) };
}

/** Rejoins a project + project-relative path into the stored `docs/`-relative path. */
export function projectPath(project: string, path: string): string {
  return path ? `${project}/${path}` : project;
}
