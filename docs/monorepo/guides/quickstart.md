---
name: Quickstart
description: Clone the monorepo and get an app running, against either a local Docker Supabase stack or a hosted Supabase project.
order: 1
---

# Quickstart

Clone to a running app. This is a contributor's first hour; if you already have a `.env` and a database, you want [Contributing](/docs/monorepo/guides/contributing) instead. The path forks exactly once, at the database — a local Docker stack that needs no credentials, or a hosted Supabase project you already have keys for. Everything before the fork is the same either way.

## Prerequisites

- **Node >= 22.12.** `.nvmrc` pins 24. The floor is 22.12 because pnpm 11 needs `node:sqlite`, which stabilised there.
- **pnpm through corepack.** The repo pins `pnpm@11.8.0`, and `corepack enable` gets you that exact version.
- **Docker** — only for the local Supabase stack.
- **The Flutter SDK** — only for `apps/study-group-finder`.

The setup command below checks all four for you. Docker and Flutter report as `INFO` rather than a warning: not having them is a statement about which app you are working on, not a broken machine.

## Install, and create your .env

```bash
git clone https://github.com/DevDogsUGA/DevDogsUGA.git
cd DevDogsUGA
corepack enable && pnpm install
pnpm devtools setup
```

Setup asks which projects you are on and writes a root `.env` carrying only those sections. An existing `.env` is left untouched. The file starts blank — the local stack fills the connection block in for you, and only a hosted project needs values typed in.

## Then either: a local stack

```bash
pnpm devtools db start      # boots Docker Supabase, writes .env.generated
pnpm devtools db reset     # replays the migrations, then the seeds, then regenerates types
pnpm dev --filter schedule-builder   # or study-group-finder, or platform — whichever you set up
```

Stop it with `pnpm devtools db stop`, which also removes `.env.generated`. `pnpm devtools db restart` is the stop/start pair under one name, which is how a changed `config.toml` lands.

## Or: a hosted project

Fill in the Supabase values in `.env`, then:

```bash
pnpm devtools db connect <project-ref>
pnpm --filter @devdogsuga/supabase generate-types
pnpm dev --filter schedule-builder   # or whichever app you set up
```

> [!IMPORTANT]
> For `DB_URL`, take the **Session pooler** string (port 5432), not the Transaction pooler. `drizzle-kit` relies on prepared statements the transaction pooler does not support, so it hangs instead of erroring.

Nothing switches between the two by flag. `with-env` probes port 54321 on every run: a listening local stack layers `.env.generated` over `.env` and wins, a stopped one falls back to the linked project. Every run prints the files it actually loaded.

> [!NOTE]
> `pnpm dev --filter schedule-builder` and `pnpm --filter schedule-builder dev` are not the same command. The first goes through turbo, whose `dev` task depends on `^build`, so workspace packages — the compiled docs among them — are built first. The second bypasses turbo entirely. The same distinction holds for any app you filter to.

<details>
<summary>What does <code>pnpm devtools db reset</code> seed?</summary>

Three files under `supabase/seed/`, and only on a reset — seeds never run on `pnpm devtools db migrate`.

**`01_roles.sql`** defines Member, Root, and the organization’s officer roles and permission grants. It never assigns Root, so `pnpm devtools grant-root --user <email>` remains an explicit act by someone who controls the database.

**`02_moderation.sql`** creates three personas and one open report against a real `platform."profile"` row. All three sign in with the password `password`:

- `member@devdogs.test`
- `author@devdogs.test`
- `moderator@devdogs.test`

Nobody holds Root, deliberately. Take it explicitly on an instance you control with `pnpm devtools grant-root`; signing in as `member@devdogs.test` remains the way to see what an ordinary member sees.

**`03_officers.sql`** creates the current officer profiles and assigns the organizational roles from `01_roles.sql`.

</details>

## Next

`pnpm devtools` with no arguments opens the grouped menu of interactive
commands, so nothing here needs you to remember a name. When a command finishes,
the CLI prints the flag-complete form of what it ran under **Run it directly
next time**, so walking the menu once teaches you the command to paste later.
Shell-only utilities remain available through `pnpm devtools --help`.

`pnpm devtools` works from any directory, not just the repository root. For details on tier selection when your project has multiple `.env` files, see [Contributing](/docs/monorepo/guides/contributing).
