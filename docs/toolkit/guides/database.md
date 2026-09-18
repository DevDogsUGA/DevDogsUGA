---
name: database
description: The devtools db group — start, connect, migrate and reset Supabase on this machine or the linked project, plus migrations, types, seeding, introspection and hosted infrastructure.
order: 4
---

# Database commands

The `db` group of [devtools](/docs/toolkit/guides/devtools). Several of its
subcommands take a target:

```bash
pnpm devtools db start                        # machine-local; ignores --target
pnpm devtools db reset --target remote
pnpm devtools db status --target local
```

The target is one flag with a closed set of values, so `local` and `remote`
cannot both be passed. Omit it and every target-taking subcommand defaults to
`local`.

| Command      | `--target local`                                 | `--target remote`                   |
| ------------ | ------------------------------------------------ | ----------------------------------- |
| `db connect` | (n/a — registers a hosted project's ref instead) | `supabase link --project-ref <ref>` |
| `db migrate` | `supabase db push`, then regenerate the types    | the same steps, `--linked`          |
| `db reset`   | ⚠️ erases, replays migrations, then seeds        | ⚠️ same, against the linked project |
| `db status`  | reports Docker, Supabase here and `.env`         | points at the Supabase dashboard    |

`db stop` and `db restart` act on the Docker containers on this machine, so
they take no target and refuse one — a hosted project has no container here to
act on:

| Command      | What it does                                               |
| ------------ | ---------------------------------------------------------- |
| `db stop`    | `supabase stop`, and removes `.env.generated`              |
| `db restart` | stop, then start again — how a changed `config.toml` lands |

Both target paths drive the Supabase CLI directly, through the shared helpers
in `packages/devtools/src/db/run.ts`. This used to delegate to lifecycle
scripts in `@devdogsuga/supabase` by name; those scripts are gone, and the one
definition of what "reset" means now lives in `stack.ts`.

## Two layers under one name

`db` covers both the **stack** — the Docker containers, the auth server,
PostgREST, Studio — and the **Postgres database** inside it. `db start`,
`db connect`, `db stop` and `db restart` act on the stack; `db status`,
`db migrate` and `db reset` act on the database, and survive a restart.
`pnpm devtools db --help` and the menu both label which is which, because the
distinction is the one that costs people an afternoon: `config.toml` is read at
`supabase start`, so `db reset` replays migrations into containers still
holding the old settings. `db restart` is what picks a config change up.

## start and connect

`pnpm devtools db start` runs `supabase start`, writes Supabase's own connection
block to `.env.generated`, and seeds the storage buckets. Nothing switches you
between this machine and a hosted project by flag at _run_ time: `with-env`
probes port 54321 on every run, so a listening instance layers `.env.generated`
over `.env` and a stopped one falls back to the linked project. Stop it with
`pnpm devtools db stop`, which removes `.env.generated` too, and use
`pnpm devtools db restart` to pick up a `config.toml` change — there is no
`supabase restart`, so it is the stop/start pair under one name.

`pnpm devtools db connect <project-ref>` links the CLI to that hosted project
and writes nothing else; fill the Supabase values into `.env` first. It is what
makes `--target remote` mean something afterward.

## migrate and reset

`db migrate` applies migrations that have not run yet and then regenerates
`packages/supabase/src/database.types.ts`. It erases nothing. `--target local`
and `--target remote` run the same two steps (the remote path adds `--linked`) —
this is the one command where the target barely changes what happens.

`db reset` is different. It drops the database, replays every migration from
scratch, runs the seeds, regenerates the types and re-seeds the storage
buckets — so it always asks first, and the confirmation defaults to no on
anything but `--target local`. It is also the command that puts a new
migration into your database: [Database](/docs/platform/guides/database) is
the change loop, including the introspection that `reset` deliberately does
not do — that is `db introspect`.

## status

Against `--target local` this reports what the menu reads before it draws itself:
whether Docker answers, whether this project's containers are up, and whether a
root `.env` exists — then names the next command. It used to print "Run
`supabase status`", which made it a status command whose whole output was the
name of another status command. It still stops short of printing the
URLs and keys: `supabase status` does that, it is one line away, and a status
check is not a reason to fill your scrollback with credentials.

`--target remote` is still a signpost, and deliberately: the dashboard answers
that question better than a wrapper could.

## The rest of the group

`db migration new`/`db migration generate` create or draft migration files;
`db types` regenerates the Database types on their own; `db seed buckets`/
`db seed roles` seed storage or the built-in roles; `db introspect` pulls an
app's live schema into its generated Drizzle files; `db config push` pushes
`config.toml` to the linked project; `db planner` and `db signing-key` manage
hosted infrastructure that names its own connection; and `db exec -- <args…>`
is the escape hatch straight to the Supabase CLI. `pnpm devtools db --help`
lists all of it, grouped by what you have to decide first.
