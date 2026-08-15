# DevDogs Monorepo

A pnpm + Turborepo monorepo for DevDogs, backed by a single shared Supabase
project where **each app owns its own Postgres schema**.

## Layout

```
apps/
  platform/            Next.js — the main DevDogs site + OAuth server   → schema: platform
  schedule-builder/    Next.js — course schedule builder                → schema: schedule_builder
  study-group-finder/  Flutter — study group finder (scaffold)          → schema: study_group_finder
                       (no app owns `sandbox` — it is fixture content for the moderation
                        tooling, present in every tier and denied on production by RLS)
packages/
  sb/                  @devdogsuga/supabase — shared Supabase: config.toml, SQL migrations,
                       generated Database types, and client factories
  devtools/            @devdogsuga/devtools — the `pnpm devtools` contributor CLI:
                       database commands, moderation checks, OAuth setup
  docs-build/          @devdogsuga/docs-build — compiles docs/ to the site's page data
  airtable/            @devdogsuga/airtable — the officer-facing Airtable registry
  db/                  @devdogsuga/drizzle — shared Drizzle helpers
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
pnpm setup                       # checks prereqs, seeds .env from .env.example
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
linked remote Supabase project. There is no flag and no `:local` script
variant — start the stack (`pnpm sb link`) to switch, stop it to switch back.
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

| File                  | Holds                                                                                                               | Loaded                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| root `.env`           | everything: shared Supabase creds, per-app secrets, and all `config.toml` reads (ports, auth providers, `BASE_URL`) | always                                        |
| root `.env.generated` | local-stack creds (written by `start-local-stack`, deleted by `stop-local-stack`)                                   | when the stack is listening; wins over `.env` |

Copy `.env.example` to `.env` (or run `pnpm setup`), then fill it in.

## Scripts

**Root** (`pnpm <script>`)

| Script                                 | Does                                        |
| -------------------------------------- | ------------------------------------------- |
| `setup`                                | Onboarding: check prereqs, seed `.env`      |
| `dev` / `build` / `typecheck` / `lint` | `turbo run …` across the workspace          |
| `format:write` / `format:check`        | Prettier over the repo                      |
| `sb <cmd>`                             | Proxy to `@devdogsuga/supabase` (see below) |

**In any package's scripts** (via `@devdogsuga/env`)

| Command               | Does                                     |
| --------------------- | ---------------------------------------- |
| `with-env <cmd>`      | Run `<cmd>` with the env files loaded    |
| `with-env -c '<cmd>'` | Same, but `$VAR` resolves from the files |

**Supabase** (`pnpm sb <cmd>`) — a running local Docker stack is auto-detected and wins

| Command                                  | Does                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `link-remote-project`                    | One-time: link the CLI to the remote project (`PROJECT_REF`)         |
| `new-migration <name>`                   | Create a new SQL migration                                           |
| `push-migrations`                        | Apply migrations to the remote DB + regenerate types                 |
| `reset-remote-database`                  | **Destructive**: wipe + replay migrations on remote (interactive)    |
| `generate-types`                         | Regenerate `Database` types from the linked DB + rebuild the package |
| `start-local-stack` / `stop-local-stack` | Bring the local Docker stack up/down                                 |
| `reset-local-database`                   | Wipe + replay migrations on the local stack                          |

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
  site; see `docs/getting-started.md` and `docs/database.md`.
- Both Next apps deploy to Cloudflare Workers via OpenNext (`cf:*` scripts +
  each app's `wrangler.jsonc`). Deploy wiring is in progress.
