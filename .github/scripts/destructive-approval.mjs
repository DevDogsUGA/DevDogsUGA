/**
 * The deploy-time half of the destructive gate: refuse a destructive plan no
 * pull request approved.
 *
 * A change that drops or rewrites data is approved ON THE PULL REQUEST: a
 * `devops` member reads the SQL and applies the `allow-destructive` label
 * (destructive-label.mjs; destructive-gate.yaml binds it to the database fingerprint). The
 * deploy asks nobody a second time. It only checks that the approval is real
 * and that it covers what is about to run:
 *
 *   every destructive statement in the deploy's own plan (computed against
 *   the real database) must appear, in the same migration or seed file (the
 *   schema diff has no file), in the plan of a merged pull request that carries
 *   the label from a devops member: the `db-check` artifact of its
 *   merge queue run, or (a repository with no merge queue) of its last
 *   pull_request run. The pull requests searched are those merged in the last
 *   WINDOW commits up to this one, not only the one that produced this commit:
 *   a newer commit supersedes an older candidate whose destructive migration is
 *   still pending, and the older pull request holds that approval. A direct
 *   push by an admin bypass has no pull request, so a destructive plan from one
 *   is refused. A statement no approved pull request showed means the database
 *   changed since the review, so the review does not cover it.
 *
 * Nothing destructive in the plan: passes without asking anything.
 *
 * The plan's reasons are read from the files db-plan.mjs writes
 * (`migrations-plan.json`, `schema-plan.json`) in --plan-dir; the pull
 * request's from `schema-change.json` and `migrations-change.json` in the
 * downloaded `db-check` artifact. On success the verdict is written to
 * `<plan-dir>/destructive-approval.json` for the approval summary.
 *
 * Usage:
 *   GH_TOKEN=... node destructive-approval.mjs --repo OWNER/REPO --sha SHA --plan-dir DIR
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { producingPulls } from "./approval-gate.mjs";
import { evaluateNeed, isDevops, labelState } from "./destructive-label.mjs";
import { apiAll, createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

/** @typedef {{ source: string, kind: string, statement: string }} Reason */

/** @param {string} statement */
const squash = (statement) => String(statement).replace(/\s+/g, " ").trim();

/**
 * The file's own name. The deploy names a migration by its bare file name
 * (`20261010000000_b.sql`) and a seed as the CLI lists it (repo-relative or
 * relative to `supabase/`), while the pull request's check names the repo path
 * (`supabase/migrations/20261010000000_b.sql`); both sides reduce to the name.
 *
 * @param {string} source
 */
const fileName = (source) => String(source).split(/[\\/]/).pop() ?? "";

/**
 * What an approval is keyed to. A migration or seed statement is keyed to its
 * SOURCE FILE as well as its text, so a pull request that approved
 * `DROP TABLE tmp` in one migration cannot cover the same text in another
 * migration added later: the pull request must have introduced that file. The
 * schema diff has no file (it is computed against the database), so it is keyed
 * by statement alone.
 *
 * @param {{ source?: string, kind: string, statement: string }} reason
 */
export const reasonKey = (reason) =>
  `${reason.source && reason.source !== "schema" ? fileName(reason.source) : ""}\u0000${reason.kind}\u0000${squash(reason.statement)}`;

/**
 * @param {string} path
 * @returns {any | undefined}
 */
function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

/**
 * Destructive reasons from a `{ classified: [{ file, reasons }] }` file.
 *
 * @param {any} json
 * @returns {Reason[]}
 */
function fromClassified(json) {
  return (json?.classified ?? []).flatMap((/** @type {any} */ c) =>
    (c.reasons ?? []).map((/** @type {any} */ r) => ({
      source: c.file,
      kind: r.kind,
      statement: r.statement,
    })),
  );
}

/**
 * @param {any} json  A schema-plan.json or schema-change.json.
 * @returns {Reason[]}
 */
function fromSchema(json) {
  return (json?.classification?.reasons ?? []).map((/** @type {any} */ r) => ({
    source: "schema",
    kind: r.kind,
    statement: r.statement,
  }));
}

/**
 * The destructive statements the deploy's plan would run.
 *
 * @param {string} planDir
 * @returns {Reason[]}
 */
export function deployReasons(planDir) {
  return [
    ...fromClassified(readJson(join(planDir, "migrations-plan.json"))),
    ...fromSchema(readJson(join(planDir, "schema-plan.json"))),
  ];
}

/**
 * The destructive statements the pull request showed its reviewer.
 *
 * @param {string} checkDir  The downloaded `db-check` artifact.
 * @returns {Reason[]}
 */
export function pullRequestReasons(checkDir) {
  return [
    ...fromClassified(readJson(join(checkDir, "migrations-change.json"))),
    ...fromSchema(readJson(join(checkDir, "schema-change.json"))),
  ];
}

/**
 * The deploy's destructive statements that the pull request's plan did not
 * contain.
 *
 * @param {Reason[]} deploy
 * @param {Reason[]} shown
 */
export function uncovered(deploy, shown) {
  const known = new Set(shown.map(reasonKey));
  return deploy.filter((reason) => !known.has(reasonKey(reason)));
}

/** How many commits back from the deployed one a covering pull request may sit. */
export const WINDOW = 100;

/**
 * Pull requests that could have approved a statement now pending: the merged
 * pull requests that carry `allow-destructive`, whose merge commit is among the
 * last WINDOW commits before (and including) `sha`.
 *
 * Not only the pull request that produced `sha`: a newer commit can supersede
 * an older candidate whose destructive migration is still pending, and the
 * newer commit's plan then contains the older statements. Their approval lives
 * on the older pull request.
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, sha: string }} options
 * @returns {Promise<Array<{ number: number, mergeSha: string, headSha: string }>>}
 */
export async function candidatePulls({ api, repo, sha }) {
  const commits = await api(
    `/repos/${repo}/commits?sha=${sha}&per_page=${WINDOW}`,
  );
  const window = new Set((commits ?? []).map((/** @type {any} */ c) => c.sha));
  window.add(sha);
  const labelled = await api(
    `/repos/${repo}/issues?labels=allow-destructive&state=closed&sort=updated&direction=desc&per_page=100`,
  );
  /** @type {Map<number, { number: number, mergeSha: string, headSha: string }>} */
  const found = new Map();
  /** @param {any} pull */
  const consider = (pull) => {
    if (!pull?.merged_at || !pull.merge_commit_sha) return;
    if (!window.has(pull.merge_commit_sha)) return;
    found.set(pull.number, {
      number: pull.number,
      mergeSha: pull.merge_commit_sha,
      headSha: pull.head?.sha ?? "",
    });
  };
  for (const issue of labelled ?? []) {
    if (!issue.pull_request) continue;
    consider(await api(`/repos/${repo}/pulls/${issue.number}`));
  }
  // The pull request GitHub associates with the commit itself (a rebase merge
  // can land under another SHA, and the labelled-issue list is capped).
  for (const pull of producingPulls(
    await apiAll(api, `/repos/${repo}/commits/${sha}/pulls`),
    sha,
  )) {
    if (!found.has(pull.number)) {
      consider(await api(`/repos/${repo}/pulls/${pull.number}`));
    }
  }
  return [...found.values()];
}

/**
 * Whether the pull request carries `allow-destructive` applied by a devops
 * member.
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, number: number }} options
 * @returns {Promise<{ actor?: string, problem?: string }>}
 */
export async function approvalOf({ api, repo, number }) {
  const timeline = await apiAll(
    api,
    `/repos/${repo}/issues/${number}/timeline`,
  );
  const state = labelState(timeline);
  if (!state.present)
    return { problem: `#${number} does not carry allow-destructive.` };
  if (!state.actor || !(await isDevops(api, repo, state.actor))) {
    return {
      problem: `#${number} carries allow-destructive from ${state.actor ?? "an unknown user"}, who is not a devops member.`,
    };
  }
  const verdict = await evaluateNeed({
    api,
    repo,
    pr: number,
    destructive: true,
  });
  if (!verdict.pass) return { problem: verdict.message };
  return { actor: state.actor };
}

/**
 * The run that checked the pull request and kept its `db-check` artifact: the
 * merge queue run of its merge commit, else (a repository with no merge queue)
 * the last `pull_request` run on its head commit, which is the plan the
 * reviewer read when applying the label. Its id, or "".
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, mergeSha: string, headSha: string }} options
 */
export async function findCheckRun({ api, repo, mergeSha, headSha }) {
  const attempts = [
    ["merge_group", mergeSha],
    ["pull_request", headSha],
  ];
  for (const [event, sha] of attempts) {
    if (!sha) continue;
    const runs = await api(
      `/repos/${repo}/actions/runs?event=${event}&head_sha=${sha}&per_page=30`,
    );
    for (const run of runs.workflow_runs ?? []) {
      if (run.head_sha !== sha) continue;
      const listing = await api(
        `/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
      );
      const found = (listing.artifacts ?? []).some(
        (/** @type {any} */ a) => a.name === "db-check" && !a.expired,
      );
      if (found) return String(run.id);
    }
  }
  return "";
}

/**
 * @param {{
 *   api: (path: string) => Promise<any>,
 *   repo: string,
 *   sha: string,
 *   planDir: string,
 *   download: (runId: string) => string,
 * }} options  `download` fetches the db-check artifact and returns its directory.
 * @returns {Promise<{ pass: boolean, notes: string[], failures: string[], approval?: { pr: number, actor: string, statements: number, prs: Array<{ pr: number, actor: string }> } }>}
 */
export async function evaluate({ api, repo, sha, planDir, download }) {
  const deploy = deployReasons(planDir);
  if (deploy.length === 0) {
    return {
      pass: true,
      notes: ["The plan is not destructive."],
      failures: [],
    };
  }
  const fix =
    "Nothing was changed. Open a pull request that carries the change, have a devops member read its db-check summary and apply allow-destructive, and merge it.";
  /** @type {string[]} */
  const problems = [];
  /** @type {Array<{ pr: number, actor: string }>} */
  const approvers = [];
  /** @type {Reason[]} */
  let shown = [];
  for (const pull of await candidatePulls({ api, repo, sha })) {
    const verdict = await approvalOf({ api, repo, number: pull.number });
    if (!verdict.actor) {
      problems.push(verdict.problem ?? `#${pull.number} is not approved.`);
      continue;
    }
    const runId = await findCheckRun({ api, repo, ...pull });
    if (!runId) {
      problems.push(
        `#${pull.number} is approved but no run kept a db-check artifact for it (merge queue run of ${pull.mergeSha.slice(0, 7)} or pull request run of ${pull.headSha.slice(0, 7)}), so its plan cannot be compared.`,
      );
      continue;
    }
    shown = [...shown, ...pullRequestReasons(download(runId))];
    approvers.push({ pr: pull.number, actor: verdict.actor });
  }
  const missing = uncovered(deploy, shown);
  if (missing.length > 0) {
    return {
      pass: false,
      notes: [],
      failures: [
        `The plan is destructive and no approved pull request showed ${missing.length} of its ${deploy.length} destructive statement(s):\n` +
          missing
            .map((r) => `  - ${r.source}: ${r.kind}: ${squash(r.statement)}`)
            .join("\n") +
          (problems.length ? `\n${problems.join(" ")}` : "") +
          (approvers.length === 0
            ? "\nNo merged pull request among the last " +
              `${WINDOW} commits carries a devops member's allow-destructive (a direct push has none).`
            : "\nThe database may have changed since the review.") +
          `\n${fix}`,
      ],
    };
  }
  const first = approvers[0];
  if (!first) {
    return {
      pass: false,
      notes: [],
      failures: [`No approving pull request. ${fix}`],
    };
  }
  return {
    pass: true,
    notes: [
      `The destructive plan (${deploy.length} statement(s)) was approved on ${approvers
        .map((a) => `#${a.pr} (allow-destructive by @${a.actor})`)
        .join(
          ", ",
        )}, and every statement appears in a plan those pull requests showed.`,
    ],
    failures: [],
    approval: {
      pr: first.pr,
      actor: first.actor,
      statements: deploy.length,
      prs: approvers,
    },
  };
}

/** @param {string[]} argv @param {string} name */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/** @param {string} repo @param {string} runId */
function ghDownload(repo, runId) {
  const dir = mkdtempSync(join(tmpdir(), "db-check-"));
  execFileSync(
    "gh",
    [
      "run",
      "download",
      runId,
      "--repo",
      repo,
      "--name",
      "db-check",
      "--dir",
      dir,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return dir;
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = flag(argv, "--repo");
  const sha = flag(argv, "--sha");
  const planDir = flag(argv, "--plan-dir");
  const token = process.env.GH_TOKEN;
  if (!repo || !sha || !planDir || !token) {
    console.error(
      "usage: GH_TOKEN=... destructive-approval.mjs --repo OWNER/REPO --sha SHA --plan-dir DIR",
    );
    process.exit(2);
  }
  const result = await evaluate({
    api: createApi({ token }),
    repo,
    sha,
    planDir,
    download: (runId) => ghDownload(repo, runId),
  });
  for (const note of result.notes) console.log(note);
  for (const failure of result.failures) console.error(`::error::${failure}`);
  if (result.approval) {
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, "destructive-approval.json"),
      `${JSON.stringify(result.approval)}\n`,
    );
  }
  if (!result.pass) process.exit(1);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
