---
name: devtools
description: The contributor CLI — six groups of commands, an interactive menu that covers all of them, and help that prints one level at a time.
order: 3
---

# devtools

`@devdogsuga/devtools` is the repo's own CLI: databases, moderation checks,
OAuth setup, the env sync, and the steps a deploy job runs. Everything below is
`pnpm devtools <command>`.

**Run `pnpm devtools` with no arguments and it opens a menu.** That is the
intended entry point — a contributor should be able to set up a database and
check their moderation integration without knowing a command name. The wizard
walks the command tree, builds an argv, and hands it to the same dispatcher a
typed command line reaches, so what the menu covers and what the CLI does cannot
drift apart.

**It reads the machine first.** Before the first screen it checks whether Docker
answers, whether this project's containers are up and whether a root `.env`
exists, and shows you those three lines. Commands that would be meaningless are
left out — `stop` and `restart` appear only while a stack is actually running —
and commands that need something you do not have stay on screen with the reason
on the line, so you learn that `roundtrip` wants a stack before choosing it
rather than after a connection error. A probe that fails changes nothing: a
machine the CLI cannot read gets the whole menu, because hiding a command
because `docker ps` timed out would hide the command you were looking for.

Adapting is the menu's job alone. `--help`, the dispatcher and the generated
reference always carry every command — the menu is a guide to right now, and
those three are the reference.

Help prints one level at a time: `pnpm devtools --help` lists the groups,
`pnpm devtools env --help` lists env's subcommands, `pnpm devtools env pull
--help` lists that command's options. Depth is reached by asking for it.

## The groups

**Start here** — `setup` checks your prerequisites (Node, corepack, Docker,
Flutter) and writes a root `.env` carrying only the sections for the projects
you say you are on. Node and corepack are warnings when they are wrong; Docker
and Flutter report as information, because a contributor without either is not
misconfigured, just not working on that part of the repo.

`pnpm devtools setup` works on a clean clone, which is not something the
wrapper it runs under used to allow. `pnpm devtools` is `with-env tsx
src/cli.ts`, and `with-env` once exited when there was no `.env` — so the one
command whose job is to create that file could not be reached through the
wrapper that demanded it. That is why a second entry point, `cli:no-env`,
existed and why the root `setup` alias pointed at it.

`with-env` now reports the absence and carries on, so there is one front door.
A command that genuinely needs a variable still fails, and fails naming the
variable rather than naming a file. `cli:no-env` survives as the seam every
[deploy](/docs/toolkit/reference/api/devtools/deploy) step uses, where the
point is not surviving a missing file but declining to load one that is
present.

**Supabase** — one heading over two layers, and the menu says which on every
line. `link`, `stop`, `restart` and `status` act on **the stack**: the Docker
containers, the auth server, PostgREST, Studio. `push` and `reset` act on **the
Postgres database inside it**, and survive a restart. `link`, `status`, `push`
and `reset` each take `--local | --remote | --team <slug>`; `stop` and
`restart` act on this machine's containers and take no target.

That split is not pedantry — `config.toml` is read at `supabase start`, so
`reset` replays migrations into containers still holding the old settings and
`restart` is what actually picks a config change up. All six are laid out
target by target in [Database commands](/docs/toolkit/guides/database).

**Moderation** — `catalog` lists the report reasons and content types in your
database, `doctor --app <slug>` checks one app's moderation integration,
`roundtrip` files a report, quarantines it, checks the freeze and cleans up
after itself, and `grant-root --user <email>` gives an account every permission
on your own database. All four run against the local stack and nothing else,
which is why the menu flags all four when that stack is not up.

**Project setup** — `oauth` configures "Sign in with DevDogs" for the directory
you run it in. `airtable` holds the officers' base commands: `verify` diffs the
live base against the registry and reads only, `scaffold` creates what the
registry declares, `pull-ids` writes discovered field ids back into
`registry.ts`, and `snapshot` refreshes (or `--check`s) the committed schema
snapshot. `docs index` pushes the built docs artifact into the search index.

**Operator** — `env` is the six-subcommand env sync;
[Env](/docs/toolkit/guides/env) is what it does and
[the commands](/docs/toolkit/guides/env/commands) is how to run it. `planner`
creates, inspects, rotates and drops the `migration_planner` Postgres role the
preflight tier holds. `signing-key` mints `SUPABASE_JWT_SIGNING_KEY` into
`.env.<target>` and registers it with the project as a standby key.

**Deploy** — the steps a deploy job runs, and not for a laptop. They are fully
described in the tree and reachable from the menu, but choosing one **prints the
invocation instead of running it**: they want a runner's environment, and two of
them have a stdout that something downstream parses, so a wizard that ran them
would either fail confusingly or overwrite a local env file with a deploy
environment's values.

## One tree, three readers

`packages/devtools/src/commands.ts` declares the whole tree as inert data —
names, one-line summaries, and option shapes, importing nothing that runs.
`help.ts` renders it, the wizard walks it, and the docs build reads it. There is
no second list of commands anywhere, which is why a command added there is in
the menu and in `--help` the same day.

The environment conditions live there too, and they are strings rather than
predicates for the same reason: `when: "stack-running"` is data the docs build
can render, where a function would be something only the wizard could run.
`environment.ts` is the single place that knows what those strings mean.

That is also why the summaries are one line each. Rationale, target tables and
credential lookup order live in these pages: `--help` is a map, and a map that
reprints the territory is the thing this replaced.

Every exported symbol is in the generated
[`@devdogsuga/devtools`](/docs/toolkit/reference/api/devtools) reference.
