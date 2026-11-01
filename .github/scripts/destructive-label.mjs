/**
 * The `allow-destructive` label check (Q10).
 *
 * A pull request whose SQL is destructive (see sql-classify.mjs) may merge
 * only if a `devops` member applied the `allow-destructive` label. The label
 * is read from the PR's timeline, so who applied it is on record: it is not
 * enough that the label is there.
 *
 * "A devops member" is decided by repository permission, as an approximation:
 * the devops team holds `maintain` on every repository and the admins team
 * holds `admin`, so `maintain` or `admin` on the repository is the test, and
 * it admits members of the admins team who are not on devops. That is
 * deliberate: an admin can already bypass the rulesets, so the label gate
 * keeps out everyone BELOW them (focus leads, reviewers, members, bots), not
 * admins. The production deploy approvals are stricter (the environment
 * reviewers are the devops team alone). It is read with the job's own
 * `GITHUB_TOKEN`: the
 * team-membership endpoints need an organization-level token, and a pull
 * request from a fork has none.
 *
 * Two commands, run by two different jobs:
 *
 *   gate   If the label is present and its applier is not devops, it fails.
 *          The required `destructive-gate` check runs it read-only on
 *          `pull_request` and `merge_group` (database-pr.yaml), from the base
 *          branch's copy on a pull request. destructive-gate.yaml's
 *          `destructive-label` job runs it on `pull_request_target`, where
 *          the token can edit the PR, with `--remove-rejected` to remove the
 *          label as well; it never checks out or runs the PR's code.
 *   need   Runs beside the SQL classification, on `pull_request` and
 *          `merge_group`. Destructive SQL requires the label and a matching
 *          bot-recorded fingerprint approval from devops.
 *          (In the merge queue the PR is found from the queue branch name.)
 *
 * Both are required checks, so a destructive change needs the label (`need`)
 * and the label needs a devops applier (`gate`).
 *
 * Usage:
 *   GH_TOKEN=... node destructive-label.mjs gate --repo OWNER/REPO --pr N [--remove-rejected] [--record --action ACTION --head SHA]
 *   GH_TOKEN=... node destructive-label.mjs need --repo OWNER/REPO (--pr N | --ref REF) --destructive true|false
 */
import {
  currentFingerprint,
  readApproval,
  labelEvent,
  reconcileApproval,
} from "./destructive-fingerprint.mjs";
import { apiAll, createApi, createRequest } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

export const LABEL = "allow-destructive";

/** Repository permission roles that count as devops. */
const DEVOPS_ROLES = new Set(["maintain", "admin"]);

/**
 * The label's current state from a PR timeline: present or not, and who
 * applied the most recent `labeled` event. An `unlabeled` after it clears it.
 *
 * @param {Array<{ event?: string, label?: { name?: string } | null, actor?: { login?: string } | null }>} timeline
 * @param {string} [label]
 * @returns {{ present: boolean, actor?: string }}
 */
export function labelState(timeline, label = LABEL) {
  /** @type {{ present: boolean, actor?: string }} */
  let state = { present: false };
  for (const event of timeline) {
    if (event.label?.name !== label) continue;
    if (event.event === "labeled") {
      state = { present: true, actor: event.actor?.login };
    } else if (event.event === "unlabeled") {
      state = { present: false };
    }
  }
  return state;
}

/**
 * @param {(path: string) => Promise<any>} api
 * @param {string} repo
 * @param {string} login
 */
export async function isDevops(api, repo, login) {
  let permission;
  try {
    permission = await api(
      `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
    );
  } catch (error) {
    // GitHub answers 404 for a login it cannot resolve to a user with access
    // (a deleted account, an app). That is "not devops", not a crash: a crash
    // would fail the check but leave the label sitting there.
    if (/\b404\b/.test(String(error?.message))) return false;
    throw error;
  }
  return DEVOPS_ROLES.has(permission?.role_name ?? permission?.permission);
}

/**
 * @typedef {{ pass: boolean, message: string }} Verdict
 */

/**
 * `gate`: is whoever applied the label allowed to?
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, pr: number }} input
 * @returns {Promise<Verdict & { reject?: boolean }>}
 */
export async function evaluateGate({ api, repo, pr }) {
  const timeline = await apiAll(api, `/repos/${repo}/issues/${pr}/timeline`);
  const state = labelState(timeline);
  if (!state.present) {
    return { pass: true, message: `No \`${LABEL}\` label: nothing to check.` };
  }
  if (!state.actor) {
    return {
      pass: false,
      reject: true,
      message: `\`${LABEL}\` is on the pull request but the timeline does not say who applied it.`,
    };
  }
  if (await isDevops(api, repo, state.actor)) {
    return {
      pass: true,
      message: `\`${LABEL}\` was applied by @${state.actor}, a devops member.`,
    };
  }
  return {
    pass: false,
    reject: true,
    message: `\`${LABEL}\` was applied by @${state.actor}, who is not a devops member. Only a devops member may apply it.`,
  };
}

/**
 * `need`: destructive SQL needs the label.
 *
 * The label and bot-owned approval must both describe the current SQL.
 *
 * @param {{ api: (path: string) => Promise<any>, repo: string, pr: number, destructive: boolean }} input
 * @returns {Promise<Verdict>}
 */
export async function evaluateNeed({ api, repo, pr, destructive }) {
  if (!destructive)
    return {
      pass: true,
      message: "The SQL is not destructive: no label needed.",
    };
  const verdict = await evaluateGate({ api, repo, pr });
  if (!verdict.pass) return verdict;
  const state = labelState(
    await apiAll(api, `/repos/${repo}/issues/${pr}/timeline`),
  );
  const approval = await readApproval(api, repo, pr);
  const fingerprint = await currentFingerprint(api, repo, pr);
  const pass =
    state.present &&
    approval?.fingerprint === fingerprint &&
    approval.approver === state.actor &&
    approval.event === (await labelEvent(api, repo, pr)) &&
    (await isDevops(api, repo, approval.approver));
  return {
    pass: Boolean(pass),
    message: pass
      ? "The destructive SQL has a matching devops approval."
      : "The SQL is destructive. A devops member must read the current diff and apply the label again; a matching recorded approval is required.",
  };
}

/**
 * The PR number of a merge queue branch: `gh-readonly-queue/main/pr-123-<sha>`.
 *
 * @param {string} ref
 * @returns {number | undefined}
 */
export function pullFromQueueRef(ref) {
  const match =
    /gh-readonly-queue\/[^/]+(?:\/[^/]+)*?\/pr-(\d+)-[0-9a-f]+$/.exec(ref);
  return match ? Number(match[1]) : undefined;
}

/* c8 ignore start */
async function cli(argv) {
  const [command, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i === -1 ? undefined : rest[i + 1];
  };
  const repo = flag("--repo");
  const token = process.env.GH_TOKEN;
  if (!repo || !token) {
    process.stderr.write("--repo and GH_TOKEN are required\n");
    return 2;
  }
  const api = createApi({ token });
  const pr = flag("--pr")
    ? Number(flag("--pr"))
    : pullFromQueueRef(flag("--ref") ?? "");
  if (!pr) {
    // A push or a manual run with no pull request behind it: nothing to read.
    process.stdout.write(
      "No pull request for this run: label check skipped.\n",
    );
    return 0;
  }
  if (command === "gate") {
    let verdict = await evaluateGate({ api, repo, pr });
    if (verdict.pass && rest.includes("--record")) {
      verdict = await reconcileApproval({
        api,
        request: createRequest({ token }),
        repo,
        pr,
        action: flag("--action"),
        head: flag("--head"),
      });
    }
    process.stdout.write(`${verdict.message}\n`);
    if (verdict.reject && rest.includes("--remove-rejected")) {
      const request = createRequest({ token });
      await request("DELETE", `/repos/${repo}/issues/${pr}/labels/${LABEL}`);
      process.stdout.write(`Removed the \`${LABEL}\` label.\n`);
    }
    return verdict.pass ? 0 : 1;
  }
  if (command === "need") {
    const verdict = await evaluateNeed({
      api,
      repo,
      pr,
      destructive: flag("--destructive") === "true",
    });
    process.stdout.write(`${verdict.message}\n`);
    return verdict.pass ? 0 : 1;
  }
  process.stderr.write("usage: destructive-label.mjs <gate|need> ...\n");
  return 2;
}

if (isMain(import.meta.url)) {
  cli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`destructive-label: ${error.message}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
