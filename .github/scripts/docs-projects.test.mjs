import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MAP_PATH,
  findProject,
  shaOnBranch,
  validateDispatch,
  validateMap,
} from "./docs-projects.mjs";

const entry = {
  slug: "example",
  repository: "DevDogsUGA/example",
  branch: "main",
  directory: "docs",
  destination: "/docs/example",
};
const map = (...projects) => ({ version: 1, projects });
const SHA = "a".repeat(40);

test("the committed map is valid", () => {
  const committed = JSON.parse(readFileSync(MAP_PATH, "utf-8"));
  assert.deepEqual(validateMap(committed), []);
});

test("an empty map and a complete entry are valid", () => {
  assert.deepEqual(validateMap(map()), []);
  assert.deepEqual(validateMap(map(entry)), []);
  assert.deepEqual(validateMap({ ...map(entry), $comment: "notes" }), []);
});

test("the map schema refuses what it should", () => {
  const bad = (change, pattern) => {
    const errors = validateMap(map({ ...entry, ...change }));
    assert.ok(
      errors.some((e) => pattern.test(e)),
      `${JSON.stringify(change)} -> ${errors}`,
    );
  };
  bad({ slug: "Bad Slug" }, /slug/);
  bad({ slug: "platform", destination: "/docs/platform" }, /reserved/);
  bad({ repository: "not-a-repo" }, /Owner\/name/);
  bad({ repository: "a/b;rm -rf" }, /Owner\/name/);
  bad({ branch: "main..evil" }, /branch/);
  bad({ branch: "-rf" }, /branch/);
  bad({ directory: "../docs" }, /directory/);
  bad({ directory: "/etc" }, /directory/);
  bad({ directory: "docs/./x" }, /directory/);
  bad({ destination: "/docs/other" }, /destination must be/);
  bad({ destination: 5 }, /destination must be a string/);
  bad({ extra: "x" }, /unknown key "extra"/);
  assert.ok(
    validateMap({ version: 2, projects: [] }).some((e) => /version/.test(e)),
  );
  assert.ok(validateMap({ version: 1 }).some((e) => /projects/.test(e)));
  assert.ok(validateMap([]).length > 0);
  assert.ok(
    validateMap({ version: 1, projects: [], other: 1 }).some((e) =>
      /unknown top-level/.test(e),
    ),
  );
  assert.ok(validateMap(map("nope")).some((e) => /must be an object/.test(e)));
});

test("duplicate slugs and destinations are refused", () => {
  const errors = validateMap(
    map(entry, { ...entry, repository: "DevDogsUGA/other" }),
  );
  assert.ok(errors.some((e) => /appears twice/.test(e)));
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
  assert.equal(findProject(map(entry), "example"), entry);
  assert.equal(findProject(map(entry), "other"), null);
  assert.equal(findProject(map(), "example"), null);
});

const comparing = (status) => async (path) => {
  assert.equal(
    path,
    `/repos/DevDogsUGA/example/compare/main...${SHA}?per_page=1`,
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
