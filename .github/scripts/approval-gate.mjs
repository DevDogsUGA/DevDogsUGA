/**
 * The production self-approval gate (TASK-489, Q61).
 *
 * GitHub's "prevent self-review" on the `production` environment only knows
 * who triggered the run. A deploy PR is authored by the deploy GitHub App and
 * merged through the merge queue by a person, so the run's actor says little
 * about who is allowed to approve it. This asks the questions GitHub does not:
 * who approved the `production` deployment of this run, and is any of them the
 * author of the pull request that produced this commit, or the person who put
 * it in the merge queue? If so the job fails before it changes anything.
 *
 * A push with no pull request behind it (an admin bypass) has no author or
 * enqueuer to compare against; there the native prevent-self-review is the
 * whole gate, and this says so and passes.
 *
 * An admin's bypass of the environment ("bypass protection rules", recorded
 * with state `skipped`) passes, with a warning naming who bypassed. A bypass
 * is an admin deliberately overriding the review, author or not; refusing it
 * here would leave admins no way to ship a change nobody else can approve.
 * GitHub offers the bypass to repository admins only.
 *
 * Fails closed when a pull request exists but neither an approval nor a bypass
 * of the environment is on record: it could not tell who let the deploy
 * through, and that is not a pass.
 *
 * Usage (in the `production` job, first):
 *   GH_TOKEN=... node .github/scripts/approval-gate.mjs \
 *     --repo OWNER/REPO --run-id N --sha SHA [--environment production]
 */
import { pathToFileURL } from "node:url";
import { apiAll, createApi } from "./github-api.mjs";

/** @param {string} login */
const norm = (login) => login.toLowerCase();

/**
 * Logins that approved `environment`, from `GET .../runs/{id}/approvals`.
 * Rejections and approvals of other environments (a run can carry several
 * gates) do not count. `state` "skipped" lists the admins who bypassed it.
 *
 * @param {Array<{ state?: string, user?: { login?: string } | null, environments?: Array<{ name?: string }> }>} approvals
 * @param {string} environment
 * @param {"approved" | "skipped"} [state]
 * @returns {string[]}
 */
export function approversOf(approvals, environment, state = "approved") {
  const logins = new Set();
  for (const approval of approvals) {
    if (approval.state !== state) continue;
    if (!(approval.environments ?? []).some((e) => e.name === environment)) {
      continue;
    }
    if (approval.user?.login) logins.add(approval.user.login);
  }
  return [...logins];
}

/**
 * The pull requests that produced `sha` on the default branch: the one whose
 * merge commit it is, else every merged PR GitHub associates with the commit
 * (a rebase merge can land under another SHA). Open PRs that merely contain
 * the commit are never candidates.
 *
 * @param {Array<{ number: number, merge_commit_sha?: string | null, merged_at?: string | null, user?: { login?: string } | null }>} pulls
 * @param {string} sha
 */
export function producingPulls(pulls, sha) {
  const exact = pulls.filter((pr) => pr.merge_commit_sha === sha);
  if (exact.length > 0) return exact;
  return pulls.filter((pr) => Boolean(pr.merged_at));
}

/**
 * Who put the PR in the merge queue: the actor of the last
 * `added_to_merge_queue` timeline event (a PR dequeued and queued again by
 * someone else was queued by the later person), or undefined.
 *
 * @param {Array<{ event?: string, actor?: { login?: string } | null }>} timeline
 * @returns {string | undefined}
 */
export function enqueuerOf(timeline) {
  const events = timeline.filter((e) => e.event === "added_to_merge_queue");
  return events.at(-1)?.actor?.login;
}

/**
 * @typedef {{ pass: boolean, notes: string[], failures: string[], warnings: string[] }} GateResult
 */

/**
 * @param {{
 *   api: (path: string) => Promise<any>,
 *   repo: string,
 *   runId: string,
 *   sha: string,
 *   environment?: string,
 * }} options
 * @returns {Promise<GateResult>}
 */
export async function evaluateGate({
  api,
  repo,
  runId,
  sha,
  environment = "production",
}) {
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const warnings = [];

  const pulls = producingPulls(
    await apiAll(api, `/repos/${repo}/commits/${sha}/pulls`),
    sha,
  );
  if (pulls.length === 0) {
    notes.push(
      `No merged pull request produced ${sha}: a direct push. The ` +
        `environment's own prevent-self-review is the gate.`,
    );
    return { pass: true, notes, failures, warnings };
  }

  /** @type {Map<string, string[]>} login (lowercase) -> why it may not approve */
  const barred = new Map();
  /** @param {string | undefined} login @param {string} reason */
  const bar = (login, reason) => {
    if (!login) return;
    const key = norm(login);
    barred.set(key, [...(barred.get(key) ?? []), reason]);
  };
  for (const pr of pulls) {
    bar(pr.user?.login, `authored #${pr.number}`);
    const timeline = await apiAll(
      api,
      `/repos/${repo}/issues/${pr.number}/timeline`,
    );
    const enqueuer = enqueuerOf(timeline);
    if (enqueuer === undefined) {
      notes.push(`#${pr.number}: no merge-queue event on its timeline.`);
    }
    bar(enqueuer, `queued #${pr.number}`);
  }

  const approvals = await apiAll(
    api,
    `/repos/${repo}/actions/runs/${runId}/approvals`,
  );
  const approvers = approversOf(approvals, environment);
  const bypassers = approversOf(approvals, environment, "skipped");
  if (approvers.length === 0 && bypassers.length > 0) {
    warnings.push(
      `${environment} was not approved: ${bypassers.join(", ")} bypassed it ` +
        `as an admin. The author and enqueuer check does not apply to a bypass.`,
    );
    return { pass: true, notes, failures, warnings };
  }
  if (approvers.length === 0) {
    failures.push(
      `No approval or admin bypass of the ${environment} environment is on record for run ` +
        `${runId}, so the approver cannot be checked against the PR author ` +
        `and enqueuer. Refusing.`,
    );
    return { pass: false, notes, failures, warnings };
  }

  notes.push(`${environment} approved by: ${approvers.join(", ")}.`);
  for (const approver of approvers) {
    const reasons = barred.get(norm(approver));
    if (reasons) {
      failures.push(
        `${approver} approved ${environment} but ${reasons.join(" and ")}. ` +
          `Someone else has to approve this deploy.`,
      );
    }
  }
  return { pass: failures.length === 0, notes, failures, warnings };
}

/** @param {string[]} argv @param {string} name */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = flag(argv, "--repo");
  const runId = flag(argv, "--run-id");
  const sha = flag(argv, "--sha");
  const environment = flag(argv, "--environment") ?? "production";
  const token = process.env.GH_TOKEN;
  if (!repo || !runId || !sha || !token) {
    console.error(
      "usage: GH_TOKEN=... approval-gate.mjs --repo OWNER/REPO --run-id N --sha SHA [--environment NAME]",
    );
    process.exit(2);
  }
  const result = await evaluateGate({
    api: createApi({ token }),
    repo,
    runId,
    sha,
    environment,
  });
  for (const note of result.notes) console.log(note);
  for (const warning of result.warnings) console.log(`::warning::${warning}`);
  for (const failure of result.failures) console.error(`::error::${failure}`);
  if (!result.pass) process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
