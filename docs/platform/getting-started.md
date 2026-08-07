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
pnpm sb link --remote      # one-time — links the CLI to PROJECT_REF
pnpm --filter @devdogsuga/supabase generate-types           # regenerate the shared Database types
pnpm dev --filter platform          # or schedule-builder
```

> **`DB_URL` note:** use the **Session pooler** connection string (port 5432),
> not the Transaction pooler (6543) — the transaction pooler doesn't support the
> prepared statements `drizzle-kit` uses and hangs instead of erroring.

## Running against a local Supabase stack (optional, needs Docker)

```bash
pnpm sb link      # boots Docker Supabase, writes .env.generated, seeds buckets
pnpm sb reset     # replays all migrations, then the seeds; regenerates types
pnpm dev:local --filter platform
```

> `pnpm sb` is a four-command dispatcher — `link`, `push`, `reset`, `status` —
> over three targets (`--local`, the default; `--remote`; `--team <slug>`). The
> individual package scripts it delegates to are still reachable directly, e.g.
> `pnpm --filter @devdogsuga/supabase generate-types`.

Contributors share the one remote dev database; the local stack is the offline /
isolated escape hatch. There's a single root `.env` for the whole monorepo —
never commit it. `.env`, `.env.generated`, and `.env.local` are all gitignored;
only `.env.example` is tracked.

### What `pnpm sb reset` seeds

`reset` is not just migrations. It also runs `supabase/seed/*.sql`,
which is what makes a fresh instance usable rather than empty:

| Seed                | What it does                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_instance.sql`   | Demotes the instance to `local`. `platform."instance"."environment"` defaults to `production` so a fresh database fails _closed_; this is the one place it is safe to open. |
| `01_roles.sql`      | The built-in Member and Root role definitions, so `platform.claim_root()` works.                                                                                            |
| `02_moderation.sql` | Sign-in-able personas, sandbox content, report reasons and feedback topics.                                                                                                 |

Three personas are created, all with the password `password`:

| Email                    | What they are for                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `member@sandbox.test`    | An ordinary member — the only way to _encounter_ a permission boundary, since you are Root on your own instance |
| `author@sandbox.test`    | Owns the sandbox content, including one quarantined post                                                        |
| `moderator@sandbox.test` | Holds a Sandbox Moderator role: works the report queue, and nothing else                                        |

Root is deliberately left **unheld** so `platform.claim_root()` still works —
that is how you grant yourself the console on a fresh instance.

For the reporting and moderation tooling that runs against this stack, see
[Reporting & Feedback](./reporting-and-feedback.md); for the fixture schema it
acts on, [the Sandbox App](./sandbox-app.md).

## Local docs preview

```bash
pnpm --filter platform docs:preview
```

Then visit the docs preview route on the running dev server. It auto-refreshes
when you save any file in `docs/` and renders like the live docs site.
