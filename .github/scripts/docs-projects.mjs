/**
 * The central map of project documentation, and the checks the docs candidate
 * workflow (`.github/workflows/docs-candidate.yaml`) runs before it fetches or
 * publishes anything.
 *
 * `.github/docs-projects.json` says which projects publish docs. It is version
 * 2, keyed by the project's permanent slug:
 *
 *   { "version": 2,
 *     "projects": {
 *       "example": { "githubRepoId": "123", "ownerId": "456", "ownerLogin": "someone" }
 *     } }
 *
 * - `githubRepoId` is the repository's numeric GitHub id, a decimal string.
 *   The name is never stored: a repository is found by id, so a rename or a
 *   transfer cannot point a slug at somebody else's repository.
 * - `ownerId` and `ownerLogin` are the repository owner an officer confirmed.
 *   A repository whose current owner differs is paused: nothing is built and
 *   nothing is published until an officer confirms the new owner in the
 *   dashboard, which opens a pull request that updates these two fields.
 *
 * The branch is always the repository's default branch and the directory is
 * always `docs/`; neither is configurable. The map is reviewed in a DevDogsUGA
 * pull request like any other workflow change (CODEOWNERS: `.github/**`), and
 * a project repository cannot edit it. A dispatch (`{ project, sha }`) is only
 * a request: the repository, branch and destination always come from the map
 * and from GitHub.
 *
 * The platform keeps a TypeScript copy of this validation to write the map
 * (`apps/platform/src/server/docs/projectMap.ts`); its test runs this file's
 * `validateMap` over everything the platform writes.
 *
 * Usage:
 *   node docs-projects.mjs resolve
 * The candidate job's first step. PROJECT and SHA come from the dispatch and
 * GH_TOKEN is the read-only source token. It looks the repository up by id,
 * refuses a paused or private one, checks the commit is on the default branch,
 * and writes `repository`, `branch`, `directory` and `destination` to
 * GITHUB_OUTPUT, or exits 1 naming what is wrong.
 *
 *   node docs-projects.mjs recheck
 * The publish job, after its environment approval and just before it uploads.
 * It reads the map as it is on `main` now (a candidate can wait days for
 * approval, and docs may have been disabled or paused since) and runs the same
 * repository checks again with the job's own GITHUB_TOKEN as GH_TOKEN. The
 * publish job has no source token, and only public repositories publish.
 *
 *   node docs-projects.mjs validate
 * checks the map file alone; CI runs it through the node tests too.
 *
 * `--map <file>` reads the map from a file other than the committed one, and
 * `GITHUB_API_URL` (set by Actions) names the API, so the tests can run the
 * script against fixtures and a local server.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

export const MAP_PATH = fileURLToPath(
  new URL("../docs-projects.json", import.meta.url),
);

export const MAP_VERSION = 2;
/** Every project publishes from this folder of its repository. */
export const DOCS_DIRECTORY = "docs";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SHA = /^[0-9a-f]{40}$/;
/** A GitHub numeric id: a positive decimal that fits a bigint. */
const GITHUB_ID = /^[1-9][0-9]{0,17}$/;
/** A GitHub login, deliberately narrower than GitHub allows. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** A git branch name, deliberately narrower than git allows. */
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const KEYS = new Set(["githubRepoId", "ownerId", "ownerLogin"]);
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
  if (record.version !== MAP_VERSION) {
    errors.push(`"version" must be ${MAP_VERSION}`);
  }
  const projects = record.projects;
  if (
    typeof projects !== "object" ||
    projects === null ||
    Array.isArray(projects)
  ) {
    errors.push(`"projects" must be an object keyed by project slug`);
    return errors;
  }
  const repositories = new Map();
  for (const [slug, entry] of Object.entries(projects)) {
    const at = `projects["${slug}"]`;
    if (!SLUG.test(slug)) {
      errors.push(
        `${at}: the slug must be lowercase letters, digits and hyphens`,
      );
    } else if (RESERVED_SLUGS.has(slug)) {
      errors.push(`${at}: "${slug}" is reserved for the club's own docs`);
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    const e = /** @type {Record<string, unknown>} */ (entry);
    for (const key of Object.keys(e)) {
      if (!KEYS.has(key)) errors.push(`${at} has an unknown key "${key}"`);
    }
    for (const key of KEYS) {
      if (typeof e[key] !== "string")
        errors.push(`${at}.${key} must be a string`);
    }
    const { githubRepoId, ownerId, ownerLogin } =
      /** @type {Record<string, string>} */ (e);
    if (typeof githubRepoId === "string") {
      if (!GITHUB_ID.test(githubRepoId)) {
        errors.push(
          `${at}.githubRepoId "${githubRepoId}" must be a decimal GitHub repository id`,
        );
      } else if (repositories.has(githubRepoId)) {
        errors.push(
          `${at}.githubRepoId "${githubRepoId}" is already used by "${repositories.get(githubRepoId)}"`,
        );
      } else {
        repositories.set(githubRepoId, slug);
      }
    }
    if (typeof ownerId === "string" && !GITHUB_ID.test(ownerId)) {
      errors.push(
        `${at}.ownerId "${ownerId}" must be a decimal GitHub account id`,
      );
    }
    if (typeof ownerLogin === "string" && !LOGIN.test(ownerLogin)) {
      errors.push(`${at}.ownerLogin "${ownerLogin}" isn't a GitHub login`);
    }
  }
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
 * The map's entry for a slug, or null. Own properties only, so a slug such as
 * `constructor` is never found on the prototype.
 *
 * @param {{ projects: Record<string, { githubRepoId: string, ownerId: string, ownerLogin: string }> }} map
 * @param {string} slug
 */
export function findProject(map, slug) {
  return Object.hasOwn(map.projects, slug) ? map.projects[slug] : null;
}

/**
 * Whether the repository GitHub returned for the entry's id may build or
 * publish. This is the transfer pause: the repository's current owner (id and
 * login) must be the one an officer confirmed, and a private repository never
 * publishes. Pure, so the tests cover every refusal; the resolver and the
 * pre-publish recheck both call it.
 *
 * @param {{ githubRepoId: string, ownerId: string, ownerLogin: string }} entry
 * @param {any} repo  `GET /repositories/{id}`
 * @param {string} slug
 * @returns {{ ok: true, repository: string, branch: string } | { ok: false, reason: string }}
 */
export function checkRepository(entry, repo, slug) {
  if (String(repo?.id) !== entry.githubRepoId) {
    return {
      ok: false,
      reason: `GitHub answered repository ${repo?.id} for "${slug}", whose map entry names ${entry.githubRepoId}`,
    };
  }
  const ownerId = String(repo?.owner?.id);
  const ownerLogin = String(repo?.owner?.login ?? "");
  if (
    ownerId !== entry.ownerId ||
    ownerLogin.toLowerCase() !== entry.ownerLogin.toLowerCase()
  ) {
    return {
      ok: false,
      reason: `docs for "${slug}" are paused: the repository now belongs to ${ownerLogin} (${ownerId}), but the map confirms ${entry.ownerLogin} (${entry.ownerId}). An officer has to confirm the new owner in the dashboard, which opens a pull request to update the map.`,
    };
  }
  if (repo.private === true) {
    return {
      ok: false,
      reason: `${repo.full_name} is private; only public repositories publish docs`,
    };
  }
  const branch = repo.default_branch;
  if (
    typeof branch !== "string" ||
    !BRANCH.test(branch) ||
    branch.includes("..") ||
    branch.endsWith("/") ||
    branch.endsWith(".lock")
  ) {
    return {
      ok: false,
      reason: `${repo.full_name} has a default branch this workflow won't use (${JSON.stringify(branch)})`,
    };
  }
  if (typeof repo.full_name !== "string" || !REPOSITORY.test(repo.full_name)) {
    return {
      ok: false,
      reason: `GitHub returned a repository name this workflow won't use (${JSON.stringify(repo.full_name)})`,
    };
  }
  return { ok: true, repository: repo.full_name, branch };
}

/**
 * Looks the entry's repository up by numeric id and runs the pause check.
 *
 * @param {(path: string) => Promise<any>} api
 * @param {{ githubRepoId: string, ownerId: string, ownerLogin: string }} entry
 * @param {string} slug
 */
export async function lookUpRepository(api, entry, slug) {
  let repo;
  try {
    repo = await api(`/repositories/${entry.githubRepoId}`);
  } catch (error) {
    return {
      ok: /** @type {const} */ (false),
      reason: `couldn't read repository ${entry.githubRepoId} for "${slug}": ${error instanceof Error ? error.message.split("\n")[0] : error}`,
    };
  }
  return checkRepository(entry, repo, slug);
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
    reason: `${sha} is not on ${repository}@${branch} (compare status: ${comparison?.status ?? "unknown"}); only commits on the default branch can be published`,
  };
}

/**
 * The candidate job's resolution: the map entry, the repository by id, the
 * pause check, then the commit. Everything the build later uses comes from
 * here.
 *
 * @param {(path: string) => Promise<any>} api
 * @param {any} map  A valid version 2 map.
 * @param {{ project: string, sha: string }} dispatch
 * @returns {Promise<{ ok: true, outputs: Record<string, string>, reason: string } | { ok: false, reason: string }>}
 */
export async function resolveSource(api, map, dispatch) {
  const entry = findProject(map, dispatch.project);
  if (entry === null) {
    return {
      ok: false,
      reason: `"${dispatch.project}" is not in .github/docs-projects.json; an officer adds a project there from the dashboard, as a pull request to DevDogsUGA.`,
    };
  }
  const repo = await lookUpRepository(api, entry, dispatch.project);
  if (!repo.ok) return repo;
  const onBranch = await shaOnBranch(
    api,
    repo.repository,
    repo.branch,
    dispatch.sha,
  );
  if (!onBranch.ok) return onBranch;
  return {
    ok: true,
    reason: onBranch.reason,
    outputs: {
      project: dispatch.project,
      sha: dispatch.sha,
      repository: repo.repository,
      branch: repo.branch,
      directory: DOCS_DIRECTORY,
      destination: `/docs/${dispatch.project}`,
    },
  };
}

/**
 * The publish job's last check: the map as `main` has it now, and the
 * repository's owner now. A project that left the map, or whose owner no
 * longer matches, publishes nothing, and the last good version stays live.
 *
 * @param {(path: string) => Promise<any>} api
 * @param {string} slug
 * @param {{ repository: string, ref?: string }} source  Where the map lives.
 * @returns {Promise<{ ok: true, reason: string } | { ok: false, reason: string }>}
 */
export async function recheckPublish(api, slug, source) {
  let file;
  try {
    file = await api(
      `/repos/${source.repository}/contents/.github/docs-projects.json?ref=${encodeURIComponent(source.ref ?? "main")}`,
    );
  } catch (error) {
    return {
      ok: false,
      reason: `couldn't read the current map: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
    };
  }
  let map;
  try {
    map = JSON.parse(
      Buffer.from(file.content ?? "", "base64").toString("utf-8"),
    );
  } catch {
    return { ok: false, reason: "the current map isn't valid JSON" };
  }
  const problems = validateMap(map);
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `the current map is invalid:\n- ${problems.join("\n- ")}`,
    };
  }
  const entry = findProject(map, slug);
  if (entry === null) {
    return {
      ok: false,
      reason: `"${slug}" is no longer in .github/docs-projects.json; its docs were disabled while this candidate waited`,
    };
  }
  const repo = await lookUpRepository(api, entry, slug);
  return repo.ok
    ? {
        ok: true,
        reason: `${slug}: ${repo.repository} still belongs to ${entry.ownerLogin}`,
      }
    : repo;
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

/** The `--map <file>` argument, or the committed map. */
function mapPathFromArguments(args) {
  const at = args.indexOf("--map");
  return at !== -1 && args[at + 1] ? args[at + 1] : MAP_PATH;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const [command] = args;
  if (!["resolve", "recheck", "validate"].includes(command ?? "")) {
    fail("usage: docs-projects.mjs resolve|recheck|validate [--map <file>]");
  }
  const baseUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const token = process.env.GH_TOKEN;

  if (command === "recheck") {
    if (!token) fail("GH_TOKEN is not set");
    const project = (process.env.PROJECT ?? "").trim();
    if (!SLUG.test(project)) fail(`PROJECT must be a project slug`);
    const repository = process.env.GITHUB_REPOSITORY ?? "";
    if (!REPOSITORY.test(repository)) fail("GITHUB_REPOSITORY is not set");
    const result = await recheckPublish(
      createApi({ token: token ?? "", baseUrl }),
      project,
      { repository },
    );
    if (!result.ok) fail(result.reason);
    console.log(result.reason);
    return;
  }

  const map = JSON.parse(readFileSync(mapPathFromArguments(args), "utf-8"));
  const problems = validateMap(map);
  if (problems.length > 0) {
    fail(`.github/docs-projects.json is invalid:\n- ${problems.join("\n- ")}`);
  }
  if (command === "validate") {
    console.log(
      `docs-projects.json: ${Object.keys(map.projects).length} project(s), valid`,
    );
    return;
  }

  const dispatch = validateDispatch({
    project: process.env.PROJECT,
    sha: process.env.SHA,
  });
  if (!dispatch.ok) fail(dispatch.errors.join("\n"));
  if (!token) fail("GH_TOKEN (the read-only source token) is not set");
  const result = await resolveSource(
    createApi({ token: token ?? "", baseUrl }),
    map,
    dispatch,
  );
  if (!result.ok) fail(result.reason);
  console.log(result.reason);
  setOutputs(result.outputs);
}

if (isMain(import.meta.url)) await main();
