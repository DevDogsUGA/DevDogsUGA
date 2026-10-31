import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MAP_PATH,
  checkRepository,
  findProject,
  recheckPublish,
  resolveSource,
  shaOnBranch,
  validateDispatch,
  validateMap,
} from "./docs-projects.mjs";

const entry = { githubRepoId: "9001", ownerId: "42", ownerLogin: "Someone" };
const map = (projects = {}) => ({ version: 2, projects });
const SHA = "a".repeat(40);
const repo = (change = {}) => ({
  id: 9001,
  full_name: "Someone/example",
  private: false,
  default_branch: "main",
  owner: { id: 42, login: "Someone" },
  ...change,
});

test("the committed map is valid", () => {
  const committed = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
  assert.deepEqual(validateMap(committed), []);
  assert.equal(committed.version, 2);
});

test("an empty map and a complete entry are valid", () => {
  assert.deepEqual(validateMap(map()), []);
  assert.deepEqual(validateMap(map({ example: entry })), []);
  assert.deepEqual(validateMap({ ...map(), $comment: "notes" }), []);
});

test("the map schema refuses what it should", () => {
  const bad = (slug, change, pattern) => {
    const errors = validateMap(map({ [slug]: { ...entry, ...change } }));
    assert.ok(
      errors.some((e) => pattern.test(e)),
      `${slug} ${JSON.stringify(change)} -> ${errors}`,
    );
  };
  bad("Bad Slug", {}, /slug must be/);
  bad("platform", {}, /reserved/);
  bad("toolkit", {}, /reserved/);
  bad("example", { githubRepoId: "0" }, /githubRepoId/);
  bad("example", { githubRepoId: "12abc" }, /githubRepoId/);
  bad("example", { githubRepoId: 9001 }, /githubRepoId must be a string/);
  bad("example", { ownerId: "-1" }, /ownerId/);
  bad("example", { ownerLogin: "not a login" }, /ownerLogin/);
  bad("example", { ownerLogin: "a/b" }, /ownerLogin/);
  bad("example", { branch: "main" }, /unknown key "branch"/);
  bad("example", { directory: "docs" }, /unknown key "directory"/);
  bad("example", { repository: "a/b" }, /unknown key "repository"/);
  assert.ok(
    validateMap({ version: 1, projects: [] }).some((e) => /version/.test(e)),
  );
  assert.ok(
    validateMap({ version: 2, projects: [] }).some((e) =>
      /keyed by project slug/.test(e),
    ),
  );
  assert.ok(validateMap({ version: 2 }).some((e) => /projects/.test(e)));
  assert.ok(validateMap([]).length > 0);
  assert.ok(
    validateMap({ version: 2, projects: {}, other: 1 }).some((e) =>
      /unknown top-level/.test(e),
    ),
  );
  assert.ok(
    validateMap(map({ example: "nope" })).some((e) =>
      /must be an object/.test(e),
    ),
  );
});

test("two slugs cannot publish from one repository", () => {
  const errors = validateMap(map({ one: entry, two: entry }));
  assert.ok(errors.some((e) => /already used by "one"/.test(e)));
});

test("dispatch input: only a slug and a full sha pass", () => {
  assert.deepEqual(validateDispatch({ project: "example", sha: SHA }), {
    ok: true,
    project: "example",
    sha: SHA,
  });
  assert.deepEqual(
    validateDispatch({ project: " example ", sha: SHA.toUpperCase() }),
    { ok: true, project: "example", sha: SHA },
  );
  for (const input of [
    {},
    { project: "example" },
    { sha: SHA },
    { project: "example", sha: "abc123" },
    { project: "example", sha: "main" },
    { project: "example", sha: `${SHA}; curl x` },
    { project: "../etc", sha: SHA },
    { project: "Example", sha: SHA },
    { project: "a b", sha: SHA },
    { project: "$(id)", sha: SHA },
    { project: 7, sha: SHA },
    { project: "example", sha: ["a"] },
  ]) {
    const result = validateDispatch(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.ok(result.errors.length > 0);
  }
  assert.equal(validateDispatch(undefined).ok, false);
});

test("findProject looks the slug up in the map only", () => {
  assert.equal(findProject(map({ example: entry }), "example"), entry);
  assert.equal(findProject(map({ example: entry }), "other"), null);
  assert.equal(findProject(map(), "example"), null);
  assert.equal(findProject(map(), "constructor"), null);
  assert.equal(findProject(map(), "__proto__"), null);
});

test("a repository with the confirmed owner is accepted, on its default branch", () => {
  assert.deepEqual(checkRepository(entry, repo(), "example"), {
    ok: true,
    repository: "Someone/example",
    branch: "main",
  });
  // GitHub logins are case-insensitive.
  assert.equal(
    checkRepository(
      entry,
      repo({ owner: { id: 42, login: "someone" } }),
      "example",
    ).ok,
    true,
  );
  assert.deepEqual(
    checkRepository(entry, repo({ default_branch: "trunk" }), "example"),
    { ok: true, repository: "Someone/example", branch: "trunk" },
  );
});

test("a transferred repository is paused, by owner id or by login", () => {
  for (const owner of [
    { id: 77, login: "Someone" },
    { id: 42, login: "Renamed" },
    { id: 77, login: "Newcomer" },
  ]) {
    const result = checkRepository(entry, repo({ owner }), "example");
    assert.equal(result.ok, false, JSON.stringify(owner));
    assert.match(result.reason, /paused/);
    assert.match(result.reason, /officer has to confirm/);
  }
});

test("a private repository, another id and an odd branch are refused", () => {
  assert.match(
    checkRepository(entry, repo({ private: true }), "example").reason,
    /private/,
  );
  assert.match(
    checkRepository(entry, repo({ id: 5 }), "example").reason,
    /9001/,
  );
  for (const default_branch of ["-rf", "a..b", "x.lock", "", null, "feat/"]) {
    const result = checkRepository(entry, repo({ default_branch }), "example");
    assert.equal(result.ok, false, String(default_branch));
  }
  assert.equal(
    checkRepository(entry, repo({ full_name: "bad name" }), "example").ok,
    false,
  );
});

const comparing =
  (status, branch = "main") =>
  async (path) => {
    assert.equal(
      path,
      `/repos/DevDogsUGA/example/compare/${branch}...${SHA}?per_page=1`,
    );
    return { status };
  };

test("a sha at or behind the branch tip is on the branch", async () => {
  for (const status of ["identical", "behind"]) {
    const result = await shaOnBranch(
      comparing(status),
      "DevDogsUGA/example",
      "main",
      SHA,
    );
    assert.equal(result.ok, true, status);
  }
});

test("a sha ahead of or diverged from the branch is not", async () => {
  for (const status of ["ahead", "diverged", undefined]) {
    const result = await shaOnBranch(
      comparing(status),
      "DevDogsUGA/example",
      "main",
      SHA,
    );
    assert.equal(result.ok, false, String(status));
    assert.match(result.reason, /not on DevDogsUGA\/example@main/);
  }
});

test("an unknown commit or API failure is a refusal, not a crash", async () => {
  const api = async () => {
    throw new Error("GET failed: 404 Not Found");
  };
  const result = await shaOnBranch(api, "DevDogsUGA/example", "main", SHA);
  assert.equal(result.ok, false);
  assert.match(result.reason, /404/);
});

test("a branch with a slash is encoded in the compare path", async () => {
  let seen = "";
  await shaOnBranch(
    async (p) => ((seen = p), { status: "identical" }),
    "O/r",
    "release/1",
    SHA,
  );
  assert.match(seen, /compare\/release%2F1\.\.\./);
});

/** A fake GitHub: the repository by id, and the compare and contents routes. */
function fakeApi({ repository = repo(), status = "behind", mapFile } = {}) {
  const seen = [];
  const api = async (path) => {
    seen.push(path);
    if (path === "/repositories/9001") return repository;
    if (path.startsWith("/repos/Someone/example/compare/")) return { status };
    if (path.startsWith("/repos/DevDogsUGA/DevDogsUGA/contents/")) {
      if (mapFile === undefined) throw new Error("GET failed: 404");
      return { content: Buffer.from(mapFile).toString("base64") };
    }
    throw new Error(`GET ${path} failed: 404`);
  };
  return { api, seen };
}

test("resolving finds the repository by id and takes branch and directory from GitHub and the standard", async () => {
  const { api, seen } = fakeApi({
    repository: repo({ default_branch: "trunk" }),
  });
  const result = await resolveSource(api, map({ example: entry }), {
    project: "example",
    sha: SHA,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.outputs, {
    project: "example",
    sha: SHA,
    repository: "Someone/example",
    branch: "trunk",
    directory: "docs",
    destination: "/docs/example",
  });
  assert.equal(seen[0], "/repositories/9001");
  assert.match(seen[1], /compare\/trunk\.\.\./);
});

test("resolving refuses a project that is not in the map, before calling GitHub", async () => {
  const { api, seen } = fakeApi();
  const result = await resolveSource(api, map(), {
    project: "example",
    sha: SHA,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not in \.github\/docs-projects\.json/);
  assert.deepEqual(seen, []);
});

test("resolving refuses a transferred repository before it looks at the commit", async () => {
  const { api, seen } = fakeApi({
    repository: repo({ owner: { id: 77, login: "Newcomer" } }),
  });
  const result = await resolveSource(api, map({ example: entry }), {
    project: "example",
    sha: SHA,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /paused/);
  assert.equal(seen.length, 1);
});

test("resolving refuses a commit that is not on the default branch", async () => {
  const { api } = fakeApi({ status: "diverged" });
  const result = await resolveSource(api, map({ example: entry }), {
    project: "example",
    sha: SHA,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not on Someone\/example@main/);
});

test("the pre-publish recheck reads the map from main and the owner again", async () => {
  const mapFile = JSON.stringify(map({ example: entry }));
  const { api, seen } = fakeApi({ mapFile });
  const result = await recheckPublish(api, "example", {
    repository: "DevDogsUGA/DevDogsUGA",
  });
  assert.equal(result.ok, true);
  assert.equal(
    seen[0],
    "/repos/DevDogsUGA/DevDogsUGA/contents/.github/docs-projects.json?ref=main",
  );
  assert.equal(seen[1], "/repositories/9001");
});

test("the recheck refuses once docs were disabled, paused or the map is unreadable", async () => {
  const run = (options) =>
    recheckPublish(fakeApi(options).api, "example", {
      repository: "DevDogsUGA/DevDogsUGA",
    });

  const removed = await run({ mapFile: JSON.stringify(map()) });
  assert.equal(removed.ok, false);
  assert.match(removed.reason, /no longer in/);

  const paused = await run({
    mapFile: JSON.stringify(map({ example: entry })),
    repository: repo({ owner: { id: 77, login: "Newcomer" } }),
  });
  assert.equal(paused.ok, false);
  assert.match(paused.reason, /paused/);

  const invalid = await run({ mapFile: JSON.stringify({ version: 1 }) });
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /invalid/);

  assert.equal((await run({ mapFile: "{not json" })).ok, false);
  assert.equal((await run({})).ok, false);
});

// The workflow runs the script as a process, with the dispatch in the
// environment and the answers in GITHUB_OUTPUT; these run it the same way,
// against a local server that stands in for api.github.com.

const SCRIPT = fileURLToPath(new URL("./docs-projects.mjs", import.meta.url));

/** Starts a server answering `routes` (path -> JSON), runs the script, stops it. */
async function runScript(command, env, routes, mapFile) {
  const server = createServer((request, response) => {
    const route = routes[request.url ?? ""];
    response.writeHead(route === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(route ?? { message: "Not Found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = mkdtempSync(join(tmpdir(), "docs-projects-"));
  const output = join(dir, "output");
  writeFileSync(output, "");
  const mapPath = join(dir, "docs-projects.json");
  if (mapFile !== undefined) writeFileSync(mapPath, mapFile);
  const args = [
    SCRIPT,
    command,
    ...(mapFile === undefined ? [] : ["--map", mapPath]),
  ];
  try {
    const child = spawn(process.execPath, args, {
      env: {
        PATH: process.env.PATH,
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        GITHUB_OUTPUT: output,
        GH_TOKEN: "token",
        ...env,
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const code = await new Promise((resolve) => child.on("close", resolve));
    return { code, stderr, outputs: readFileSync(output, "utf-8") };
  } finally {
    server.close();
  }
}

const dispatchEnv = { PROJECT: "example", SHA };
const routes = (extra = {}) => ({
  "/repositories/9001": repo(),
  [`/repos/Someone/example/compare/main...${SHA}?per_page=1`]: {
    status: "identical",
  },
  ...extra,
});

test("the script's resolve step writes the outputs the workflow reads", async () => {
  const result = await runScript(
    "resolve",
    dispatchEnv,
    routes(),
    JSON.stringify(map({ example: entry })),
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.outputs.trim().split("\n").sort(), [
    "branch=main",
    "destination=/docs/example",
    "directory=docs",
    "project=example",
    "repository=Someone/example",
    `sha=${SHA}`,
  ]);
});

test("the script's resolve step exits 1, writing nothing, for a transferred repository", async () => {
  const result = await runScript(
    "resolve",
    dispatchEnv,
    routes({
      "/repositories/9001": repo({ owner: { id: 77, login: "Newcomer" } }),
    }),
    JSON.stringify(map({ example: entry })),
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /paused/);
  assert.equal(result.outputs, "");
});

test("the script's resolve step refuses an invalid or version 1 map", async () => {
  const result = await runScript(
    "resolve",
    dispatchEnv,
    routes(),
    JSON.stringify({ version: 1, projects: [] }),
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /version/);
});

test("the script's recheck step reads the map from the API and exits 0 or 1", async () => {
  const route = (mapFile) =>
    routes({
      "/repos/DevDogsUGA/DevDogsUGA/contents/.github/docs-projects.json?ref=main":
        { content: Buffer.from(mapFile).toString("base64") },
    });
  const env = {
    PROJECT: "example",
    GITHUB_REPOSITORY: "DevDogsUGA/DevDogsUGA",
  };
  const ok = await runScript(
    "recheck",
    env,
    route(JSON.stringify(map({ example: entry }))),
  );
  assert.equal(ok.code, 0, ok.stderr);
  const gone = await runScript("recheck", env, route(JSON.stringify(map())));
  assert.equal(gone.code, 1);
  assert.match(gone.stderr, /no longer in/);
});

test("the workflow calls these steps: resolve first, recheck before it publishes", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../workflows/docs-candidate.yaml", import.meta.url)),
    "utf-8",
  );
  const resolve = workflow.indexOf("docs-projects.mjs resolve");
  const recheck = workflow.indexOf("docs-projects.mjs recheck");
  const publish = workflow.indexOf("docs-publish.mjs publish");
  assert.ok(resolve !== -1 && recheck !== -1 && publish !== -1);
  assert.ok(resolve < recheck && recheck < publish);
  // The recheck runs in the publish job: after the environment approval, with
  // the job's own token, never the source token.
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.ok(publishJob.includes("docs-projects.mjs recheck"));
  assert.ok(publishJob.includes("environment:"));
  assert.ok(!publishJob.includes("DOCS_SOURCE_TOKEN"));
});
