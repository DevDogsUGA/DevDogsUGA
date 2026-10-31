# DevDogs Monorepo

DevDogs is UGA's student developer club. This repository is the platform and
everything it runs on: the site, dashboard, docs and OAuth server (`apps/platform`),
Schedule Builder, the Study Group Finder, the database (`supabase/`: every
migration, seed and config), the club's published packages and the officer CLIs
(`packages/`), the docs (`docs/`), and the workflows that test, deploy and
publish all of it. (It used to be two repositories, DevDogsUGA and Backstage;
the fold-back merged them, and Backstage is archived.)

Pick your team's docs to get started:

- [Platform](https://devdogsuga.org/docs/platform/getting-started/prerequisites): the site, dashboard, docs, and OAuth server (Next.js)
- [DogDays](https://github.com/DevDogsUGA/DogDays): course schedule planning (its own repository)
- [DogPack](https://github.com/DevDogsUGA/DogPack): study groups (its own repository, Flutter)

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git && cd DevDogsUGA
fnm install && npm install -g pnpm
pnpm install
pnpm devtools setup
```

`pnpm devtools` runs `@devdogsuga/devtools@next`, the newest prerelease: this checkout needs the sdk-era CLI, and the stable `latest` tag does not carry it until the Gate. CI, and the docs build's check of every documented `pnpm devtools` command, use the workspace build of the same code, so neither waits for a publish. Before the first `next` publish lands, run `node packages/devtools/bin/devtools.mjs` (after a devtools build) instead.

Full docs: [devdogsuga.org/docs](https://devdogsuga.org/docs)

## What lives where

| Path                                   | What                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/platform`                        | The platform Worker (vinext), with `packages/email` for its templates                                                                                                                                                                                                                                         |
| `apps/slides`, `apps/workshops-vscode` | Slidev workshop decks and the workshop VS Code extension (never deployed by `deploy.yaml`)                                                                                                                                                                                                                    |
| `supabase/`, `packages/supabase`       | Migrations, seeds, `config.toml`; generated database types and the RLS suite                                                                                                                                                                                                                                  |
| `docs/`, `packages/docs-kit`           | The documentation content and its compiler                                                                                                                                                                                                                                                                    |
| `packages/*`                           | `config`, `sdk` (brand, env, db, headers, telemetry, catalog and moderation clients), `newsletter`, `events` (published as `@devdogsuga/*`), the private `sdk-spec` (the OpenAPI that generates the TypeScript and Dart clients), the CLIs `devtools` and `backstage`, and the private `cli-core` they inline |
| `workers.json`                         | The Workers `deploy.yaml` ships, with their smoke-test data                                                                                                                                                                                                                                                   |
| `competitions/TEMPLATE.md`             | The officer template for weekly competition briefs                                                                                                                                                                                                                                                            |
| `CUTOVER.md`                           | The closed log of the packages' move out of the old product repo                                                                                                                                                                                                                                              |

## Development

- **Env files.** `with-env` reads `.env` and `.env.generated` from this repo's
  root (both gitignored). `pnpm devtools setup` writes them; the local Supabase
  stack (`pnpm devtools supabase start --tier development:local`) is started from
  this same root.
- **Build env.** `DEPLOY_ENV=development pnpm -F platform build` against the
  local stack; `pnpm -F platform test:db`
  need that stack running.
- **Patches.** `patches/` and `patchedDependencies` hold the vinext and React
  patches both Next apps build with. Because they are keyed to exact versions,
  `apps/platform` pins `react` and `react-dom` to 19.3.0. `pnpm check:patches`
  audits each patch against its upstream fix and says which ones can be removed;
  `pnpm test:patches` runs that script's tests. Both run on Node's built-in
  TypeScript support, with no install.
- **Database types** are generated from the migrations, not committed:
  `pnpm --filter @devdogsuga/supabase run codegen` (needs the local stack).

## CI

- **`types`** generates `packages/supabase/src/database.types.ts` from the
  migrations against a local stack, and caches it under a key derived from the
  migrations and the generator. Most pushes hit the cache.
- **`validate`** builds the packages, then runs lint, format, the script-name
  vocabulary, `devtools check` (migration order, `workers.json`, scripts, env),
  typecheck and tests for the whole workspace, both CLIs' contract tests, the
  events config check, and `types:cf:check` for both Workers. The Next apps'
  builds are left to `database`.
- **`database`** starts the local Supabase stack from `supabase/`, runs the RLS
  suite and both apps' `test:db`, then builds both apps with the env schema
  enforced against `.github/ci.env` (placeholders only) plus the stack's
  generated values. The stack's Docker images are cached by Supabase CLI version
  and `config.toml`.
- **`toolchain`** audits the patches (it warns, through `::warning::`
  annotations, when a patch's upstream fix has shipped) and tests the deploy
  scripts. Daily, the `patch-issues` job opens or refreshes one issue titled
  `Remove patch <name>` per removable patch; only that job holds `issues: write`.
- Every job that installs the workspace goes through
  `.github/actions/setup-workspace`.

## Deploys

A push to `main` runs `.github/workflows/ci.yaml`; once `validate`, `database`,
`flutter` and `toolchain` pass, its `deploy` job calls
`.github/workflows/deploy.yaml`. The CLI that runs it is built from the commit
being deployed (`.github/actions/backstage-cli`), not fetched with `pnpm dlx`.

```
merge_group CI run:  validate -> build (staging, production)  ->  artifacts <tier>-<sha>
push to main:        supersede
                     resolve (finds the merge_group run) -> build (only if none)
                     staging-preflight -> staging-database -> staging-avatars
                                       -> staging-platform | staging-catalog
                     production-database (plan, approval, apply)
                                       -> production-catalog
                                       -> production-platform
```

The database and each Worker deploy through two shared, reusable workflows
(Q15) that the product repositories call too, pinned by commit SHA:

- **`deploy-database.yaml`.** Hand-written migrations, then the declarative
  diff, then `supabase config push` (and, for a product, registering
  `custom:devdogsuga`). Every apply is planned first and hash-checked: the plan
  job writes the SQL and its SHA-256 into the run summary, and the apply job
  regenerates the SQL against the real database and refuses if it is not the
  approved one. A plan that drops or rewrites data is refused unless its pull request carried
  the `allow-destructive` label from a `devops` member
  (`database-pr.yaml`, `destructive-gate.yaml`, `destructive-approval.mjs`).
  Production can ask for one approval per deploy instead of one per job:
  `plan-database.yaml`, `approve-production.yaml` and `apply-database.yaml`,
  behind the `ONE_APPROVAL` variable (`docs/operations/deploys/one-approval.md`).
- **`deploy-worker.yaml`.** `wrangler versions upload`, the new version added to
  the deployment at 0%, a smoke test of that version through the version
  override header (the platform's includes the OAuth authorize and consent
  checks), the traffic switch, routes and crons, and a smoke test of what is
  live, with an automatic rollback if that fails. The slides deck deploys
  through it too (`slides.yaml`).

- **Artifacts come from the merge queue.** `ci.yaml` builds both tiers on
  `merge_group` (`build-artifacts.yaml`); the queue fast-forwards `main` to that
  exact commit, so `resolve` finds the run by SHA and the deploy downloads its
  artifacts (`staging-<sha>`, `production-<sha>`) and verifies
  `RELEASE_SHA256SUMS`. A push the queue never built builds in its own run.
  Builds run in the credential-free `staging-build` / `production-build`
  environments.
- **Staging** runs on every deploy: preflight, the database (migrations, the
  schema diff, new seeds, the config push), avatars, then both Workers (write-env,
  Sentry release, version upload and smoke test, docs index and config reconcile
  for the platform, the live smoke test).
- **Production** is the `production` environment (devops reviewers). Each
  approved job opens by refusing an approver who authored the PR that produced
  the commit or put it in the merge queue (`.github/scripts/approval-gate.mjs`;
  a push with no PR is covered by the environment's own prevent-self-review) and
  by refusing a commit that is no longer `main`. The database job is approved
  first; the two Workers run in parallel behind one approval.
- **Runbooks.** Rollback, a failed migration, the destructive gate, the table
  drops, the vanity-subdomain switch, credentials and incidents are in
  `docs/operations/`.
- **Sentry releases.** Both Workers' release is the commit SHA.
- **Caches.** The pnpm store (setup-workspace) and the Supabase images (the
  `types` and `database` jobs). The compiled docs are not cached: docs-kit's
  build cache fingerprints file mtimes, which a fresh checkout never reproduces,
  so a restored `docs/dist` could not hit.
- **Manual run.** `Deploy` has a `workflow_dispatch` input, `prune_orphans`, that
  deletes undeclared production Worker secrets.

### Phase gates

Nothing deploys from here until the repository variable
`BACKSTAGE_DEPLOYS_STAGING` is exactly `true`. Production is gated separately:
every production job, and the production build, runs only when the repository
variable `BACKSTAGE_DEPLOYS_PRODUCTION` is exactly `true`. That variable is unset
until the production cutover, which belongs to the Gate: until then production
still deploys from the Backstage repository's last commit, and both deploying
would race on the same Workers and database.

### Secrets and variables

Nothing in a workflow reads a credential except through an environment. `env push`
fills `preflight`, `staging` and `production` from the env manifests. Only what a
workflow names directly is listed; `write-env` composes the rest of a tier's
`.env` from the manifests and refuses to write a file missing a schema-required
key, naming each one.

| Where                               | Variables                                                                                                                                                                                                                              | Secrets                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Repository                          | `BACKSTAGE_DEPLOYS_STAGING`, `BACKSTAGE_DEPLOYS_PRODUCTION`, `BACKSTAGE_PUBLISHES_STABLE` (unset = off), `DEVTOOLS_SENTRY_DSN`, `WORKSHOPS_VSCODE_SENTRY_DSN` (publish), `WORKSHOPS_MARKETPLACE=true` once `publishing` has `VSCE_PAT` | none                                                                                                                                 |
| `staging-build`, `production-build` | `API_URL`, `BASE_URL`, `PUBLISHABLE_KEY` (required); `PLATFORM_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (optional). Pushed from the manifests' `build: true` flag                                                                 | none                                                                                                                                 |
| `staging`                           | `PROJECT_REF`, `PUBLISHABLE_KEY`, `API_URL`, plus every non-secret key the server schema declares for the tier                                                                                                                         | `DB_URL`, `SECRET_KEY`, `SENTRY_AUTH_TOKEN` (optional), `CRON_SECRET`, `CLOUDFLARE_API_TOKEN`, plus every other secret in the schema |
| `preflight` (production plan)       | none read directly                                                                                                                                                                                                                     | `DB_URL` (the read-only planner credential)                                                                                          |
| `production`                        | `PROJECT_REF`, `API_URL`, plus the schema's non-secret keys for the tier                                                                                                                                                               | everything `staging` has, and `SUPABASE_ACCESS_TOKEN`, `SENTRY_MONITORS_TOKEN` (optional)                                            |
| `publishing`                        | none                                                                                                                                                                                                                                   | `VSCE_PAT`                                                                                                                           |
| `publishing-next`                   | none                                                                                                                                                                                                                                   | none (prereleases publish with OIDC trusted publishing; no reviewers, `main` only)                                                   |

The schema-required keys per tier come from `apps/platform/src/env.ts`,
`supabase/env.ts` and
`packages/backstage/env.ts`; `pnpm devtools env example` lists them.

`backstage env push` addresses the repository `gh` resolves from the current
directory (it passes no `--repo`). A push for `staging` or `production` also
writes the keys marked `build: true` in the env manifests to `staging-build` /
`production-build`, as variables only and as a separate confirmation; `env audit`
checks them too.

## Releases

Fully automatic: no changesets, no version bump PRs, no human publish step.
Every merge to `main` that changes a package's contents patch-bumps and
republishes just that package, with npm provenance and **no npm token of any
kind** (OIDC trusted publishing), after a `publishing` approval. Stable
publishing from here is off until the repository variable
`BACKSTAGE_PUBLISHES_STABLE` is `true` (the Gate sets it). See
`.github/workflows/publish.yaml` and `scripts/publish-changed-packages.mjs` for
the mechanism.

## Scripts

```bash
pnpm build           # every package and app except slides
pnpm typecheck       # pnpm -r typecheck
pnpm test            # pnpm -r test
pnpm check:scripts   # every script name is in the club's script vocabulary
pnpm check:patches   # patches against their upstream fixes (--json for a report)
```
