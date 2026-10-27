import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approversOf,
  enqueuerOf,
  evaluateGate,
  producingPulls,
} from "./approval-gate.mjs";
import { apiAll, createApi } from "./github-api.mjs";
import {
  deployable,
  isInert,
  lastDeployed,
  runDeployed,
} from "./deploy-needed.mjs";
import { findMergeGroupRun } from "./merge-group-run.mjs";

const REPO = "DevDogsUGA/Backstage";
const SHA = "a".repeat(40);
const RUN = "4242";

/** A fake `api` answering from a path -> body map, ignoring the query string. */
function fakeApi(routes) {
  const seen = [];
  const api = async (path) => {
    seen.push(path);
    const [bare] = path.split("?");
    if (!(bare in routes)) throw new Error(`unexpected GET ${path}`);
    return routes[bare];
  };
  api.seen = seen;
  return api;
}

const approval = (login, environment = "production", state = "approved") => ({
  state,
  user: { login },
  environments: [{ name: environment }],
});

const queued = (login) => ({ event: "added_to_merge_queue", actor: { login } });

function routes({ approvals, author = "devdogs-deploy[bot]", enqueuer }) {
  return {
    [`/repos/${REPO}/commits/${SHA}/pulls`]: [
      {
        number: 7,
        merge_commit_sha: SHA,
        merged_at: "2026-10-06T00:00:00Z",
        user: { login: author },
      },
    ],
    [`/repos/${REPO}/issues/7/timeline`]: [
      { event: "commented" },
      ...(enqueuer ? [queued(enqueuer)] : []),
    ],
    [`/repos/${REPO}/actions/runs/${RUN}/approvals`]: approvals,
  };
}

const gate = (r) =>
  evaluateGate({ api: fakeApi(r), repo: REPO, runId: RUN, sha: SHA });

test("approversOf keeps approvals of the named environment only", () => {
  assert.deepEqual(
    approversOf(
      [
        approval("ann"),
        approval("bob", "staging"),
        approval("cy", "production", "rejected"),
        approval("ann"),
      ],
      "production",
    ),
    ["ann"],
  );
});

test("producingPulls prefers the exact merge commit, then any merged PR", () => {
  const exact = { number: 1, merge_commit_sha: SHA, merged_at: "x" };
  const other = { number: 2, merge_commit_sha: "b".repeat(40), merged_at: "x" };
  const open = { number: 3, merge_commit_sha: null, merged_at: null };
  assert.deepEqual(producingPulls([other, exact, open], SHA), [exact]);
  assert.deepEqual(producingPulls([other, open], SHA), [other]);
  assert.deepEqual(producingPulls([open], SHA), []);
});

test("enqueuerOf takes the last merge-queue event", () => {
  assert.equal(
    enqueuerOf([queued("ann"), { event: "x" }, queued("bob")]),
    "bob",
  );
  assert.equal(enqueuerOf([{ event: "commented" }]), undefined);
});

test("passes when an approver is neither author nor enqueuer", async () => {
  const result = await gate(
    routes({ approvals: [approval("cy")], enqueuer: "ann" }),
  );
  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test("fails when the enqueuer approved a deploy PR the App authored", async () => {
  const result = await gate(
    routes({ approvals: [approval("Ann")], enqueuer: "ann" }),
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /Ann approved production but queued #7/);
});

test("fails when the PR author approved, even beside a valid approver", async () => {
  const result = await gate(
    routes({
      approvals: [approval("cy"), approval("dev")],
      author: "dev",
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /dev approved production but authored #7/);
});

test("names both reasons for someone who authored and queued", async () => {
  const result = await gate(
    routes({ approvals: [approval("dev")], author: "dev", enqueuer: "dev" }),
  );
  assert.match(result.failures[0], /authored #7 and queued #7/);
});

test("a rejection or another environment's approval is not an approval", async () => {
  const result = await gate(
    routes({
      approvals: [
        approval("cy", "production", "rejected"),
        approval("ann", "staging"),
      ],
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
  assert.match(
    result.failures[0],
    /No approval or admin bypass of the production environment/,
  );
});

test("an admin bypass passes with a warning, even by the author and enqueuer", async () => {
  const result = await gate(
    routes({
      approvals: [approval("dev", "production", "skipped")],
      author: "dev",
      enqueuer: "dev",
    }),
  );
  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
  assert.match(result.warnings[0], /dev bypassed it as an admin/);
});

test("a bypass of another environment is not a bypass of this one", async () => {
  const result = await gate(
    routes({
      approvals: [approval("dev", "publishing", "skipped")],
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
});

test("an approval beside a bypass is still checked against the author", async () => {
  const result = await gate(
    routes({
      approvals: [approval("dev"), approval("sam", "production", "skipped")],
      author: "dev",
      enqueuer: "ann",
    }),
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /dev approved production but authored #7/);
});

test("a direct push has no PR, and the native review rule is the gate", async () => {
  const api = fakeApi({ [`/repos/${REPO}/commits/${SHA}/pulls`]: [] });
  const result = await evaluateGate({ api, repo: REPO, runId: RUN, sha: SHA });
  assert.equal(result.pass, true);
  assert.match(result.notes[0], /direct push/);
  assert.equal(api.seen.length, 1);
});

test("a PR with no merge-queue event still bars its author", async () => {
  const result = await gate(
    routes({
      approvals: [approval("devdogs-deploy[bot]")],
      enqueuer: undefined,
    }),
  );
  assert.equal(result.pass, false);
  assert.ok(result.notes.some((n) => /no merge-queue event/.test(n)));
});

test("apiAll follows pages until one is short", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => i),
    Array.from({ length: 3 }, (_, i) => 100 + i),
  ];
  const seen = [];
  const all = await apiAll(async (path) => {
    seen.push(path);
    return pages[Number(/&page=(\d+)/.exec(path)[1]) - 1];
  }, "/x");
  assert.equal(all.length, 103);
  assert.equal(seen.length, 2);
});

test("createApi sends the token and surfaces a failed response", async () => {
  let sent;
  const ok = createApi({
    token: "t",
    baseUrl: "https://example.test",
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return { ok: true, json: async () => ({ a: 1 }) };
    },
  });
  assert.deepEqual(await ok("/p"), { a: 1 });
  assert.equal(sent.url, "https://example.test/p");
  assert.equal(sent.init.headers.authorization, "Bearer t");

  const bad = createApi({
    token: "t",
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      text: async () => "nope",
    }),
  });
  await assert.rejects(bad("/p"), /GET \/p failed: 404 nope/);
});

// ── merge-group-run ──────────────────────────────────────────────────────────

const run = (id, over = {}) => ({
  id,
  event: "merge_group",
  head_sha: SHA,
  conclusion: "success",
  path: ".github/workflows/ci.yaml",
  created_at: `2026-10-06T00:00:0${id % 10}Z`,
  ...over,
});

const artifacts = (...names) => ({
  artifacts: names.map((name) => ({ name, expired: false })),
});

const runsPath = `/repos/${REPO}/actions/runs`;
const both = [`staging-${SHA}`, `production-${SHA}`];

test("finds the newest merge-group run that has every tier's artifact", async () => {
  const api = fakeApi({
    [runsPath]: { workflow_runs: [run(1), run(2)] },
    [`${runsPath}/1/artifacts`]: artifacts(...both),
    [`${runsPath}/2/artifacts`]: artifacts(...both),
  });
  assert.equal(
    await findMergeGroupRun({
      api,
      repo: REPO,
      sha: SHA,
      tiers: ["staging", "production"],
    }),
    "2",
  );
});

test("skips runs missing an artifact, expired, other workflows or failed", async () => {
  const api = fakeApi({
    [runsPath]: {
      workflow_runs: [
        run(1, { path: ".github/workflows/publish.yaml" }),
        run(2, { conclusion: "failure" }),
        run(3, { head_sha: "b".repeat(40) }),
        run(4),
        run(5),
      ],
    },
    [`${runsPath}/4/artifacts`]: artifacts(`staging-${SHA}`),
    [`${runsPath}/5/artifacts`]: {
      artifacts: both.map((name) => ({ name, expired: true })),
    },
  });
  assert.equal(
    await findMergeGroupRun({
      api,
      repo: REPO,
      sha: SHA,
      tiers: ["staging", "production"],
    }),
    "",
  );
});

test("only the deployed tiers need artifacts", async () => {
  const api = fakeApi({
    [runsPath]: { workflow_runs: [run(4)] },
    [`${runsPath}/4/artifacts`]: artifacts(`staging-${SHA}`),
  });
  assert.equal(
    await findMergeGroupRun({ api, repo: REPO, sha: SHA, tiers: ["staging"] }),
    "4",
  );
});

test("a ref suffix on the workflow path still matches", async () => {
  const api = fakeApi({
    [runsPath]: {
      workflow_runs: [
        run(6, { path: ".github/workflows/ci.yaml@refs/heads/main" }),
      ],
    },
    [`${runsPath}/6/artifacts`]: artifacts(`staging-${SHA}`),
  });
  assert.equal(
    await findMergeGroupRun({ api, repo: REPO, sha: SHA, tiers: ["staging"] }),
    "6",
  );
});

// --- deploy-needed ---------------------------------------------------------

test("isInert: docs, tests, slides and the CLIs ship nothing", () => {
  for (const path of [
    "README.md",
    "packages/events/README.md",
    "CUTOVER.md",
    "apps/slides/workshops/web/slides.md",
    "competitions/fall-2026/brief.md",
    "packages/backstage/src/env/commands.ts",
    "packages/devtools/src/check/env.ts",
    "apps/platform/src/lib/docsTree.test.ts",
    "scripts/publish-changed-packages.mjs",
    ".github/workflows/publish.yaml",
    ".github/workflows/deploy.yaml",
    ".github/workflows/ci.yaml",
    ".github/scripts/deploy-needed.mjs",
  ]) {
    assert.equal(isInert(path), true, path);
  }
});

test("isInert: the platform, its packages, supabase and the deploy ship", () => {
  for (const path of [
    "apps/platform/next.config.ts",
    "apps/platform/src/env.ts",
    "packages/events/src/data/meetings.json",
    "packages/email/src/TeamInvite.tsx",
    "apps/catalog/src/worker.ts",
    "supabase/config.toml",
    "workers.json",
    "pnpm-lock.yaml",
    ".github/workflows/build-artifacts.yaml",
    ".github/actions/setup-workspace/action.yml",
    "something-new/file.ts",
  ]) {
    assert.equal(isInert(path), false, path);
  }
});

test("deployable keeps only shipped paths", () => {
  assert.deepEqual(deployable(["README.md", "apps/platform/x.ts"]), [
    "apps/platform/x.ts",
  ]);
  assert.deepEqual(deployable(["README.md"]), []);
});

const job = (name, conclusion, steps) => ({ name, conclusion, steps });
const ok = (name) => ({ name, conclusion: "success" });

test("runDeployed: staging needs every staging-deploy job to succeed", () => {
  const both = [
    job("deploy / staging-deploy (platform, apps/platform, x)", "success"),
    job("deploy / staging-deploy (schedule-builder, d, y)", "success"),
  ];
  assert.equal(runDeployed(both, "staging"), true);
  both[1].conclusion = "failure";
  assert.equal(runDeployed(both, "staging"), false);
  assert.equal(runDeployed([job("validate", "success")], "staging"), false);
});

test("runDeployed: a superseded production job deployed nothing", () => {
  const deployed = job("deploy / production", "success", [
    ok("Deploy and verify platform"),
    ok("Deploy and verify schedule-builder"),
  ]);
  assert.equal(runDeployed([deployed], "production"), true);
  const superseded = job("deploy / production", "success", [
    { name: "Deploy and verify platform", conclusion: "skipped" },
    { name: "Deploy and verify schedule-builder", conclusion: "skipped" },
  ]);
  assert.equal(runDeployed([superseded], "production"), false);
});

test("runDeployed: a mode: full Worker deploy (no switch step) counts once its classic deploy step succeeded", () => {
  const full = (name, step = "success") =>
    job(`deploy / ${name} / deploy`, "success", [
      { name: "Switch traffic to the new version", conclusion: "skipped" },
      { name: "Deploy (classic, no preview)", conclusion: step },
    ]);
  assert.equal(
    runDeployed([full("staging-platform"), full("staging-catalog")], "staging"),
    true,
  );
  assert.equal(
    runDeployed(
      [full("staging-platform"), full("staging-catalog", "skipped")],
      "staging",
    ),
    false,
  );
});

test("runDeployed: the shared Worker workflow counts only after its traffic switch", () => {
  const call = (name, conclusion = "success", switched = true) =>
    job(`deploy / ${name} / deploy`, conclusion, [
      {
        name: "Switch traffic to the new version",
        conclusion: switched ? "success" : "skipped",
      },
    ]);
  const staging = [call("staging-platform"), call("staging-catalog")];
  assert.equal(runDeployed(staging, "staging"), true);
  assert.equal(
    runDeployed(
      [call("staging-platform"), call("staging-catalog", "failure")],
      "staging",
    ),
    false,
  );
  // Succeeded without switching (a superseded candidate refused before the upload): nothing shipped.
  assert.equal(
    runDeployed(
      [
        call("production-platform", "success", false),
        call("production-catalog"),
      ],
      "production",
    ),
    false,
  );
  assert.equal(
    runDeployed(
      [call("production-platform"), call("production-catalog")],
      "production",
    ),
    true,
  );
  assert.equal(runDeployed([call("staging-platform")], "staging"), false);
  // The catalog is part of what a tier ships: without it the tier is not deployed.
  assert.equal(runDeployed([call("staging-platform")], "staging"), false);
});

test("lastDeployed skips this run's own SHA and failed deploys", async () => {
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const api = fakeApi({
    [`/repos/${REPO}/actions/workflows/ci.yaml/runs`]: {
      workflow_runs: [
        { id: 1, head_sha: SHA },
        { id: 2, head_sha: B },
        { id: 3, head_sha: C },
      ],
    },
    [`/repos/${REPO}/actions/runs/2/jobs`]: {
      jobs: [job("deploy / staging-deploy (platform)", "failure")],
    },
    [`/repos/${REPO}/actions/runs/3/jobs`]: {
      jobs: [job("deploy / staging-deploy (platform)", "success")],
    },
  });
  assert.equal(
    await lastDeployed({ api, repo: REPO, tier: "staging", before: SHA }),
    C,
  );
  assert.ok(!api.seen.some((p) => p.includes("/runs/1/")));
});

test("lastDeployed is empty when no recent run deployed", async () => {
  const api = fakeApi({
    [`/repos/${REPO}/actions/workflows/ci.yaml/runs`]: { workflow_runs: [] },
  });
  assert.equal(
    await lastDeployed({ api, repo: REPO, tier: "production", before: SHA }),
    "",
  );
});

// --- one approval per deploy ---------------------------------------------

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderApprovalSummary } from "./approval-summary.mjs";
import {
  deployReasons,
  evaluate as evaluateDestructive,
  uncovered,
} from "./destructive-approval.mjs";
import { scopeOf } from "./deploy-needed.mjs";

const dropColumn = {
  kind: "DROP COLUMN",
  statement: "ALTER TABLE a DROP COLUMN b",
};

function planDirWith({
  schemaReasons = [],
  migrationReasons = [],
  migrationFile = "20260101_x.sql",
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "plan-"));
  writeFileSync(
    join(dir, "schema-plan.json"),
    JSON.stringify({ hash: "h", classification: { reasons: schemaReasons } }),
  );
  writeFileSync(
    join(dir, "migrations-plan.json"),
    JSON.stringify({
      classified: migrationReasons.length
        ? [{ file: migrationFile, reasons: migrationReasons }]
        : [],
    }),
  );
  return dir;
}

function checkDirWith(schemaReasons, migrations = []) {
  const dir = mkdtempSync(join(tmpdir(), "check-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "migrations-change.json"),
    JSON.stringify({ classified: migrations }),
  );
  writeFileSync(
    join(dir, "schema-change.json"),
    JSON.stringify({ classification: { reasons: schemaReasons } }),
  );
  return dir;
}

const labeled = (login) => [
  { event: "labeled", label: { name: "allow-destructive" }, actor: { login } },
];

const OLD = "b".repeat(40);
const pull = (number, mergeSha, extra = {}) => ({
  number,
  merge_commit_sha: mergeSha,
  merged_at: "2026-10-01T00:00:00Z",
  head: { sha: `head${number}` },
  ...extra,
});

/**
 * @param {object} o
 * @param pulls  Merged PRs by number, each with the label timeline and permission.
 * @param runs   { merge_group: [...], pull_request: [...] } run lists by event.
 */
function destructiveApi({
  labelled = [5],
  pulls = { 5: pull(5, SHA) },
  timelines = { 5: labeled("devops-person") },
  permission = "maintain",
  runs = { merge_group: [{ id: 7, head_sha: SHA }], pull_request: [] },
  artifacts = [{ name: "db-check" }],
  window = [SHA],
  producing = [],
} = {}) {
  const base = fakeApi({
    [`/repos/${REPO}/commits`]: window.map((sha) => ({ sha })),
    [`/repos/${REPO}/issues`]: labelled.map((number) => ({
      number,
      pull_request: {},
    })),
    [`/repos/${REPO}/commits/${SHA}/pulls`]: producing,
    ...Object.fromEntries(
      Object.entries(pulls).map(([n, p]) => [`/repos/${REPO}/pulls/${n}`, p]),
    ),
    ...Object.fromEntries(
      Object.entries(timelines).map(([n, t]) => [
        `/repos/${REPO}/issues/${n}/timeline`,
        t,
      ]),
    ),
    [`/repos/${REPO}/collaborators/devops-person/permission`]: {
      role_name: permission,
    },
    [`/repos/${REPO}/actions/runs/7/artifacts`]: { artifacts },
    [`/repos/${REPO}/actions/runs/8/artifacts`]: { artifacts },
  });
  return async (path) => {
    if (path.startsWith(`/repos/${REPO}/actions/runs?`)) {
      const event = /event=(\w+)/.exec(path)[1];
      const headSha = /head_sha=(\w+)/.exec(path)[1];
      return {
        workflow_runs: (runs[event] ?? []).filter(
          (r) => r.head_sha === headSha,
        ),
      };
    }
    return base(path);
  };
}

const evalWith = (api, schemaReasons, shown) =>
  evaluateDestructive({
    api,
    repo: REPO,
    sha: SHA,
    planDir: planDirWith({ schemaReasons }),
    download: () => checkDirWith(shown),
  });

test("a plan with nothing destructive needs no pull request approval", async () => {
  const result = await evaluateDestructive({
    api: fakeApi({}),
    repo: REPO,
    sha: SHA,
    planDir: planDirWith(),
    download: () => assert.fail("no download expected"),
  });
  assert.equal(result.pass, true);
});

test("a destructive plan the pull request approved and showed passes", async () => {
  const result = await evalWith(destructiveApi(), [dropColumn], [dropColumn]);
  assert.equal(result.pass, true, result.failures.join("\n"));
  assert.equal(result.approval.pr, 5);
});

test("a destructive plan from a direct push is refused", async () => {
  const result = await evalWith(
    destructiveApi({ labelled: [], pulls: {}, window: [SHA] }),
    [dropColumn],
    [dropColumn],
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /direct push/);
});

test("a destructive plan without the label, or with one from a non-devops user, is refused", async () => {
  const none = await evalWith(
    destructiveApi({ timelines: { 5: [] } }),
    [dropColumn],
    [dropColumn],
  );
  assert.equal(none.pass, false);
  assert.match(none.failures[0], /does not carry/);
  const member = await evalWith(
    destructiveApi({ permission: "write" }),
    [dropColumn],
    [dropColumn],
  );
  assert.equal(member.pass, false);
  assert.match(member.failures[0], /not a devops member/);
});

test("a destructive statement the pull request never showed is refused", async () => {
  const extra = { kind: "DROP TABLE", statement: "DROP TABLE   old" };
  const result = await evalWith(
    destructiveApi(),
    [dropColumn, extra],
    [dropColumn],
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /DROP TABLE old/);
  assert.doesNotMatch(result.failures[0], /DROP COLUMN/);
});

test("a labelled destructive plan with no kept db-check artifact is refused", async () => {
  const result = await evalWith(
    destructiveApi({ artifacts: [{ name: "other" }] }),
    [dropColumn],
    [dropColumn],
  );
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /db-check/);
});

test("an older approved pull request still covers its statement after a newer commit superseded it", async () => {
  // PR 5 (destructive, labelled) merged at OLD; PR 6 (not labelled) merged at
  // SHA and its plan carries PR 5's still-pending statement.
  const api = destructiveApi({
    labelled: [5],
    pulls: { 5: pull(5, OLD), 6: pull(6, SHA) },
    timelines: { 5: labeled("devops-person"), 6: [] },
    runs: { merge_group: [{ id: 7, head_sha: OLD }], pull_request: [] },
    window: [SHA, OLD],
    producing: [pull(6, SHA)],
  });
  const result = await evalWith(api, [dropColumn], [dropColumn]);
  assert.equal(result.pass, true, result.failures.join("\n"));
  assert.deepEqual(
    result.approval.prs.map((p) => p.pr),
    [5],
  );
});

const dropTmp = { kind: "DROP TABLE", statement: "DROP TABLE tmp_import" };

test("an old approval for a statement in one migration does not cover the same text in a new migration", async () => {
  // PR 5 (approved, devops) showed DROP TABLE tmp_import in 20260901_a.sql and
  // deployed long ago. PR 6 (no label) adds 20261010_b.sql with the same text.
  // The key includes the file, so PR 5 covers nothing of PR 6's.
  const api = destructiveApi({
    pulls: { 5: pull(5, OLD), 6: pull(6, SHA) },
    timelines: { 5: labeled("devops-person"), 6: [] },
    runs: { merge_group: [{ id: 7, head_sha: OLD }], pull_request: [] },
    window: [SHA, OLD],
    producing: [pull(6, SHA)],
  });
  const result = await evaluateDestructive({
    api,
    repo: REPO,
    sha: SHA,
    planDir: planDirWith({
      migrationReasons: [dropTmp],
      migrationFile: "20261010_b.sql",
    }),
    download: () =>
      checkDirWith(
        [],
        [{ file: "20260901_a.sql", destructive: true, reasons: [dropTmp] }],
      ),
  });
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /20261010_b\.sql/);
  assert.match(result.failures[0], /DROP TABLE tmp_import/);
});

test("the pull request that introduced the migration file covers it", async () => {
  const result = await evaluateDestructive({
    api: destructiveApi(),
    repo: REPO,
    sha: SHA,
    planDir: planDirWith({
      migrationReasons: [dropTmp],
      migrationFile: "20261010_b.sql",
    }),
    download: () =>
      checkDirWith(
        [],
        [{ file: "20261010_b.sql", destructive: true, reasons: [dropTmp] }],
      ),
  });
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("an approval older than the commit window does not count", async () => {
  const api = destructiveApi({
    pulls: { 5: pull(5, OLD) },
    window: [SHA],
    runs: { merge_group: [{ id: 7, head_sha: OLD }], pull_request: [] },
  });
  const result = await evalWith(api, [dropColumn], [dropColumn]);
  assert.equal(result.pass, false);
});

test("without a merge queue the pull request run on its head commit supplies the db-check", async () => {
  const api = destructiveApi({
    runs: { merge_group: [], pull_request: [{ id: 8, head_sha: "head5" }] },
  });
  const result = await evalWith(api, [dropColumn], [dropColumn]);
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("deploy reasons read both plans; uncovered ignores whitespace", () => {
  const dir = planDirWith({
    schemaReasons: [dropColumn],
    migrationReasons: [{ kind: "TRUNCATE", statement: "TRUNCATE t" }],
  });
  assert.equal(deployReasons(dir).length, 2);
  assert.deepEqual(
    uncovered(
      [
        {
          source: "schema",
          kind: "DROP COLUMN",
          statement: "ALTER TABLE a\n DROP COLUMN b",
        },
      ],
      [dropColumn],
    ),
    [],
  );
});

test("the approval summary lists destructive statements before everything else", () => {
  const text = renderApprovalSummary({
    sha: SHA,
    repo: REPO,
    migrations: {
      migrations: ["20260101_x.sql"],
      seeds: [],
      roles: [],
      classified: [
        {
          file: "20260101_x.sql",
          reasons: [{ kind: "TRUNCATE", statement: "TRUNCATE t" }],
        },
      ],
    },
    schema: { hash: "abc", classification: { reasons: [dropColumn] } },
    schemaSql: "ALTER TABLE a DROP COLUMN b;",
    approval: { pr: 5, actor: "devops-person" },
    notes: "- Platform Worker: deploys",
  });
  const order = [
    "DESTRUCTIVE",
    "Pending migrations",
    "Schema change",
    "Workers, functions",
  ].map((h) => text.indexOf(h));
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  assert.match(text, /allow-destructive` by @devops-person/);
  assert.match(text, /not known yet/);
});

test("the scope skips the config push and unchanged Workers, and fails open", () => {
  assert.deepEqual(scopeOf(null), {
    config: true,
    platform: true,
    catalog: true,
  });
  assert.deepEqual(scopeOf(["apps/platform/src/x.ts"]), {
    config: false,
    platform: true,
    catalog: false,
  });
  assert.deepEqual(scopeOf(["docs/a.md"]), {
    config: false,
    platform: true,
    catalog: false,
  });
  assert.deepEqual(scopeOf(["apps/catalog/src/x.ts"]), {
    config: false,
    platform: false,
    catalog: true,
  });
  assert.deepEqual(scopeOf(["supabase/config.toml", "pnpm-lock.yaml"]), {
    config: true,
    platform: true,
    catalog: true,
  });
  assert.deepEqual(scopeOf(["supabase/seed/officers.sql"]).config, true);
  assert.equal(scopeOf(["supabase/config-push.stamp"]).config, true);
  // Inert files change neither Worker.
  assert.deepEqual(scopeOf([".github/scripts/db-plan.mjs"]), {
    config: false,
    platform: false,
    catalog: false,
  });
});

test("a Worker skipped as unchanged counts as current for the last-deploy lookup", () => {
  const job = (name, conclusion, steps = []) => ({ name, conclusion, steps });
  const jobs = [
    job("deploy / production-catalog / unchanged", "success"),
    job("deploy / production-platform / deploy", "success", [
      { name: "Switch traffic to the new version", conclusion: "success" },
    ]),
  ];
  assert.equal(runDeployed(jobs, "production"), true);
  assert.equal(runDeployed(jobs.slice(0, 1), "production"), false);
});

import { checkProtection, judgeRules } from "./main-protection.mjs";

test("the one-approval path needs a ruleset requiring an approving review on the default branch", async () => {
  assert.equal(judgeRules([]).ok, false);
  assert.equal(judgeRules(undefined).ok, false);
  assert.equal(
    judgeRules([{ type: "deletion" }, { type: "non_fast_forward" }]).ok,
    false,
  );
  const noReview = judgeRules([
    {
      type: "pull_request",
      parameters: { required_approving_review_count: 0 },
    },
  ]);
  assert.equal(noReview.ok, false);
  assert.match(noReview.message, /no approving review/);
  assert.equal(
    judgeRules([
      {
        type: "pull_request",
        ruleset_id: 9,
        parameters: { required_approving_review_count: 1 },
      },
    ]).ok,
    true,
  );
  const verdict = await checkProtection({
    api: async (path) => {
      assert.equal(path, `/repos/${REPO}/rules/branches/main`);
      return [];
    },
    repo: REPO,
    branch: "main",
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /Gate step 6/);
});

import { appliedInProduction, configChanged } from "./config-changed.mjs";

const applyJob = (name, conclusion) => ({ name, conclusion });

test("a production apply job counts only when it succeeded", () => {
  assert.equal(
    appliedInProduction([
      applyJob("deploy / production-database / apply", "success"),
    ]),
    true,
  );
  assert.equal(
    appliedInProduction([
      applyJob("deploy / production-database-apply / apply", "success"),
    ]),
    true,
  );
  for (const conclusion of ["failure", "skipped", "cancelled", null]) {
    assert.equal(
      appliedInProduction([
        applyJob("deploy / production-database / apply", conclusion),
      ]),
      false,
    );
  }
  assert.equal(
    appliedInProduction([
      applyJob("deploy / staging-database / apply", "success"),
    ]),
    false,
  );
});

function configApi(runs) {
  return async (path) => {
    if (path.includes("/workflows/ci.yaml/runs")) {
      return {
        workflow_runs: Object.keys(runs).map((sha, i) => ({
          id: i + 1,
          head_sha: sha,
        })),
      };
    }
    const id = /runs\/(\d+)\/jobs/.exec(path)[1];
    return { jobs: Object.values(runs)[Number(id) - 1] };
  };
}

test("a config change in a superseded candidate is still pushed by the next deploy", async () => {
  // A changed config.toml; its production run was superseded, so only the commit
  // before A (Z) ever applied. B is the head: B vs A is unchanged, but B vs Z
  // differs, and Z is what production last deployed.
  const api = configApi({
    A: [applyJob("deploy / production-database / apply", "skipped")],
    Z: [applyJob("deploy / production-database / apply", "success")],
  });
  const asked = [];
  const result = await configChanged({
    api,
    repo: REPO,
    sha: "B",
    changedSince: (from, to) => {
      asked.push([from, to]);
      return from === "Z";
    },
  });
  assert.equal(result.config, true);
  assert.deepEqual(asked, [["Z", "B"]]);
});

test("config is unchanged when nothing differs since the last production apply, and fails open otherwise", async () => {
  const applied = configApi({
    Z: [applyJob("deploy / production-database-apply / apply", "success")],
  });
  assert.equal(
    (
      await configChanged({
        api: applied,
        repo: REPO,
        sha: "B",
        changedSince: () => false,
      })
    ).config,
    false,
  );
  assert.equal(
    (
      await configChanged({
        api: applied,
        repo: REPO,
        sha: "B",
        changedSince: () => null,
      })
    ).config,
    true,
  );
  assert.equal(
    (
      await configChanged({
        api: configApi({ Z: [] }),
        repo: REPO,
        sha: "B",
        changedSince: () => false,
      })
    ).config,
    true,
  );
  assert.equal(
    (
      await configChanged({
        api: async () => {
          throw new Error("boom");
        },
        repo: REPO,
        sha: "B",
        changedSince: () => false,
      })
    ).config,
    true,
  );
});
