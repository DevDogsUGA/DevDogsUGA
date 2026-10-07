---
name: Hosted databases
description: The maintainer-only half of the database tooling — pushing config.toml to a hosted project, migrating one, and the commands that manage hosted infrastructure.
order: 4
section: infrastructure
---

# Hosted databases

The contributor-facing half — sessions, `db push`, `db reset`, types — is
[Running the database](../guides/devtools-db.md). This page is the
rest: the commands that operate on a hosted Supabase project (staging or
production) rather than the local Docker stack, and that a maintainer or
officer runs, not a contributor working on a feature. The migrations are
authored here, but staging and production are only ever migrated by the deploy
pipeline in [Backstage](https://github.com/DevDogsUGA/Backstage).

## Linking a project

`supabase link --project-ref <project-ref>` is for anyone driving the bare
`supabase` CLI by hand against a hosted project. Nothing in devtools reads the
link state it writes — `pnpm devtools supabase …` always fills in `--db-url` or
`--project-ref` from the session's tier instead, and never falls back to the
linked project.

## Pushing config to a hosted project

`pnpm devtools push-config` pushes `config.toml` to the session's hosted
project (`--yes` answers its confirmation). A local session is refused and
offered a restart instead — the stack reads the file directly at
`supabase start`, so there is nothing to push there.

## Managing hosted infrastructure

`backstage planner` (run from a Backstage clone, see [devtools](../guides/devtools.md#what-lives-elsewhere)) manages the `migration_planner` role the preflight tier
holds, which names its own connection (`--db-url`, defaulting to
`.env.production`'s `DB_URL`) separately from any session. `status` reports what
the preflight credential can reach, `create` mints the role and writes
`.env.preflight`, `reset-password` rotates the password, and `drop` removes the
role. These are provisioning and credential rotation, not anything that touches
the project's data.

## Applying a migration to a hosted tier

| Target                 | How                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| the shared dev project | `pnpm devtools --tier development:remote apply-migrations`          |
| staging                | `staging-migrate` in Backstage's `.github/workflows/deploy.yaml`    |
| production             | the `production` job in Backstage's `.github/workflows/deploy.yaml` |

`apply-migrations` runs `supabase db push --db-url` against the
session's database — only the migrations its history table has not recorded.

Backstage's deploy pushes staging and production with `backstage deploy migrate
--include-seed`, so the seed files a tier has not recorded run right after its
migrations, and then `backstage deploy avatars` uploads any seeded headshot the
bucket lacks without replacing existing ones (see
[Migrations](../../platform/guides/migrations.md)'s "Seeds"). Production sits
behind two dry runs (`backstage deploy plan --include-seed`): `production-plan`
prints the plan, seeds included, on every merge to `main` under the read-only
`migration_planner` role, and the `production` job recomputes it seconds before
the real push, because the first goes stale as soon as another promotion lands.
The migrations and seeds it applies are this repository's, at the commit
Backstage's `devdogsuga.lock` names.

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the
> schema with no migration record and no rollback path. No script in either
> repo runs it, and none should.
