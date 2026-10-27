import type { DesiredRuleset } from "./types.js";

/** Numeric actors resolved from the live organization before planning. */
export interface RulesetActors {
  devopsTeamId: number;
  focusLeadsTeamId: number;
  adminsTeamId: number;
  renovateAppId?: number;
  /**
   * The deploy-PR App (`devdogs-deploy-pr`), which force-pushes
   * `deploy/devdogsuga`. Absent until the App is created and installed;
   * Backstage's `deploy/devdogsuga` ruleset is then skipped.
   */
  deployPrAppId?: number;
}

export type RulesetRepo = "DevDogsUGA" | "Backstage" | "DogDays" | "DogPack";

/** The product repositories (Q40): no `team/**` branches. */
export const PRODUCT_REPOS = ["DogDays", "DogPack"] as const;
export type ProductRepo = (typeof PRODUCT_REPOS)[number];

export function isProductRepo(repo: string): repo is ProductRepo {
  return (PRODUCT_REPOS as readonly string[]).includes(repo);
}

/** The Actions app's id on the `required_status_checks` rule. */
const ACTIONS_APP = 15368;

/**
 * The checks the destructive gate adds (database-pr.yaml and
 * destructive-gate.yaml): required on every repository that has a database.
 * A pull request that drops data cannot merge without a devops member's label,
 * and a label from anyone else fails `destructive-gate`.
 */
export const DESTRUCTIVE_GATE_CHECKS = [
  "destructive-sql",
  "destructive-gate",
] as const;

/**
 * The destructive gate as a product repository reports it. A product calls
 * database-pr.yaml and destructive-gate.yaml as reusable workflows, and a
 * called workflow's job reports as `<caller job> / <called job>`, so the bare
 * `destructive-sql` and `destructive-gate` can never appear there. The caller
 * of database-pr.yaml is named `destructive-gate`
 * (docs/operations/repositories/product-ci.md has the workflow files), and it
 * reports both names on a pull request and on the queue. destructive-gate.yaml
 * (which removes a label from a non-devops applier) is called from a job named
 * `destructive-label` and is not required, so no required name is ever
 * reported twice on one commit.
 */
export const PRODUCT_DESTRUCTIVE_GATE_CHECKS = [
  "destructive-gate / destructive-sql",
  "destructive-gate / destructive-gate",
] as const;

/**
 * Required status checks per product repository. The product repositories'
 * CI (stage 4) must name its jobs to match; a check that no workflow reports
 * would hold every pull request forever, which is why `backstage github
 * rulesets` refuses to apply a merge-queue rule before the repository's CI
 * has a `merge_group` trigger.
 */
export const PRODUCT_REQUIRED_CHECKS: Readonly<
  Record<ProductRepo, readonly string[]>
> = {
  DogDays: ["validate", "database", ...PRODUCT_DESTRUCTIVE_GATE_CHECKS],
  DogPack: [
    "validate",
    "flutter",
    "database",
    ...PRODUCT_DESTRUCTIVE_GATE_CHECKS,
  ],
};

/**
 * DevDogsUGA's required checks. `format` is a step of `validate`, not a job of
 * its own; the catalog/patch drift check is the `toolchain` job; `dart-sdk`
 * (the Dart SDK's analysis, tests and publish dry run) runs on every pull
 * request and queue entry, only the schedule skips it.
 */
export const DEVDOGSUGA_REQUIRED_CHECKS: readonly string[] = [
  "validate",
  "database",
  "toolchain",
  "dart-sdk",
  ...DESTRUCTIVE_GATE_CHECKS,
];

/** Earlier live names which occupy the same managed slot. */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> =
  {
    "main-reviews": ["main", "main-protection"],
  };

/** Obsolete fixed rulesets removed after the production-branch cutover. */
export const DELETE_RULESET_NAMES: readonly string[] = [
  "comp-branches",
  "production",
  // An update restriction on `main` refused the merge queue's own push (the
  // queue is not an actor a ruleset can name as a bypass), so the queue never
  // merged anything: every merge needed an admin bypass. `main-reviews` and
  // `main-merge-queue` already stop direct pushes, so it went (10-27).
  "main-updates",
  // `~ALL` locked every branch but `main` to the bypass teams. Its creation
  // rule refused the merge queue's own test branch (fixed by an exclusion),
  // and the products never had it, so DevDogsUGA dropped it to match (10-27).
  // Archived Backstage still defines it, and a desired name is never deleted.
  "~ALL",
  // DogDays' hand-made ruleset from before the managed ones; disabled.
  "Main Protection",
  // The Teams feature is gone (lane 3e).
  "team/**",
];

export function isPerTeamRulesetName(name: string): boolean {
  return name.startsWith("team/") && name !== "team/**";
}

const main = { ref_name: { include: ["refs/heads/main"], exclude: [] } };

const always = (actor_id: number) => ({
  actor_id,
  actor_type: "Team" as const,
  bypass_mode: "always" as const,
});

/**
 * Fixed DevDogsUGA rulesets.
 *
 * The main policy is deliberately split. A bypass actor bypasses every rule
 * in one ruleset, so combining immutable history, PR reviews and CI
 * would make a direct-push exception an accidental force-push exception too.
 */
export function buildDesiredRulesets(
  actors: RulesetActors,
  repo: RulesetRepo = "DevDogsUGA",
): DesiredRuleset[] {
  if (isProductRepo(repo)) return buildProductRulesets(actors, repo);
  return repo === "Backstage"
    ? buildBackstageRulesets(actors)
    : buildDevDogsUgaRulesets(actors);
}

/**
 * The four rulesets on `main` that every managed repository shares (Q11, Q40,
 * TASK-334, TASK-342); only the required checks differ.
 *
 * - `main-integrity` has no bypass actor, so nobody can delete `main`,
 *   force-push it, or push an unsigned commit to it. An owner who pushes
 *   directly needs a signing key (the runbook says how). The merge queue's
 *   squash commits are signed by GitHub.
 * - `main-reviews`: pull requests only, one approving review from a code
 *   owner, squash merges only. Renovate may open its own pull requests past
 *   the review count (`pull_request`, never a push); admins always bypass.
 * - `main-ci`: `requiredChecks`, all reported by GitHub Actions.
 * - `main-merge-queue`: queue-only, so admins can still push directly past it.
 *
 * Nothing restricts creating or updating other branches (`~ALL` went 10-27),
 * and nothing restricts updating `main` itself: either kind of rule refuses
 * the merge queue, which no ruleset can name as a bypass actor.
 */
function mainRulesets(
  actors: RulesetActors,
  requiredChecks: readonly string[],
): DesiredRuleset[] {
  return [
    {
      name: "main-integrity",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        { type: "required_signatures" },
      ],
    },
    {
      name: "main-reviews",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [
        ...(actors.renovateAppId === undefined
          ? []
          : [
              {
                actor_id: actors.renovateAppId,
                actor_type: "Integration" as const,
                bypass_mode: "pull_request" as const,
              },
            ]),
        always(actors.adminsTeamId),
      ],
      rules: [
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["squash"],
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true,
          },
        },
      ],
    },
    {
      name: "main-ci",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            do_not_enforce_on_create: false,
            strict_required_status_checks_policy: false,
            required_status_checks: requiredChecks.map((context) => ({
              context,
              integration_id: ACTIONS_APP,
            })),
          },
        },
      ],
    },
    mainMergeQueueRuleset(actors),
  ];
}

/**
 * The product repositories' rulesets: the shared four with
 * PRODUCT_REQUIRED_CHECKS. No tag rulesets: the publish workflows tag releases
 * with `GITHUB_TOKEN`, which GitHub refuses as a bypass actor.
 */
function buildProductRulesets(
  actors: RulesetActors,
  repo: ProductRepo,
): DesiredRuleset[] {
  return mainRulesets(actors, PRODUCT_REQUIRED_CHECKS[repo]);
}

/**
 * Merge queue parameters for `main` (Backstage and DevDogsUGA share them): squash (matching
 * `main-reviews`' squash-only), ALLGREEN grouping (every entry in a group
 * must pass), up to 5 entries built and merged together, merge as soon as 1
 * entry is ready after waiting 5 minutes for more, 60 minute check timeout.
 */
export const BACKSTAGE_MERGE_QUEUE = {
  type: "merge_queue",
  parameters: {
    check_response_timeout_minutes: 60,
    grouping_strategy: "ALLGREEN",
    max_entries_to_build: 5,
    max_entries_to_merge: 5,
    merge_method: "SQUASH",
    min_entries_to_merge: 1,
    min_entries_to_merge_wait_minutes: 5,
  },
} as const;

/** Rule types that gate `--apply` on the target repo's CI having a `merge_group` trigger. */
export function hasMergeQueueRule(ruleset: DesiredRuleset): boolean {
  return ruleset.rules.some((r) => r.type === "merge_queue");
}

/**
 * Backstage's fixed rulesets. Same split as DevDogsUGA's (a bypass actor
 * bypasses every rule in its ruleset), with:
 *
 * - `main-merge-queue` on its own: admins must still push directly
 *   (TASK-478), and a queue-only ruleset lets them bypass the queue without
 *   widening any other rule's bypass.
 * - `deploy/devdogsuga`: only admins and the deploy-PR App bypass, and the
 *   App bypasses `always` because it creates, force-pushes and updates the
 *   branch; every other actor is blocked from all four operations. Omitted
 *   (and `~ALL` then covers the branch) until the App is installed.
 * - no Renovate bypass: its install on Backstage is not readable from here.
 * - no `team/**` rulesets (a DevDogsUGA concern).
 */
// The merge queue tests each entry on a branch it creates itself,
// `gh-readonly-queue/main/pr-<n>-<sha>`, as `github-merge-queue[bot]`, which
// no ruleset can name as a bypass. `~ALL`'s creation rule refused that branch,
// so every queued pull request was dropped with `branch_protection_failure`
// before a check started (10-27). Only GitHub writes these branches.
const MERGE_QUEUE_BRANCHES = "refs/heads/gh-readonly-queue/**";

// npm releases (`@devdogsuga/<pkg>@x.y.z`) and the extension's
// (`workshops-vscode@x.y.z`, scripts/publish-workshops-vscode.mjs): both are
// pushed by the publish job with GITHUB_TOKEN.
const RELEASE_TAGS = [
  "refs/tags/@devdogsuga/**",
  "refs/tags/workshops-vscode@*",
];

function buildBackstageRulesets(actors: RulesetActors): DesiredRuleset[] {
  const deployBranch = "refs/heads/deploy/devdogsuga";
  const deployRuleset: DesiredRuleset[] =
    actors.deployPrAppId === undefined
      ? []
      : [
          {
            name: "deploy/devdogsuga",
            target: "branch",
            enforcement: "active",
            conditions: {
              ref_name: { include: [deployBranch], exclude: [] },
            },
            bypass_actors: [
              {
                actor_id: actors.deployPrAppId,
                actor_type: "Integration",
                bypass_mode: "always",
              },
              always(actors.adminsTeamId),
            ],
            rules: [
              {
                type: "update",
                parameters: { update_allows_fetch_and_merge: false },
              },
              { type: "creation" },
              { type: "deletion" },
              { type: "non_fast_forward" },
            ],
          },
        ];
  return [
    {
      name: "main-integrity",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
    {
      name: "main-reviews",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["squash"],
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true,
          },
        },
      ],
    },
    {
      name: "main-ci",
      target: "branch",
      enforcement: "active",
      conditions: main,
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [
        {
          type: "required_status_checks",
          parameters: {
            do_not_enforce_on_create: false,
            strict_required_status_checks_policy: false,
            // `database` and `toolchain` joined `validate` when the platform
            // moved in (TASK-478): the DB-backed platform tests and the
            // catalog/patch drift check against DevDogsUGA. `patch-issues`
            // runs on the schedule only and must never be required.
            required_status_checks: [
              { context: "validate", integration_id: 15368 },
              { context: "database", integration_id: 15368 },
              { context: "toolchain", integration_id: 15368 },
            ],
          },
        },
      ],
    },
    mainMergeQueueRuleset(actors),
    {
      name: "~ALL",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["~ALL"],
          // Excluding the deploy branch only once its own ruleset exists —
          // until then `~ALL` keeps protecting it from everyone but the
          // admins, devops and focus-leads bypass teams.
          exclude: [
            "refs/heads/main",
            MERGE_QUEUE_BRANCHES,
            ...(deployRuleset.length > 0 ? [deployBranch] : []),
          ],
        },
      },
      bypass_actors: [
        always(actors.focusLeadsTeamId),
        always(actors.devopsTeamId),
        always(actors.adminsTeamId),
      ],
      rules: [
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
        { type: "creation" },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
    ...deployRuleset,
    {
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/tags/**"], exclude: RELEASE_TAGS },
      },
      bypass_actors: [always(actors.adminsTeamId), always(actors.devopsTeamId)],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
    // The publish job tags every release it creates (`<name>@<version>`) with
    // `GITHUB_TOKEN`, and GitHub refuses GitHub Actions as a bypass actor
    // (422). So release tags may be created by anyone who can push, but once
    // created never moved or deleted.
    {
      name: "release-tags",
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: RELEASE_TAGS, exclude: [] } },
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [{ type: "update" }, { type: "deletion" }],
    },
  ];
}

/** `main-merge-queue`: queue-only so admins can still push directly past it (TASK-478). */
function mainMergeQueueRuleset(actors: RulesetActors): DesiredRuleset {
  return {
    name: "main-merge-queue",
    target: "branch",
    enforcement: "active",
    conditions: main,
    bypass_actors: [always(actors.adminsTeamId)],
    rules: [
      {
        ...BACKSTAGE_MERGE_QUEUE,
        parameters: { ...BACKSTAGE_MERGE_QUEUE.parameters },
      },
    ],
  };
}

function buildDevDogsUgaRulesets(actors: RulesetActors): DesiredRuleset[] {
  return [
    ...mainRulesets(actors, DEVDOGSUGA_REQUIRED_CHECKS),
    {
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/tags/**"], exclude: RELEASE_TAGS },
      },
      bypass_actors: [always(actors.adminsTeamId), always(actors.devopsTeamId)],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
    // The stable publish job (ci.yaml -> publish.yaml) tags every release it
    // creates (`<name>@<version>`) with `GITHUB_TOKEN`, and GitHub refuses
    // GitHub Actions as a bypass actor (422). So release tags may be created
    // by anyone who can push, but once created never moved or deleted.
    {
      name: "release-tags",
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: RELEASE_TAGS, exclude: [] } },
      bypass_actors: [always(actors.adminsTeamId)],
      rules: [{ type: "update" }, { type: "deletion" }],
    },
  ];
}
