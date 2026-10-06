---
name: Running the database
description: Starting, migrating and resetting the session's Supabase database with the real supabase CLI, plus the types and roles around it.
order: 4
section: guides
---

# Running the database

There is no `devtools db` group any more. The database is driven by the real
[Supabase CLI](https://supabase.com/docs/reference/cli), which
[devtools](./devtools.md) runs with the **session's** database
filled in, and by the package scripts that regenerate what is derived from it.
The session you launched devtools under names the one database every command
acts on, read from the entered environment's `DB_URL` — the same variable the
apps use.

```bash
pnpm devtools supabase db reset                           # the session's database
pnpm devtools --tier staging supabase db push             # a staging session
pnpm devtools --tier development:remote supabase db push  # .env's remote dev DB
```

The session selector is one flag with a closed set of values:

| `--tier`             | Loads                        | Commands act on                  |
| -------------------- | ---------------------------- | -------------------------------- |
| `development:local`  | `.env.generated` over `.env` | the Docker stack (must be up)    |
| `development:remote` | `.env` alone                 | whatever `DB_URL` in `.env` says |
| `staging`            | `.env.staging`               | the staging project              |
| `production`         | `.env.production`            | ⚠️ the production project        |

Bare `development` is still accepted: with no `DB_URL` in `.env` it simply
means the local stack (the port probe decides the overlay, as always); with
one, the two development databases are both real, so an interactive launch
asks which and a script must say — `local` and `remote` are qualified because
staging and production are _also_ remote.

`pnpm devtools supabase …` adds `--db-url <the session's DB_URL>` (or
`--project-ref` for the commands that take one) unless you passed `--local`,
`--linked`, `--db-url` or `--project-ref` yourself. It never falls back to the
CLI's own linked project, whose defaults disagree per subcommand (`db push`
defaults to the _linked_ project, `db reset` to `--local`). Against staging or
production it asks once before it runs, and `--yes` answers it.

Staging and production operation — pushing `config.toml`, migrating a hosted
project — is covered in [Hosted databases](../infrastructure/hosted-databases.md).

## Two layers under one tool

`supabase` covers both the **stack** — the Docker containers, the auth server,
PostgREST, Studio — and the **Postgres database** the session names. The
lifecycle commands act on the stack on this machine regardless of session,
because a hosted project has no container here:

| Command                        | What it does                                        |
| ------------------------------ | --------------------------------------------------- |
| `pnpm devtools supabase start` | starts the stack and writes `.env.generated`        |
| `pnpm devtools supabase stop`  | stops it                                            |
| `pnpm devtools restart-stack`  | stop, then start again — how a changed config lands |

The distinction is the one that costs people an afternoon: `config.toml` is
read at `supabase start`, so `db reset` replays migrations into containers
still holding the old settings. `restart-stack` is what picks a config change
up.

## Sessions and the local stack

Which database a development session means is decided at _launch_, not per
command: `development:local` requires the stack to actually answer on port
54321 (a TCP probe — the file is a hint, the port is the truth). When it does
not, an interactive session **offers to start the stack for you** and then
carries on with whatever command you ran. Decline the offer (or run off a TTY)
and it refuses up front with troubleshooting rather than falling back to
whatever `.env` happens to name. `setup`, `doctor` and the bare menu are exempt
from that refusal so they can report the very state that needs fixing.

## Migrate and reset

`supabase db push` applies migrations that have not run yet. It erases nothing.
`pnpm devtools apply-migrations` runs it and then asks whether to
regenerate `packages/supabase/src/database.types.ts`, which is the
`types:db` script:

```bash
pnpm devtools apply-migrations
pnpm -F @devdogsuga/supabase types:db
```

Against anything but your local stack it names the target — tier and host,
never the URL, which carries the password — and asks first.

`supabase db reset` is different. It drops the database and replays every
migration from scratch, so against anything but the local stack it asks first,
the confirmation defaults to no, and a production session gets the sternest
wording of all. Non-interactively, `--yes` is the one way past any of these
gates. A reset leaves the database empty of types and buckets, which are
separate steps now:

```bash
pnpm devtools supabase db reset
pnpm -F @devdogsuga/supabase types:db
pnpm devtools supabase seed buckets
```

`db push` is also the command that puts a new migration into your database:
[Writing a migration](../../platform/guides/migrations.md) is the change loop,
including the Drizzle introspection below.

## Checking the state

`pnpm devtools doctor` is the status check. For a local session it reports
whether Docker answers, whether this project's containers are up, whether
`.env` exists, and whether the types, buckets and seeded data are in place —
then names the next command. It stops short of printing the URLs and keys:
`pnpm devtools supabase status` does that, and a status check is not a reason
to fill your scrollback with credentials. For a hosted session the Supabase
dashboard answers the question better than a wrapper could.

## The rest

- `pnpm devtools new-migration` creates an empty migration file for an
  app's schema, for you to write by hand (`supabase migration new` is the same
  thing without the app prompt).
- `pnpm -F <app> types:drizzle` pulls the app's live schema into its generated
  Drizzle files. It is the introspection `reset` deliberately does not do.
- `pnpm devtools roles list|grant|revoke` manages who holds each role. It
  replaces the old `db seed roles` and `grant-root`, and works on every tier.
- `pnpm devtools drizzle-kit …` and `pnpm devtools psql` are the real tools
  against the session's database.

`pnpm devtools --help` lists every command, grouped by what you have to decide
first.
