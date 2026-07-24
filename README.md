# DevDogs Monorepo

A pnpm + Turborepo monorepo for DevDogs, backed by a single shared Supabase
project where **each app owns its own Postgres schema**.

## Layout

```
apps/
  platform/            Next.js — the main DevDogs site + OAuth server   → schema: platform
  schedule-builder/    Next.js — course schedule builder                → schema: schedule_builder
  study-group-finder/  Flutter — study group finder (scaffold)          → schema: study_group_finder
packages/
  sb/                  @devdogsuga/sb — shared Supabase: config.toml, SQL migrations,
                       generated Database types, and client factories
  feedback-client/     @devdogsuga/feedback-client
  reports-client/      @devdogsuga/reports-client
  oauth-setup/         @devdogsuga/oauth-setup
  docs-preview/        @devdogsuga/docs-preview
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
pnpm sb link-remote-project      # one-time
pnpm sb generate-types           # regenerate the shared Database types
pnpm dev --filter @devdogsuga/platform
```

Prereqs: Node ≥ 20 (`.nvmrc`), pnpm via corepack. Docker only for the local
Supabase stack; the Flutter SDK only for `apps/study-group-finder`.

## Environment

**Remote-first**: `pnpm dev` and `pnpm sb <cmd>` target the linked remote
Supabase project by default. The local Docker stack is opt-in
(`pnpm sb start-local-stack`, then the `:local` / `dev:local` script variants).

There is a **single** root `.env` for the whole monorepo — no per-app env
files. Scripts load it with [dotenvx](https://dotenvx.com), e.g.
`dotenvx run -f ../../.env -- <cmd>`; when more than one `-f` is given the
first file wins.

| File                  | Holds                                                                                                               | Loaded                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| root `.env`           | everything: shared Supabase creds, per-app secrets, and all `config.toml` reads (ports, auth providers, `BASE_URL`) | always                                      |
| root `.env.generated` | local-stack creds (written by `start-local-stack`)                                                                  | only by `:local` variants; wins over `.env` |

Copy `.env.example` to `.env` (or run `pnpm setup`), then fill it in.

## Scripts

**Root** (`pnpm <script>`)

| Script                                 | Does                                   |
| -------------------------------------- | -------------------------------------- |
| `setup`                                | Onboarding: check prereqs, seed `.env` |
| `dev` / `build` / `typecheck` / `lint` | `turbo run …` across the workspace     |
| `format:write` / `format:check`        | Prettier over the repo                 |
| `sb <cmd>`                             | Proxy to `@devdogsuga/sb` (see below)  |

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

**Flutter app** (`pnpm --filter @devdogsuga/study-group-finder <script>`):
`dev` / `dev:local` / `build` / `test` / `lint` / `generate-types` — shell out
to Flutter via `dotenvx`. See `apps/study-group-finder/README.md`.

## Docs & deployment

- Docs live in root `docs/` (per-project subfolders) and render on the platform
  site; see `docs/getting-started.md` and `docs/database.md`.
- Both Next apps deploy to Cloudflare Workers via OpenNext (`cf:*` scripts +
  each app's `wrangler.jsonc`). Deploy wiring is in progress.
