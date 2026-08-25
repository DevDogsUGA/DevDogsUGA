# DevDogs Monorepo

Every DevDogs project in one pnpm + Turborepo workspace: four apps, eight shared
packages, and one Supabase Postgres database. Three of the apps own a Postgres
schema each — `platform`, `schedule_builder`, `study_group_finder` — and
Row-Level Security, not the schema boundary, is what isolates one app's data
from another's. The fourth, `sandbox`, owns no schema: it is a Cloudflare Worker
proxying each competition team's own Supabase project.

## Layout

```
apps/
  platform/            Next.js — the DevDogs site, console, docs, and OAuth server
  schedule-builder/    Next.js — course schedule planning
  study-group-finder/  Flutter — study groups (scaffold)
  sandbox/             Cloudflare Worker — the proxy in front of each team's Supabase project
packages/
  supabase/            @devdogsuga/supabase — Supabase client factories and generated types
  devtools/            @devdogsuga/devtools — the `pnpm devtools` contributor CLI
  env/                 @devdogsuga/env — the env-variable registry, and the `with-env` bin
  docs-build/          @devdogsuga/docs-build — compiles docs/ into the site's page data
  airtable/            @devdogsuga/airtable — the officer-facing Airtable registry
  drizzle/             @devdogsuga/drizzle — the shared Drizzle client factory
  email/               @devdogsuga/email — transactional email templates
  config/              @devdogsuga/config — shared tsconfig/eslint/vitest presets
supabase/              config.toml, migrations, and seeds — one history, every schema
docs/                  Markdown for every project, rendered on the platform site
```

## Quickstart

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
corepack enable && pnpm install
pnpm setup
pnpm sb link      # boots the local Docker stack; --remote links a hosted project instead
pnpm sb reset
pnpm dev --filter platform
```

Prerequisites, the hosted-Supabase path, and what each step does:
[Quickstart](docs/monorepo/guides/quickstart.md).

## Docs

| Page                                                        | What it covers                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| [Monorepo](docs/monorepo/index.md)                          | Start here — which app owns what, and where to go next            |
| [Quickstart](docs/monorepo/guides/quickstart.md)            | Clone to a running app                                            |
| [Contributing](docs/monorepo/guides/contributing.md)        | Branch, pull request, the checks CI runs                          |
| [Secrets and environments](docs/monorepo/guides/secrets.md) | Which env file is which, and how yours gets filled                |
| [Stack](docs/monorepo/stack/index.md)                       | Every technology, its pinned version, and where we depart from it |
| [Platform](docs/platform/index.md)                          | The site, console, docs, and OAuth server                         |
| [Schedule Builder](docs/schedule-builder/index.md)          | Course schedule planning                                          |
| [Study Group Finder](docs/study-group-finder/index.md)      | The Flutter app                                                   |
| [Sandbox](docs/sandbox/index.md)                            | Per-team Supabase instances, and the proxy in front of them       |
| [Toolkit](docs/toolkit/index.md)                            | The shared packages, and the generated API reference              |
