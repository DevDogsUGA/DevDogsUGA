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

| Seed                | What it does                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| `01_roles.sql`      | The built-in Member and Root role definitions.                                        |
| `02_moderation.sql` | Sign-in-able personas, their profiles, and one open report filed against one of them. |

Three personas are created, all with the password `password`:

| Email                    | What they are for                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `member@devdogs.test`    | An ordinary member — the only way to _encounter_ a permission boundary, since you are Root on your own instance         |
| `author@devdogs.test`    | Owns the profile the seeded report is filed against, and carries a name of record so the reset has something to restore |
| `moderator@devdogs.test` | Holds a Moderator role: works the report queue, and nothing else                                                        |

Root is deliberately left **unheld**, so the first thing to do on a fresh
instance is take it:

```bash
pnpm devtools grant-root
```

That writes the row with the service key, which is the only credential involved
— there is no RPC to call and no permission you could already hold. It replaced
`platform.claim_root()`, which any authenticated caller could invoke as long as
nobody held Root: on a freshly reset production database with sign-up open to
the university, that would have gone to whoever authenticated first.

For the reporting and moderation tooling that runs against this stack, see
[Reporting & Feedback](./reporting-and-feedback.md); for how content becomes
reportable in the first place, [Moderatable Content](./moderatable-content.md).

## Local docs preview

```bash
pnpm --filter platform docs:preview
```

Then visit the docs preview route on the running dev server. It auto-refreshes
when you save any file in `docs/` and renders like the live docs site.
