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

Help prints one level at a time: `pnpm devtools --help` lists the groups,
`pnpm devtools env --help` lists env's subcommands, `pnpm devtools env pull
--help` lists that command's options. Depth is reached by asking for it.

## The groups

**Start here** — `setup` checks your prerequisites (Node, corepack, Docker,
Flutter) and writes a root `.env` carrying only the sections for the projects
you say you are on. Node and corepack are warnings when they are wrong; Docker
and Flutter report as information, because a contributor without either is not
misconfigured, just not working on that part of the repo.

`pnpm setup` is the shortcut, and it routes through `cli:no-env` — the
devtools entry point that skips the `with-env` wrapper. It has to: `with-env`
exits when there is no `.env`, and a clean clone has none, so the command whose
job is to create that file cannot be wrapped in something that requires it.
Other callers use `cli:no-env` for the same reason, CI mostly, where there is
no `.env` either.

**Your database** — `link`, `push`, `reset` and `status`, each over
`--local | --remote | --team <slug>`. `pnpm sb` is the same binary and the same
four commands: see [sb](/docs/toolkit/guides/sb).

**Moderation** — `catalog` lists the report reasons and content types in your
database, `doctor --app <slug>` checks one app's moderation integration,
`roundtrip` files a report, quarantines it, checks the freeze and cleans up
after itself, and `grant-root --user <email>` gives an account every permission
on your own database. All four run against the local stack and nothing else.

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

That is also why the summaries are one line each. Rationale, target tables and
credential lookup order live in these pages: `--help` is a map, and a map that
reprints the territory is the thing this replaced.

Every exported symbol is in the generated
[`@devdogsuga/devtools`](/docs/toolkit/reference/api/devtools) reference.
