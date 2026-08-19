# DevDogs Monorepo

A pnpm + Turborepo monorepo for DevDogs, backed by a single shared Supabase
project where **each app owns its own Postgres schema**.

## Layout

```
apps/
  platform/            Next.js — the main DevDogs site + OAuth server   → schema: platform
  schedule-builder/    Next.js — course schedule builder                → schema: schedule_builder
  study-group-finder/  Flutter — study group finder (scaffold)          → schema: study_group_finder
  sandbox/             Cloudflare Worker — the per-environment proxy in front of each
                       team's Supabase project
                       (no app owns the `sandbox` DB schema — it is fixture content for the
                        moderation tooling, present in every tier and denied on production
                        by RLS)
packages/
  supabase/            @devdogsuga/supabase — shared Supabase: config.toml, SQL migrations,
                       generated Database types, and client factories
  devtools/            @devdogsuga/devtools — the `pnpm devtools` contributor CLI:
                       database commands, moderation checks, OAuth setup, env sync, and
                       the `deploy` steps CI runs
  docs-build/          @devdogsuga/docs-build — compiles docs/ to the site's page data
  airtable/            @devdogsuga/airtable — the officer-facing Airtable registry
  drizzle/             @devdogsuga/drizzle — shared Drizzle helpers
  email/               @devdogsuga/email — transactional email templates
  config/              @devdogsuga/config — shared tsconfig/eslint/vitest presets
  env/                 @devdogsuga/env — the env-variable registry and the `with-env` bin
                       used by every script
docs/                  Rendered on the platform site (per-project subfolders)
```

Schema-per-app is an **organizational** boundary — all schemas share one
PostgREST endpoint and anon key, so **Row-Level Security is what isolates
data**. The only credential that bypasses RLS is the service role
(`SECRET_KEY`).

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
corepack enable && pnpm install
pnpm setup                       # checks prereqs, generates .env from the env registry
# edit .env — add your remote Supabase creds (see the file's comments)
pnpm sb link --remote      # one-time
pnpm --filter @devdogsuga/supabase generate-types           # regenerate the shared Database types
pnpm dev --filter platform
```

Prereqs: Node ≥ 20 (`.nvmrc`), pnpm via corepack. Docker only for the local
Supabase stack; the Flutter SDK only for `apps/study-group-finder`.

## Environment

**A running local stack wins**: `with-env` probes the local Supabase API port
(54321) on every run. When the Docker stack is listening, the `.env.generated`
overlay is layered on top of `.env`; when it is not, everything targets the
linked remote Supabase project. There is no flag — start the stack
(`pnpm sb link`) to switch, stop it to switch back. (A few package scripts
keep explicit `…:local` variants that pin the stack by name.)
`with-env` prints which files it loaded on every run, so the target is never a
guess.

There is a **single** root `.env` for the whole monorepo — no per-app env
files. It is loaded by [dotenvx](https://dotenvx.com) through one shared
helper, the `with-env` bin from `@devdogsuga/env`. Workspace scripts never
call `dotenvx` directly; they wrap their command in it:

```jsonc
"dev": "with-env next dev",    // .env — plus .env.generated when the stack is up
```

When more than one file is loaded the first one wins. The helper
(`packages/env`) finds the env files by walking up to the workspace root, so
it works from any package. Add `"@devdogsuga/env": "workspace:*"` to a
package's devDependencies to get the bin on its `PATH`.

### Cross-platform scripts

`shellEmulator: true` (in `pnpm-workspace.yaml`) runs every script through
pnpm's built-in JS shell rather than the platform shell, so `$VAR`,
`${VAR:-default}`, `&&`, `>`, and `KEY=VALUE` prefixes behave identically on
Windows and POSIX. No script needs an `sh -c` wrapper — write shell syntax
directly:

```jsonc
"generate-types": "with-env supabase gen types --linked > src/database.types.ts"
```

One ordering rule matters: a `$VAR` in the _outer_ script is expanded **before**
`with-env` loads `.env`, so it resolves against the ambient environment — and
because the emulator is strict about unbound variables, it fails outright rather
than expanding to empty. When the command needs a value _from_ `.env`, quote it
and pass it to `with-env -c`, which defers expansion until after the env is
loaded:

```jsonc
"link-remote-project": "with-env -c 'supabase link --project-ref $PROJECT_REF'"
```

`-c` evaluates the string with `@yarnpkg/shell` (the same JS shell backing
`shellEmulator`), so it stays cross-platform and supports `$VAR`, `&&`, `>`, and
`KEY=VALUE` prefixes — the last of which is how the Flutter app maps the repo's
`API_URL`/`SECRET_KEY` onto the names supadart expects. Use the plain argv form
whenever no `.env` value is needed; it is the simpler path.

Note the emulator globs unquoted `[...]`, so keep such arguments quoted.

| File                                  | Holds                                                                                                                     | Loaded                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| root `.env`                           | everything: shared Supabase creds, per-app secrets, and all `config.toml` reads (ports, auth providers, `BASE_URL`)       | always                                           |
| root `.env.generated`                 | local-stack creds (written by `start-local-stack`, deleted by `stop-local-stack`)                                         | when the stack is listening; wins over `.env`    |
| `.env.{preflight,staging,production}` | per-environment deploy targets, synced to Bitwarden + GitHub by `pnpm devtools env push` — see `pnpm devtools env --help` | by deploy jobs only (`DEPLOY_ENV`), never in dev |

Run `pnpm setup` to generate `.env` (`.env.example` documents every key), then
fill it in.

## Scripts

**Root** (`pnpm <script>`)

| Script                                          | Does                                   |
| ----------------------------------------------- | -------------------------------------- |
| `setup`                                         | Onboarding: check prereqs, seed `.env` |
| `dev` / `build` / `typecheck` / `lint` / `test` | `turbo run …` across the workspace     |
| `format:write` / `format:check`                 | Prettier over the repo                 |
| `devtools` (alias: `sb`)                        | The contributor CLI (see below)        |

**In any package's scripts** (via `@devdogsuga/env`)

| Command               | Does                                     |
| --------------------- | ---------------------------------------- |
| `with-env <cmd>`      | Run `<cmd>` with the env files loaded    |
| `with-env -c '<cmd>'` | Same, but `$VAR` resolves from the files |

**Contributor CLI** (`pnpm devtools <cmd>`, or the `pnpm sb` alias) — run with
no command for a menu, or `--help` for the full reference. Highlights:

| Command                    | Does                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `link [--local\|--remote]` | Start the local Docker stack, or link the CLI to the remote   |
| `push` / `reset`           | Apply migrations / rebuild the DB from migrations + seeds     |
| `status`                   | Report the target's health                                    |
| `doctor` / `roundtrip`     | Check an app's moderation integration                         |
| `oauth`                    | Configure "Sign in with DevDogs" for the project in this dir  |
| `airtable <sub>`           | Scaffold, pull ids from, verify, or snapshot the officer base |
| `env <sub> --target <t>`   | Pull/push/audit one env target across Bitwarden + GitHub      |
| `deploy <sub>`             | The steps `deploy.yaml` runs — CI-only, not for a laptop      |

The database verbs delegate to `@devdogsuga/supabase` package scripts
(`pnpm --filter @devdogsuga/supabase run <script>` for the full set:
`new-migration`, `push-config`, `seed-buckets`, `generate-types`, `test:rls`, …).

**Per Next.js app** (`pnpm --filter @devdogsuga/<app> <script>`)

| Script                               | Does                                             |
| ------------------------------------ | ------------------------------------------------ |
| `dev`                                | `next dev` (local stack auto-detected)           |
| `build`                              | `next build`                                     |
| `typecheck` / `lint`                 | `tsc --noEmit` / `eslint src`                    |
| `db:pull`                            | Regenerate drizzle schema from the DB            |
| `cf:preview`                         | OpenNext → Cloudflare, served locally            |
| `cf:build:<env>` / `cf:deploy:<env>` | Build / deploy `<env>` (`staging`, `production`) |
| `db:seed-roles` (platform)           | Seed built-in roles                              |
| `db:generate` (schedule-builder)     | Draft a SQL migration from the drizzle schema    |

**Flutter app** (`pnpm --filter study-group-finder <script>`):
`dev` / `build` / `test` / `lint` / `generate-types` — shell out
to Flutter via `with-env -c`, so the `--dart-define` values come from `.env`.
See `apps/study-group-finder/README.md`.

## Docs & deployment

- Docs live in root `docs/` (per-project subfolders) and render on the platform
  site; start with `docs/platform/getting-started.md` and
  `docs/platform/database.md`.
- CI (`.github/workflows/ci.yaml`) validates every PR and holds **no secrets**,
  deliberately. Deploys run from `.github/workflows/deploy.yaml`: merging to
  `main` deploys **staging**; a promotion PR into the `production` branch
  deploys **production**, with migration/config/Airtable plans and reviewer
  gates in between. Three Workers per environment:
  `{staging,production}-{platform,schedule-builder,sandbox}`, built via
  OpenNext (`cf:*` scripts + each app's `wrangler.jsonc`). The workflow files'
  comments are the authoritative walkthrough of why each step is shaped the
  way it is.
