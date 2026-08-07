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
  with-env/            @devdogsuga/with-env — the `with-env` bin used by every script
docs/                  Rendered on the platform site (per-project subfolders)
```

Schema-per-app is an **organizational** boundary — all schemas share one
PostgREST endpoint and anon key, so **Row-Level Security is what isolates
data**. The only credential that bypasses RLS is the service role
(`SECRET_KEY`).

## Quickstart

```bash
git clone https://github.com/DevDogs-UGA/DevDogs-Website.git
cd DevDogs-Website
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

**Remote-first**: `pnpm dev` and `pnpm sb <cmd>` target the linked remote
Supabase project by default. The local Docker stack is opt-in
(`pnpm sb link`, then the `:local` / `dev:local` script variants).

There is a **single** root `.env` for the whole monorepo — no per-app env
files. It is loaded by [dotenvx](https://dotenvx.com) through one shared
helper, the `with-env` bin from `@devdogsuga/with-env`. Workspace scripts never
call `dotenvx` directly; they wrap their command in it:

```jsonc
"dev": "with-env next dev",                    // root .env
"dev:local": "with-env --local next dev",      // .env.generated, then .env
```

`--local` layers `.env.generated` on top; when more than one file is loaded the
first one wins. The helper (`packages/with-env`) finds the env files by walking
up to the workspace root, so it works from any package. Add
`"@devdogsuga/with-env": "workspace:*"` to a package's devDependencies to get
the bin on its `PATH`.

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

| File                  | Holds                                                                                                               | Loaded                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| root `.env`           | everything: shared Supabase creds, per-app secrets, and all `config.toml` reads (ports, auth providers, `BASE_URL`) | always                                      |
| root `.env.generated` | local-stack creds (written by `start-local-stack`)                                                                  | only by `:local` variants; wins over `.env` |

Copy `.env.example` to `.env` (or run `pnpm setup`), then fill it in.

## Scripts

**Root** (`pnpm <script>`)

| Script                                 | Does                                        |
| -------------------------------------- | ------------------------------------------- |
| `setup`                                | Onboarding: check prereqs, seed `.env`      |
| `dev` / `build` / `typecheck` / `lint` | `turbo run …` across the workspace          |
| `format:write` / `format:check`        | Prettier over the repo                      |
| `sb <cmd>`                             | Proxy to `@devdogsuga/supabase` (see below) |

**In any package's scripts** (via `@devdogsuga/with-env`)

| Command                         | Does                                    |
| ------------------------------- | --------------------------------------- |
| `with-env [--local] <cmd>`      | Run `<cmd>` with the root `.env` loaded |
| `with-env [--local] -c '<cmd>'` | Same, but `$VAR` resolves from `.env`   |

**Supabase** (`pnpm sb <cmd>`) — remote-first; `:local` variants use the Docker stack

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

| Script                                  | Does                                           |
| --------------------------------------- | ---------------------------------------------- |
| `dev` / `dev:local`                     | `next dev` against remote / local Supabase     |
| `build`                                 | `next build`                                   |
| `typecheck` / `lint`                    | `tsc --noEmit` / `eslint src`                  |
| `db:pull` / `db:pull:local`             | Regenerate drizzle schema from the DB          |
| `cf:build` / `cf:preview` / `cf:deploy` | OpenNext → Cloudflare build / preview / deploy |
| `db:seed-roles` (platform)              | Seed built-in roles                            |
| `db:generate` (schedule-builder)        | Draft a SQL migration from the drizzle schema  |

**Flutter app** (`pnpm --filter study-group-finder <script>`):
`dev` / `dev:local` / `build` / `test` / `lint` / `generate-types` — shell out
to Flutter via `with-env -c`, so the `--dart-define` values come from `.env`.
See `apps/study-group-finder/README.md`.

## Docs & deployment

- Docs live in root `docs/` (per-project subfolders) and render on the platform
  site; see `docs/getting-started.md` and `docs/database.md`.
- Both Next apps deploy to Cloudflare Workers via OpenNext (`cf:*` scripts +
  each app's `wrangler.jsonc`). Deploy wiring is in progress.
