/**
 * `backstage github rulesets` — TASK-322.
 *
 * Prints the diff between the fixed rulesets `desired.ts` declares (the
 * `main-*` set and the tag rulesets) and what `gh api .../rulesets`
 * actually reports.
 * Defaults to a dry-run plan; `--apply` writes it, gated behind a
 * confirmation unless `--yes`.
 *
 * Never touches a per-team ruleset (`teamRulesetName()`'s `team/<slug>`) —
 * those are leftovers of the removed Teams feature (a human deletes them),
 * not this command's — and never deletes or
 * creates anything outside `desired.ts`'s names plus its explicit deletions
 * (`DELETE_RULESET_NAMES`, which includes the Teams-era `team/**`). See `diff.ts`'s header for the full
 * classification.
 */
import { confirm } from "@clack/prompts";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { resolveAppId, resolveTeamId } from "./actors.js";
import {
  createRuleset,
  deleteRuleset,
  getFileContent,
  getRuleset,
  listRulesets,
  updateRuleset,
  type Repo,
} from "./api.js";
import {
  buildDesiredRulesets,
  isPerTeamRulesetName,
  isProductRepo,
  PRODUCT_REPOS,
  type RulesetActors,
} from "./desired.js";
import {
  applyGates,
  hasMergeGroupTrigger,
  type MergeQueueGate,
} from "./gates.js";
import { planHasChanges, planRulesets, type RulesetPlan } from "./diff.js";
import type { DesiredRuleset, LiveRuleset, Rule } from "./types.js";
import { unwrap } from "@devdogsuga/cli-core/ui";

const DEFAULT_ORG = "DevDogsUGA";
const DEFAULT_REPO = "DevDogsUGA";
const DEFAULT_DEVOPS_SLUG = "devops";
const DEFAULT_ADMINS_SLUG = "admins";
/**
 * The club's own Renovate App, which .github/workflows/renovate.yaml signs in
 * as (TASK-299); it replaced Mend's hosted `renovate` App. May not exist yet.
 */
const DEFAULT_RENOVATE_SLUG = "devdogs-renovate";
/** Backstage's deploy-PR App; the wizard creates it, so it may not exist yet. */
const DEFAULT_DEPLOY_PR_SLUG = "devdogs-deploy-pr";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yaml";

interface RulesetsOptions {
  org: string;
  repo: string;
  apply: boolean;
  yes: boolean;
  json: boolean;
}

function parseOptions(argv: readonly string[]): RulesetsOptions {
  const opts: RulesetsOptions = {
    org: DEFAULT_ORG,
    repo: DEFAULT_REPO,
    apply: false,
    yes: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org") opts.org = argv[++i] ?? opts.org;
    else if (arg === "--repo") opts.repo = argv[++i] ?? opts.repo;
    else if (arg === "--apply") opts.apply = !isDryRun();
    else if (arg === "--yes") opts.yes = true;
    else if (arg === "--json") opts.json = true;
  }
  return opts;
}

/**
 * Fetches full detail for every live ruleset EXCEPT per-team ones —
 * `diff.ts`'s `planRulesets` never reads past a per-team ruleset's name, and
 * there can be up to ~70 of them, so fetching each would be up to ~70 extra
 * GETs this reconciler has no use for.
 */
async function fetchDetails(
  r: Repo,
  summaries: readonly { id: number; name: string }[],
): Promise<Map<number, LiveRuleset>> {
  const details = new Map<number, LiveRuleset>();
  for (const s of summaries) {
    if (isPerTeamRulesetName(s.name)) continue;
    details.set(s.id, await getRuleset(r, s.id));
  }
  return details;
}

function renderRuleLine(rule: { type: string }): string {
  return rule.type;
}

/**
 * One line per rule, with the parameters a reviewer cares about spelled out,
 * so a changed status check or merge method shows up in a dry run's diff.
 */
export function describeRule(rule: Rule): string {
  switch (rule.type) {
    case "required_status_checks":
      return `required_status_checks [${rule.parameters.required_status_checks
        .map((c) => c.context)
        .sort()
        .join(", ")}]`;
    case "pull_request":
      return `pull_request (merge: ${[...rule.parameters.allowed_merge_methods].sort().join("/")}, approvals: ${rule.parameters.required_approving_review_count}, code owners: ${rule.parameters.require_code_owner_review})`;
    case "merge_queue":
      return `merge_queue (${rule.parameters.merge_method}, up to ${rule.parameters.max_entries_to_merge})`;
    default:
      return rule.type;
  }
}

function describeActor(a: {
  actor_id: number;
  actor_type: string;
  bypass_mode: string;
}): string {
  return `${a.actor_type}#${a.actor_id} (${a.bypass_mode})`;
}

/** Added and removed lines between two sets of strings, `+ x` / `- y`. */
function setDiff(label: string, before: string[], after: string[]): string[] {
  const out: string[] = [];
  for (const line of after)
    if (!before.includes(line)) out.push(`    + ${label} ${line}`);
  for (const line of before)
    if (!after.includes(line)) out.push(`    - ${label} ${line}`);
  return out;
}

/** What an update changes, from the live ruleset to the desired one. */
export function renderChange(live: LiveRuleset, desired: DesiredRuleset) {
  return [
    ...setDiff(
      "rule  ",
      live.rules.map(describeRule),
      desired.rules.map(describeRule),
    ),
    ...setDiff(
      "bypass",
      live.bypass_actors.map(describeActor),
      desired.bypass_actors.map(describeActor),
    ),
    ...setDiff(
      "ref   ",
      [
        ...live.conditions.ref_name.include.map((x) => `include ${x}`),
        ...live.conditions.ref_name.exclude.map((x) => `exclude ${x}`),
      ],
      [
        ...desired.conditions.ref_name.include.map((x) => `include ${x}`),
        ...desired.conditions.ref_name.exclude.map((x) => `exclude ${x}`),
      ],
    ),
  ];
}

function renderDesired(desired: {
  name: string;
  rules: readonly { type: string }[];
  bypass_actors: readonly {
    actor_id: number;
    actor_type: string;
    bypass_mode: string;
  }[];
}): string[] {
  return [
    `    rules:   ${desired.rules.map(renderRuleLine).join(", ")}`,
    `    bypass:  ${
      desired.bypass_actors.length === 0
        ? "(none)"
        : desired.bypass_actors
            .map((a) => `${a.actor_type}#${a.actor_id} (${a.bypass_mode})`)
            .join(", ")
    }`,
  ];
}

export function renderPlan(plan: RulesetPlan): string {
  const lines: string[] = [];

  for (const create of plan.creates) {
    lines.push(`+ create   "${create.desired.name}"`);
    lines.push(...renderDesired(create.desired));
  }
  for (const update of plan.updates) {
    const renameNote =
      update.liveName !== update.desired.name
        ? ` (renamed from "${update.liveName}")`
        : "";
    lines.push(
      `~ update   "${update.desired.name}"${renameNote} [id ${update.id}]`,
    );
    if (update.live) {
      const change = renderChange(update.live, update.desired);
      lines.push(
        ...(change.length > 0
          ? change
          : ["    (only the name or a default differs)"]),
      );
    } else {
      lines.push(...renderDesired(update.desired));
    }
  }
  for (const del of plan.deletes) {
    lines.push(`- delete   "${del.name}" [id ${del.id}]`);
  }
  for (const noop of plan.noops) {
    lines.push(`= ok       "${noop.name}" [id ${noop.id}] — already matches`);
  }
  if (plan.perTeamSkipped.length > 0) {
    lines.push(
      `  skipped  ${plan.perTeamSkipped.length} legacy per-team ruleset(s), left for a human to delete: ` +
        plan.perTeamSkipped.join(", "),
    );
  }
  if (plan.unmanaged.length > 0) {
    lines.push(
      `  unmanaged  ${plan.unmanaged.join(", ")} — not a fixed ruleset or a deletion target, left alone`,
    );
  }
  for (const b of plan.blocked ?? []) {
    lines.push(`! blocked  "${b.name}" — ${b.reason}`);
  }
  for (const note of plan.notes ?? []) {
    lines.push(`  note     ${note}`);
  }
  if (lines.length === 0) return "(nothing to report)";
  return lines.join("\n");
}

async function confirmApply(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "backstage github rulesets: --yes is required to apply with no terminal available.\n",
    );
    return false;
  }
  return unwrap(
    await confirm({
      message: "Apply this ruleset plan?",
      initialValue: false,
    }),
  );
}

/** The repositories `--repo all` covers: the three that keep a ruleset set after the fold-back. */
export const ALL_REPOS = ["DevDogsUGA", ...PRODUCT_REPOS] as const;

/** A repository that does not exist yet reads as a 404 from `gh api`. */
function isMissingRepo(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b404\b|Not Found/.test(message);
}

/**
 * `--repo all`: the dry-run diff for every repository in one go. Read-only by
 * construction: applying to three repositories at once is not something to do
 * with one flag.
 */
async function runAll(argv: readonly string[], opts: RulesetsOptions) {
  if (opts.apply) {
    process.stderr.write(
      "backstage github rulesets: --repo all is a dry run only; apply one repository at a time.\n",
    );
    return 1;
  }
  let worst = 0;
  for (const repo of ALL_REPOS) {
    console.log(`\n=== ${opts.org}/${repo} ===`);
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--repo") i++;
      else rest.push(argv[i]!);
    }
    worst = Math.max(worst, await runGithubRulesets([...rest, "--repo", repo]));
  }
  return worst;
}

export async function runGithubRulesets(
  argv: readonly string[],
): Promise<number> {
  const opts = parseOptions(argv);
  if (opts.repo === "all") return runAll(argv, opts);
  const r: Repo = { owner: opts.org, repo: opts.repo };

  const backstage = opts.repo === "Backstage";
  const product = isProductRepo(opts.repo);
  if (!backstage && !product && opts.repo !== "DevDogsUGA") {
    process.stderr.write(
      `backstage github rulesets: no desired rulesets for repo "${opts.repo}" (managed: DevDogsUGA, Backstage, ${PRODUCT_REPOS.join(", ")}, or "all").\n`,
    );
    return 1;
  }

  let devopsTeamId: number;
  let focusLeadsTeamId: number;
  let adminsTeamId: number;
  try {
    [devopsTeamId, focusLeadsTeamId, adminsTeamId] = await Promise.all([
      resolveTeamId(opts.org, DEFAULT_DEVOPS_SLUG),
      resolveTeamId(opts.org, "focus-leads"),
      resolveTeamId(opts.org, DEFAULT_ADMINS_SLUG),
    ]);
  } catch (err) {
    process.stderr.write(
      `backstage github rulesets: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const notes: string[] = [];
  let renovateAppId: number | undefined;
  let deployPrAppId: number | undefined;
  if (backstage) {
    // Renovate's installation on Backstage is not readable (the installation
    // repository list needs the App's own token), so it is never a bypass
    // actor here. The deploy-PR App may not exist yet; its ruleset is then
    // skipped with a note.
    try {
      deployPrAppId = await resolveAppId(opts.org, DEFAULT_DEPLOY_PR_SLUG);
    } catch {
      notes.push(
        `ruleset "deploy/devdogsuga" skipped: the "${DEFAULT_DEPLOY_PR_SLUG}" App is not installed in ${opts.org} — create the App first (wizard). ` +
          `Until then "~ALL" still covers deploy/devdogsuga (the App is not a bypass actor on it, so it cannot create or push the branch).`,
      );
    }
  } else {
    // Renovate (TASK-299) is resolved SEPARATELY and is allowed to fail: Sloan
    // may not have installed it yet, and that must not block reconciling
    // everything else. A failure here prints a warning and the plan simply
    // omits it from `main-reviews`' bypass list — re-running after the App is
    // installed picks it up with no further action.
    try {
      renovateAppId = await resolveAppId(opts.org, DEFAULT_RENOVATE_SLUG);
    } catch (err) {
      process.stderr.write(
        `backstage github rulesets: warning: could not resolve the Renovate App ` +
          `("${DEFAULT_RENOVATE_SLUG}") — main-reviews' plan omits it as a bypass actor ` +
          `until it is installed (TASK-299). ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const actors: RulesetActors = {
    devopsTeamId,
    focusLeadsTeamId,
    adminsTeamId,
    renovateAppId,
    deployPrAppId,
  };
  const desired = buildDesiredRulesets(
    actors,
    backstage
      ? "Backstage"
      : isProductRepo(opts.repo)
        ? opts.repo
        : "DevDogsUGA",
  );

  // A repository that is not created yet (DogDays and DogPack before stage 4)
  // has no live rulesets: the plan is every ruleset as a create, which is the
  // diff Sloan reads before the repository exists. Applying is refused.
  let summaries: Awaited<ReturnType<typeof listRulesets>> = [];
  let details = new Map<number, LiveRuleset>();
  let missing = false;
  try {
    summaries = await listRulesets(r);
    details = await fetchDetails(r, summaries);
  } catch (err) {
    if (product && isMissingRepo(err)) {
      missing = true;
      notes.push(
        `${opts.org}/${opts.repo} does not exist yet: every ruleset below is a create, and --apply is refused until the repository exists.`,
      );
    } else {
      process.stderr.write(
        `backstage github rulesets: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  }

  // Every repo with a merge queue is gated on its own CI having a
  // `merge_group` trigger.
  let gate: MergeQueueGate;
  try {
    const ci = await getFileContent(r, CI_WORKFLOW_PATH);
    gate =
      ci !== null && hasMergeGroupTrigger(ci)
        ? { ready: true, reason: "" }
        : {
            ready: false,
            reason: `merge queue not enabled: ${opts.org}/${opts.repo}'s default-branch ${CI_WORKFLOW_PATH} ${ci === null ? "was not found" : "has no merge_group trigger"} (push the commit adding it first)`,
          };
  } catch (err) {
    gate = {
      ready: false,
      reason: `merge queue not enabled: could not read ${CI_WORKFLOW_PATH} (${err instanceof Error ? err.message : String(err)})`,
    };
  }

  const plan = applyGates(
    planRulesets(summaries, details, actors, desired),
    // A missing repository has no CI to read; the queue is not withheld, the
    // whole apply is.
    missing ? null : gate,
    notes,
  );

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }

  if (!opts.apply) {
    if (!opts.json && planHasChanges(plan)) {
      console.log("\n(dry run — pass --apply to write this plan)");
    }
    return 0;
  }

  if (!planHasChanges(plan)) return 0;

  if (missing) {
    process.stderr.write(
      `backstage github rulesets: ${opts.org}/${opts.repo} does not exist; nothing was applied.\n`,
    );
    return 1;
  }

  if (!(await confirmApply(opts.yes))) return 1;

  try {
    for (const create of plan.creates) {
      await createRuleset(r, create.desired);
    }
    for (const update of plan.updates) {
      await updateRuleset(r, update.id, update.desired);
    }
    for (const del of plan.deletes) {
      await deleteRuleset(r, del.id);
    }
  } catch (err) {
    process.stderr.write(
      `backstage github rulesets: apply failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  console.log("Applied.");
  return 0;
}
