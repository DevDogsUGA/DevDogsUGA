/**
 * URL scheme for docs pages. Documentation lives in this monorepo's `docs/`
 * folder, grouped by project: each immediate subfolder of `docs/` is one
 * project, and the first segment of a stored page path is its project
 * (`platform/guides/setup` → project "platform", page "guides/setup").
 *
 * The first URL segment after /docs is the project; everything after it is the
 * project-relative page path (/docs/platform/guides/setup). There is no branch
 * dimension — docs are built from the checked-out working tree, so a per-branch
 * preview is just a preview deployment of the whole site from that branch.
 */

/**
 * Builds a docs URL. `path` is project-relative — the segments below the
 * project folder, without the project itself.
 */
export function docsHref(project: string, path: string[]): string {
  return "/" + ["docs", project, ...path].map(encodeURIComponent).join("/");
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
