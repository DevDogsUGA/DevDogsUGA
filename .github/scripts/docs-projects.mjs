/**
 * The central map of project documentation, and the checks the docs candidate
 * workflow (`.github/workflows/docs-candidate.yaml`) runs before it fetches
 * anything.
 *
 * `.github/docs-projects.json` says which project repositories may publish
 * docs, from which branch and directory, and where on the website. It is
 * reviewed in a DevDogsUGA pull request like any other workflow change
 * (CODEOWNERS: `.github/**`); a project repository cannot edit it. A dispatch
 * (`{ project, sha }`) is only a request: the repository, branch, directory
 * and destination always come from this map.
 *
 * Usage (the workflow's first step):
 *   node docs-projects.mjs resolve
 * with PROJECT and SHA in the environment (from the dispatch) and GH_TOKEN set
 * to the read-only source token. It writes `repository`, `branch`, `directory`
 * and `destination` to GITHUB_OUTPUT, or exits 1 naming what is wrong.
 *
 *   node docs-projects.mjs validate
 * checks the map file alone; CI runs it through the node tests too.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

export const MAP_PATH = fileURLToPath(
  new URL("../docs-projects.json", import.meta.url),
);

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
/** A git branch name, deliberately narrower than git allows. */
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/;
/** A relative directory of plain segments. */
const DIRECTORY =
  /^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;
const KEYS = new Set([
  "slug",
  "repository",
  "branch",
  "directory",
  "destination",
]);
/** Slugs the club's own docs use; a project can't take over their routes. */
const RESERVED_SLUGS = new Set([
  "platform",
  "toolkit",
  "workshops",
  "schedule-builder",
  "operations",
  "_shared",
]);

/**
 * Everything wrong with a map, as human-readable lines; empty when it is valid.
 *
 * @param {unknown} data
 * @returns {string[]}
 */
export function validateMap(data) {
  /** @type {string[]} */
  const errors = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["the map must be a JSON object"];
  }
  const record = /** @type {Record<string, unknown>} */ (data);
  for (const key of Object.keys(record)) {
    if (!["version", "projects", "$comment"].includes(key)) {
      errors.push(`unknown top-level key "${key}"`);
    }
  }
  if (record.version !== 1) errors.push(`"version" must be 1`);
  const projects = record.projects;
  if (!Array.isArray(projects)) {
    errors.push(`"projects" must be an array`);
    return errors;
  }
  const slugs = new Set();
  const destinations = new Set();
  projects.forEach((entry, index) => {
    const at = `projects[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const e = /** @type {Record<string, unknown>} */ (entry);
    for (const key of Object.keys(e)) {
      if (!KEYS.has(key)) errors.push(`${at} has an unknown key "${key}"`);
    }
    for (const key of KEYS) {
      if (typeof e[key] !== "string") {
        errors.push(`${at}.${key} must be a string`);
      }
    }
    const { slug, repository, branch, directory, destination } =
      /** @type {Record<string, string>} */ (e);
    if (typeof slug === "string") {
      if (!SLUG.test(slug)) {
        errors.push(
          `${at}.slug "${slug}" must be lowercase letters, digits and hyphens`,
        );
      } else if (RESERVED_SLUGS.has(slug)) {
        errors.push(`${at}.slug "${slug}" is reserved for the club's own docs`);
      } else if (slugs.has(slug)) {
        errors.push(`${at}.slug "${slug}" appears twice`);
      }
      slugs.add(slug);
    }
    if (typeof repository === "string" && !REPOSITORY.test(repository)) {
      errors.push(`${at}.repository "${repository}" must look like Owner/name`);
    }
    if (
      typeof branch === "string" &&
      (!BRANCH.test(branch) ||
        branch.includes("..") ||
        branch.endsWith("/") ||
        branch.endsWith(".lock"))
    ) {
      errors.push(`${at}.branch "${branch}" isn't a plain branch name`);
    }
    if (
      typeof directory === "string" &&
      (!DIRECTORY.test(directory) ||
        directory.split("/").some((s) => s === "." || s === ".."))
    ) {
      errors.push(
        `${at}.directory "${directory}" must be a relative path of plain folders (no "..", no leading "/")`,
      );
    }
    if (typeof destination === "string") {
      if (typeof slug === "string" && destination !== `/docs/${slug}`) {
        errors.push(
          `${at}.destination must be "/docs/${slug}" (found "${destination}")`,
        );
      }
      if (destinations.has(destination))
        errors.push(`${at}.destination "${destination}" appears twice`);
      destinations.add(destination);
    }
  });
  return errors;
}

/**
 * A dispatch payload checked and normalized. `project` is a slug and `sha` a
 * full lowercase commit id; nothing else is accepted, so neither can carry
 * shell syntax or a ref name.
 *
 * @param {{ project?: unknown, sha?: unknown }} input
 * @returns {{ ok: true, project: string, sha: string } | { ok: false, errors: string[] }}
 */
export function validateDispatch(input) {
  /** @type {string[]} */
  const errors = [];
  const project =
    typeof input?.project === "string" ? input.project.trim() : "";
  const sha =
    typeof input?.sha === "string" ? input.sha.trim().toLowerCase() : "";
  if (!SLUG.test(project))
    errors.push(
      `project must be a project slug (lowercase letters, digits and hyphens); got ${JSON.stringify(input?.project)}`,
    );
  if (!SHA.test(sha))
    errors.push(
      `sha must be a full 40-character commit id; got ${JSON.stringify(input?.sha)}`,
    );
  return errors.length === 0
    ? { ok: true, project, sha }
    : { ok: false, errors };
}

/**
 * @param {{ projects: Array<Record<string, string>> }} map
 * @param {string} slug
 */
export function findProject(map, slug) {
  return map.projects.find((p) => p.slug === slug) ?? null;
}

/**
 * Whether `sha` is the tip of `branch` or an ancestor of it, by the compare
 * API (`branch...sha`: "identical" or "behind" mean the commit is already on
 * the branch; "ahead" and "diverged" mean it is not).
 *
 * @param {(path: string) => Promise<any>} api
 * @param {string} repository
 * @param {string} branch
 * @param {string} sha
 * @returns {Promise<{ ok: boolean, reason: string }>}
 */
export async function shaOnBranch(api, repository, branch, sha) {
  let comparison;
  try {
    comparison = await api(
      `/repos/${repository}/compare/${encodeURIComponent(branch)}...${sha}?per_page=1`,
    );
  } catch (error) {
    return {
      ok: false,
      reason: `couldn't compare ${sha} with ${repository}@${branch}: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
    };
  }
  if (comparison?.status === "identical" || comparison?.status === "behind") {
    return { ok: true, reason: `${sha} is on ${repository}@${branch}` };
  }
  return {
    ok: false,
    reason: `${sha} is not on ${repository}@${branch} (compare status: ${comparison?.status ?? "unknown"}); only commits merged to the mapped branch can be published`,
  };
}

/** Appends `key=value` lines to the file GitHub Actions reads step outputs from. */
function setOutputs(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value))
      throw new Error(`output ${key} contains a newline`);
    appendFileSync(file, `${key}=${value}\n`);
  }
}

async function main() {
  const [command] = process.argv.slice(2);
  const map = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
  const problems = validateMap(map);
  if (problems.length > 0) {
    console.error(
      `.github/docs-projects.json is invalid:\n- ${problems.join("\n- ")}`,
    );
    process.exit(1);
  }
  if (command === "validate") {
    console.log(`docs-projects.json: ${map.projects.length} project(s), valid`);
    return;
  }
  if (command !== "resolve") {
    console.error("usage: docs-projects.mjs resolve|validate");
    process.exit(1);
  }

  const dispatch = validateDispatch({
    project: process.env.PROJECT,
    sha: process.env.SHA,
  });
  if (!dispatch.ok) {
    console.error(dispatch.errors.join("\n"));
    process.exit(1);
  }
  const entry = findProject(map, dispatch.project);
  if (entry === null) {
    console.error(
      `"${dispatch.project}" is not in .github/docs-projects.json; a project is added there by a reviewed pull request to DevDogsUGA.`,
    );
    process.exit(1);
  }
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.error("GH_TOKEN (the read-only source token) is not set");
    process.exit(1);
  }
  const result = await shaOnBranch(
    createApi({ token }),
    entry.repository,
    entry.branch,
    dispatch.sha,
  );
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(result.reason);
  setOutputs({
    project: entry.slug,
    sha: dispatch.sha,
    repository: entry.repository,
    branch: entry.branch,
    directory: entry.directory,
    destination: entry.destination,
  });
}

if (isMain(import.meta.url)) await main();
