# Getting Started

This is a pnpm + Turborepo monorepo (`apps/*` + `packages/*`) on a single shared
Supabase project, each app owning its own Postgres schema. See the repo README
for the full layout and script reference.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later (`.nvmrc`)
- [pnpm](https://pnpm.io) via `corepack enable` (version pinned in the root
  `package.json`)
- [Docker](https://www.docker.com) — only for the optional local Supabase stack
- The [Flutter SDK](https://docs.flutter.dev) — only for `apps/study-group-finder`

## Installation

```bash
git clone https://github.com/DevDogs-UGA/DevDogs-Website.git
cd DevDogs-Website
corepack enable && pnpm install
pnpm setup          # checks prereqs and seeds .env from .env.example
```

## Running (remote-first)

By default the apps and the Supabase CLI target the **linked remote** Supabase
project. Fill in the "Remote Supabase project" section of `.env`, then:

```bash
pnpm sb link-remote-project      # one-time — links the CLI to PROJECT_REF
pnpm sb generate-types           # regenerate the shared Database types
pnpm dev --filter @devdogsuga/platform          # or @devdogsuga/schedule-builder
```

> **`DB_URL` note:** use the **Session pooler** connection string (port 5432),
> not the Transaction pooler (6543) — the transaction pooler doesn't support the
> prepared statements `drizzle-kit` uses and hangs instead of erroring.

## Running against a local Supabase stack (optional, needs Docker)

```bash
pnpm sb start-local-stack        # starts Docker Supabase, writes .env.generated, seeds buckets
pnpm sb reset-local-database     # replays all migrations + regenerates types
pnpm dev:local --filter @devdogsuga/platform
```

Contributors share the one remote dev database; the local stack is the offline /
isolated escape hatch. There's a single root `.env` for the whole monorepo —
never commit it. `.env`, `.env.generated`, and `.env.local` are all gitignored;
only `.env.example` is tracked.

## Local docs preview

```bash
pnpm --filter @devdogsuga/platform docs:preview
```

Then visit the docs preview route on the running dev server. It auto-refreshes
when you save any file in `docs/` and renders like the live docs site.
