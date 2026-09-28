---
name: Hosted databases
description: The maintainer-only half of devtools db — linking a project, pushing config.toml to it, and the commands that manage hosted infrastructure.
order: 4
section: infrastructure
---

# Hosted databases

The contributor-facing half of `devtools db` — sessions, `migrate`, `reset`,
`status` — is [`devtools db` commands](/docs/toolkit/guides/devtools-db).
This page is the rest: the commands that operate on a hosted Supabase
project (staging or production) rather than the local Docker stack, and that
a maintainer or officer runs, not a contributor working on a feature.

## Linking a project

`pnpm devtools db connect <project-ref>` runs `supabase link` for anyone
driving the bare `supabase` CLI by hand against a hosted project. Nothing in
devtools reads the link state it writes any more — every devtools `db`
command drives the CLI with an explicit `--db-url` instead.

## Pushing config to a hosted project

`db config push` pushes `config.toml` to the session's hosted project. A
local session is refused — the stack reads the file directly at `db start`,
so there is nothing to push there.

## Managing hosted infrastructure

`db planner` and `db signing-key` manage hosted infrastructure that names its
own connection, separately from the session's `DB_URL` — provisioning and
credential rotation for a hosted project, rather than anything that touches
its data.

## Applying a migration to a hosted tier

| Target                  | How                                                       |
| ------------------------ | ---------------------------------------------------------- |
| the shared dev project  | `pnpm devtools --tier development:remote db migrate`      |
| production              | `production-migrate` in `.github/workflows/deploy.yaml`    |

`pnpm devtools --tier development:remote db migrate` runs `supabase db push
--db-url` against the session's database — only the migrations its history
table has not recorded — and then regenerates the `Database` types.
Production is pushed by CI behind two dry runs: `main-plan` prints the plan
on every merge to `main`, and `production-plan` recomputes it seconds before
the real push, because the first goes stale as soon as another promotion
lands.

Staging is **not** migrated by that workflow. `staging-preflight` only
classifies the project as awake or paused, and `staging-deploy` builds and
deploys the Workers.

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the
> schema with no migration record and no rollback path. No script in this
> repo runs it, and none should.
