---
name: Hosted databases
description: The maintainer-only half of the database tooling — pushing config.toml to a hosted project, migrating one, and the commands that manage hosted infrastructure.
order: 4
section: infrastructure
---

# Hosted databases

The contributor-facing half — sessions, `db push`, `db reset`, types — is
[Running the database](/docs/toolkit/guides/devtools-db). This page is the
rest: the commands that operate on a hosted Supabase project (staging or
production) rather than the local Docker stack, and that a maintainer or
officer runs, not a contributor working on a feature.

## Linking a project

`supabase link --project-ref <project-ref>` is for anyone driving the bare
`supabase` CLI by hand against a hosted project. Nothing in devtools reads the
link state it writes — `pnpm devtools supabase …` always fills in `--db-url` or
`--project-ref` from the session's tier instead, and never falls back to the
linked project.

## Pushing config to a hosted project

`pnpm devtools preset push-config` pushes `config.toml` to the session's hosted
project (`--yes` answers its confirmation). A local session is refused and
offered a restart instead — the stack reads the file directly at
`supabase start`, so there is nothing to push there.

## Managing hosted infrastructure

`pnpm backstage planner` manages the `migration_planner` role the preflight tier
holds, which names its own connection (`--db-url`, defaulting to
`.env.production`'s `DB_URL`) separately from any session. `status` reports what
the preflight credential can reach, `create` mints the role and writes
`.env.preflight`, `reset-password` rotates the password, and `drop` removes the
role. These are provisioning and credential rotation, not anything that touches
the project's data.

## Applying a migration to a hosted tier

| Target                 | How                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| the shared dev project | `pnpm devtools --tier development:remote preset apply-migrations` |
| production             | `production-migrate` in `.github/workflows/deploy.yaml`           |

`preset apply-migrations` runs `supabase db push --db-url` against the
session's database — only the migrations its history table has not recorded —
and then asks whether to regenerate the `Database` types with `types:db`.
Production is pushed by CI with `backstage deploy migrate`, behind two dry
runs (`backstage deploy plan`): `main-plan` prints the plan on every merge to
`main`, and `production-plan` recomputes it seconds before the real push,
because the first goes stale as soon as another promotion lands.

Staging is **not** migrated by that workflow. `staging-preflight` only
classifies the project as awake or paused, and `staging-deploy` builds and
deploys the Workers.

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the
> schema with no migration record and no rollback path. No script in this
> repo runs it, and none should.
