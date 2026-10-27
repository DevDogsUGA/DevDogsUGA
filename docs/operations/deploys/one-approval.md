---
name: One approval per deploy
description: How production asks for approval once per deploy instead of once per job, what it needs from GitHub, how to switch it on and off, and what it changes about destructive SQL, config pushes and unchanged Workers.
order: 8
section: infrastructure
---

# One approval per deploy

A production deploy used to pause at every job that named the `production` environment: the database, the catalog, the platform (DogDays and DogPack: the database and the Worker or the functions). Each pause also blocked the approver from reviewing their own push. The one-approval flow pauses once, after the builds and the database plan, and that approval covers the whole deployment.

It is **off until the repository variable `ONE_APPROVAL` is `true`**. Until then every workflow behaves as before, so nothing here changes a deploy by itself.

## Why it needs a GitHub change

GitHub asks for approval again at every job that names an environment with required reviewers. The ways around that, and why this design:

| Option                                                                                   | Verdict                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment: { name: production, deployment: false }` on the later jobs                 | Does not help. GitHub's docs: required reviewers and wait timers still apply with `deployment: false`; it only skips the deployment record.                                                                                                   |
| Fewer, bigger jobs                                                                       | Not enough. The database, each Worker and the functions are separate shared building blocks with their own smoke tests and rollbacks; merging them would lose the independent failure and rollback behaviour, and still pause once per block. |
| A reviewer-less twin of `production` (`production-deploy`) holding copies of the secrets | Works, but environment secrets cannot be read back, so Sloan would have to re-push every production secret and variable with `backstage env push`, for three repositories, and keep two copies in step.                                       |
| **Move the pause to its own environment and make `production` reviewer-less**            | **Chosen.** A new `production-approval` environment holds the reviewers and no secrets. `production` keeps its secrets and loses its reviewers. No secret is copied.                                                                          |

The cost of the chosen design is that `production` is no longer a gate by itself: any job on `main` that names it gets the production secrets. The environment keeps its branch rule (`main` only), `main` must be protected by a ruleset that requires a pull request with an approving review (see the next section; the workflows refuse to run the flow without one), and every production job in these workflows `needs` the approval job (including the Slides deck: `slides.yaml` has the same flag-gated `production-approval` and `deploy-approved` pair). Treat a change to a deploy workflow as a change to production access, and review it so.

## Hard prerequisite: main must be protected first

With step 3 done, nothing but `main` stands between a push and the production secrets. So **a repository must not take step 3 (or even step 2) until its `main` has an active ruleset that requires a pull request with at least one approving review.** That ruleset is Gate step 6.

| Repository | `main` protection today (2026-10-14)                                                                  | May it switch on?                             |
| ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DevDogsUGA | Check with `gh api repos/DevDogsUGA/DevDogsUGA/rules/branches/main` (must show a `pull_request` rule) | Only once that call shows the rule.           |
| DogDays    | `main-protection` ruleset (deletion and non-fast-forward only), no pull request rule                  | **No.** Apply the Gate step 6 rulesets first. |
| DogPack    | No rulesets, no branch protection                                                                     | **No.** Apply the Gate step 6 rulesets first. |

The workflows enforce it where they can: `approve-production.yaml` (both its `summary` and `approve` jobs, so before anyone is asked and again after) runs `.github/scripts/main-protection.mjs`, which reads `GET /repos/{repo}/rules/branches/{branch}` with the job token and **fails loudly** unless a `pull_request` rule with `required_approving_review_count >= 1` applies to the default branch. An unreadable answer also fails. What the token cannot see, so stays a manual prerequisite: classic branch protection (it needs admin to read, and does not count), and whether the ruleset has bypass actors (`reviewers` or `devops` members who may push straight to `main`; check Settings -> Rules -> the ruleset -> Bypass list, and leave it to admins only).

Switching on without the ruleset therefore ends in a failed `approve-production` and no production deploy, not in an open `production`. But step 3 is a click in GitHub's settings and the check only runs in a deploy: if you remove the reviewers from `production` first, a push that does not go through `approve-production` (a workflow that names `production` directly) is not stopped by this check. Keep the order below.

## The shape

```
builds -> staging deploy -> production-plan -> production-approval -> database apply -> catalog -> platform
                            (read-only)        (THE pause)             (no pause)       (no pause)
```

- `production-plan` (`plan-database.yaml`) reads the database with the planner credential and writes the migration and schema plans. A destructive plan with no pull request approval fails here, before anyone is asked.
- `production-approval` (`approve-production.yaml`) first writes one summary page, then pauses in `production-approval`. The summary shows, in order: the commit, the **destructive statements** (marked, with the pull request that approved them), the pending migrations and seeds, the schema SQL and its hash, and which Workers and functions the deploy will touch.
- After the approval the self-approval gate runs (the approver neither wrote nor queued the change) and `require_latest` (a commit that is no longer the head of `main` is refused). Both are also checked again by the database apply and by each Worker, against `production-approval`'s approvals.
- **An admin bypass passes.** An admin who uses "bypass protection rules" on `production-approval` instead of approving lets the deploy through even if they wrote or queued the change: the bypass is the deliberate override. The run shows a warning naming who bypassed. `require_latest` still applies. DogDays and DogPack get this once they move their pin of these workflows past `9ec22463`.
- `production-database-apply` (`apply-database.yaml`), then the catalog, then the platform, all in `production`.

A rejected approval changes nothing: planning only read. A newer commit merged during the wait supersedes the older run (its waiting `production-approval` job is cancelled by the next push's `supersede` job, and `require_latest` refuses it anyway).

When migrations are pending, the schema diff does not exist yet at approval time: it is computed against the database after the migrations are in. The summary says so; the apply recomputes the diff, writes it to the job summary, and refuses a destructive result the pull request did not approve. With nothing pending (the routine case) the diff is planned before the approval and hash-checked at the apply.

## Things that changed whatever the variable says

- **No destructive environments.** `production-destructive` and `staging-destructive` are no longer used. See [Destructive changes](./destructive-changes.md): the deploy refuses a destructive plan that no pull request approved.
- **The config push is skipped** when none of `supabase/config.toml`, `supabase/roles.sql`, a seed or `supabase/config-push.stamp` changed since the tier's last deploy (DevDogsUGA). `config.toml` reads the sign-in client secrets and `BASE_URL*` from the GitHub environment, so a rotated secret only reaches Supabase through a push: **after you change one of those values, edit `supabase/config-push.stamp` (any edit) in the commit that you deploy.** The credential runbooks say so. DogDays and DogPack decide on `config.toml` alone (or the `config` input of a manual run of their deploy workflow), and compare it with the commit production **last applied** (`.github/scripts/config-changed.mjs`: the newest `main` run whose `production-database(-apply) / apply` job succeeded), not with the previous commit. A config change in a candidate that was superseded or cancelled therefore stays pending until a deploy applies it. Any doubt (no earlier apply found, a commit git cannot reach, an API error) pushes.
- **What is verified about the config push:** the scope logic (`scopeOf`, `config-changed.mjs`) is unit-tested, and the apply job itself runs when no migration is pending. **The push to Supabase is not verified on staging:** staging holds no `SUPABASE_ACCESS_TOKEN`, so its apply job skips "Push the Supabase configuration" and runs "Supabase configuration skipped (no SUPABASE_ACCESS_TOKEN)" instead (seen in DevDogsUGA run 38504969981). The push path through the new scope has not run anywhere yet; its first real run is the first production deploy that changes `config.toml`, a seed, `roles.sql` or the stamp.
- **Unchanged Workers are skipped** (DevDogsUGA): the platform when every shipped change since the tier's last deploy is under `apps/catalog/`, the catalog when every one is under `apps/platform/` or `docs/`. A skipped Worker shows as an `unchanged` job and counts as current for the next deploy's comparison. Anything else, or anything the comparison cannot work out, deploys both.
- Plan and apply artifacts are named per environment (`plan-schema-production`), so staging and production in one run no longer collide.

## Slides

`slides.yaml` deploys the workshop deck to production through `deploy-worker.yaml`, outside `deploy.yaml`. With the flag on it runs `production-approval` (its own pause, same environment) and then `deploy-approved`; with the flag off, `deploy` asks through `production` as before. So the Slides deploy gets one approval of its own, separate from the platform deploy's, because it runs from a different workflow. Without this, switching step 3 on would make the self-approval gate fail every Slides deploy (no approval on record) or let a direct push through unreviewed.

## Destructive SQL needs a pull request approval, wherever it deploys

The deploy now refuses a destructive plan nobody approved on a pull request (see [Destructive changes](./destructive-changes.md)). The pull request's `db-check` plan is found from the merge queue run, else from the pull request's own run, so DogDays (no merge queue) and DogPack (no rulesets) work today. The check also assumes `destructive-sql` and `destructive-gate` are required on `main` (Gate step 6).

## Switching it on

**Per repository, and only after Gate step 6 has applied its `main` ruleset there** (see the prerequisite above; DogDays and DogPack do not have it today). Do these in order. The order matters: the first two steps change nothing, and the last one is what stops `production` asking.

1. **Create the environment `production-approval`** in each repository that deploys to production (DevDogsUGA, DogDays, DogPack): Settings -> Environments -> New environment. Required reviewers: the `devops` team. Prevent self-review: on. Deployment branches: selected branches, `main`. It holds no secrets or variables.
2. **Set the repository variable `ONE_APPROVAL` to `true`** in the same repositories (Settings -> Secrets and variables -> Actions -> Variables). From the next push, production runs the new jobs. `production` still has reviewers at this point, so each job still asks; you have changed the structure, not yet the number of clicks. Run one deploy like this if you want to see the summary first.
3. **Remove the required reviewers from the `production` environment** in the same repositories (Settings -> Environments -> production -> untick Required reviewers). Keep its deployment branch rule (`main`). From now on a production deploy asks once.

If you do step 3 before step 2, `production` is open to every job on `main` with no approval in front of it. Do not.

In DevDogsUGA, `pnpm backstage github settings --apply` can do step 1: `desired.ts` wants `production-approval` (reviewers `devops`, self-review prevented, `main` only) and creates it when missing. It reads `ONE_APPROVAL` too: while the variable is not `true` it checks `production` for reviewers, and once it is, it stops, so step 3 reads as no drift. It never writes reviewers onto an existing environment, so it cannot undo step 3. DogDays and DogPack are not managed by it; do step 1 there by hand.

To turn it off, delete the variable (or set it to anything but `true`) and put the required reviewers back on `production`. The old per-job flow is untouched.

## Still to do at Gate step 6

The one-approval flow and the PR-level destructive approval both lean on the Gate step 6 rulesets. In every deploying repository (DevDogsUGA, DogDays, DogPack):

1. Apply the `main` ruleset: pull request required with 1+ approving review, no direct pushes (bypass for admins only), and `destructive-sql` and `destructive-gate` as required status checks.
2. Check that each repository reports `destructive-gate` once per commit. Only `database-pr.yaml` reports it, on pull requests and the merge queue. `destructive-gate.yaml`'s job is `destructive-label` and is not required. A product repository must call it from a job named `destructive-label` and pin a DevDogsUGA commit that has this split (see [Product repository CI](../repositories/product-ci.md)).
3. Only then switch on `ONE_APPROVAL` (below).

## DogDays and DogPack

Both call the same shared workflows, pinned by commit SHA, with the same variable and the same environment. Their production jobs are `production-plan`, `production-approval`, `production-database-apply`, then (DogDays) the verify, the legacy copy and the Worker, or (DogPack) the functions. DogDays' staging has no approval and is unchanged.

The DogDays legacy copy (`production-copy`) reads `PLATFORM_DB_URL` from `production`; in the one-approval flow it `needs` the approval like everything else.

## Packages

Stable npm and pub.dev publishes (the `publishing` environment) keep their own approval. A merge that changes both a deploy and a package pauses twice: once for the deploy, once for the publish. Prereleases (`publishing-next`) are unchanged.

## Checking it worked

On the first deploy with the flow on, the run should show exactly one waiting job, named `deploy / production-approval / approve` (DogDays/DogPack: the same without the `deploy /` prefix if they call it directly). After you approve it, no other production job waits. If a later job still waits, the `production` environment still has reviewers (step 3) or a job names a different reviewed environment.
