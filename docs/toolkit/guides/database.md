---
name: database
description: The devtools db group — start, migrate and reset the session's Supabase database, plus migrations, types, seeding, introspection and hosted infrastructure.
order: 4
---

# Database commands

The `db` group of [devtools](/docs/toolkit/guides/devtools). No subcommand
takes a database flag: the **session** you launched devtools under already
names the one database every data command acts on, and each command reads it
from the entered environment's `DB_URL` — the same variable the apps use.

```bash
pnpm devtools db reset                                # the session's database
pnpm devtools --tier staging db migrate               # a staging session
pnpm devtools --tier development:remote db status     # .env's remote dev DB
```

The session selector is one flag with a closed set of values:

| `--tier`             | Loads                        | `db` commands act on             |
| -------------------- | ---------------------------- | -------------------------------- |
| `development:local`  | `.env.generated` over `.env` | the Docker stack (must be up)    |
| `development:remote` | `.env` alone                 | whatever `DB_URL` in `.env` says |
| `staging`            | `.env.staging`               | the staging project              |
| `production`         | `.env.production`            | ⚠️ the production project        |

Bare `development` is still accepted: with no `DB_URL` in `.env` it simply
means the local stack (the port probe decides the overlay, as always); with
one, the two development databases are both real, so an interactive launch
asks which and a script must say — `local` and `remote` are qualified because
staging and production are _also_ remote. The retired `--target local|remote`
flag is refused by name, so an old script fails loudly instead of quietly
running against a default.

Every data command drives the Supabase CLI with an explicit
`--db-url <the session's DB_URL>` — never the CLI's own `--local`/`--linked`
modes, whose defaults disagree per subcommand (`db push` defaults to the
_linked_ project, `db reset` to `--local`). The one exception is
`db seed buckets`, which drives the Storage API (no `--db-url` exists):
`--local` for a local session, `--project-ref <PROJECT_REF> --linked` for a
hosted one.

## Two layers under one name

`db` covers both the **stack** — the Docker containers, the auth server,
PostgREST, Studio — and the **Postgres database** the session names. The
lifecycle commands act on the stack on this machine regardless of session,
because a hosted project has no container here:

| Command      | What it does                                               |
| ------------ | ---------------------------------------------------------- |
| `db start`   | `supabase start`, writes `.env.generated`, seeds buckets   |
| `db stop`    | `supabase stop`, and removes `.env.generated`              |
| `db restart` | stop, then start again — how a changed `config.toml` lands |

The distinction is the one that costs people an afternoon: `config.toml` is
read at `supabase start`, so `db reset` replays migrations into containers
still holding the old settings. `db restart` is what picks a config change up.

## Sessions and the local stack

`pnpm devtools db start` runs `supabase start`, writes Supabase's own
connection block to `.env.generated`, and seeds the storage buckets. Which
database a development session means is decided at _launch_, not per command:
`development:local` requires the stack to actually answer on port 54321 (a
TCP probe — the file is a hint, the port is the truth) and refuses up front
with troubleshooting when it does not, rather than falling back to whatever
`.env` happens to name. `db` and the bare menu are exempt from that refusal
so `db start` can fix the very state it reports.

`pnpm devtools db connect <project-ref>` runs `supabase link` for anyone
driving the bare `supabase` CLI by hand. Nothing in devtools reads the link
state it writes any more.

## migrate and reset

`db migrate` applies migrations that have not run yet (`supabase db push
--db-url …`) and then regenerates
`packages/supabase/src/database.types.ts`. It erases nothing. Against
anything but your local stack it names the target — tier and host, never the
URL, which carries the password — and asks first.

`db reset` is different. It drops the database, replays every migration from
scratch, runs the seeds, regenerates the types and re-seeds the storage
buckets — so it always asks first, the confirmation defaults to no on
anything but the local stack, and a production session gets the sternest
wording of all. Non-interactively, `--yes` is the one way past any of these
gates. It is also the command that puts a new migration into your database:
[Database](/docs/platform/guides/database) is the change loop, including the
introspection that `reset` deliberately does not do — that is
`db introspect`.

## status

For a local session this reports what the menu reads before it draws itself:
whether Docker answers, whether this project's containers are up, and whether
a root `.env` exists — then names the next command. It still stops short of
printing the URLs and keys: `supabase status` does that, it is one line away,
and a status check is not a reason to fill your scrollback with credentials.

For a hosted session it is a signpost to the Supabase dashboard, and
deliberately: the dashboard answers that question better than a wrapper
could.

## The rest of the group

`db migration new`/`db migration generate` create or draft migration files;
`db types` regenerates the Database types on their own; `db seed buckets`/
`db seed roles` seed storage or the built-in roles; `db introspect` pulls an
app's live schema into its generated Drizzle files; `db config push` pushes
`config.toml` to the session's hosted project (a local session is refused —
the stack reads the file directly at `db start`); `db planner` and
`db signing-key` manage hosted infrastructure that names its own connection;
and `db exec -- <args…>` is the escape hatch straight to the Supabase CLI.
`pnpm devtools db --help` lists all of it, grouped by what you have to decide
first.
