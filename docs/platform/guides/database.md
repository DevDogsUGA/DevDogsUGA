---
name: Database
description: SQL migrations own the schema and the Drizzle types are introspected from it — the change loop, the seeds, and how a migration reaches each database.
order: 3
---

# Database

The platform's tables live in the `platform` schema of the shared Supabase Postgres database, built by the one migration history at `supabase/migrations/`. Read this before you add a table, a column, a policy, or a trigger: it covers the change loop, the seeds, how contributors keep out of each other's way, and how a migration reaches the dev project and production. If you only want to _query_ the database, you want [Drizzle](/docs/monorepo/stack/drizzle) instead — the client factory, both `drizzle-kit` configs, and the pooler settings that are not optional are all there.

## SQL is the source of truth

`supabase/migrations/*.sql` owns the schema. `apps/platform/src/server/db/schema/generated/schema.ts` is introspected **from the live database** by `drizzle-kit pull` and is never edited by hand. The only file written by hand beside it is `src/server/db/relations.ts`, a `defineRelations` call over those generated tables.

So a schema change is a SQL change, and the TypeScript follows it. RLS policies, triggers, functions, and storage policies all sit in the migration file next to the table DDL — there is no workaround layer to route around, because Drizzle does not own any of it.

## Making a schema change

```bash
pnpm --filter @devdogsuga/supabase new-migration <name>
```

writes an empty `supabase/migrations/<timestamp>_<name>.sql`. Put the DDL in it:

```sql
alter table "platform"."profile" add column "website" text;
```

Then replay it, and regenerate the two type artifacts it can affect:

```bash
pnpm sb reset                    # drop, replay every migration, run the seeds
pnpm --filter platform db:pull   # re-introspect the Drizzle schema
```

`pnpm sb reset` regenerates `packages/supabase/src/database.types.ts`, the `Database` types `supabase-js` uses. It does **not** touch the Drizzle schema — that is `db:pull`, which runs both configs and then `scripts/post-pull.ts`. If you added tables or foreign keys, add the matching relations to `src/server/db/relations.ts` by hand.

Commit the migration, the regenerated types, and the relations change together. CI regenerates `database.types.ts` against your migrations and fails on any diff.

<details>
<summary>What does a table with its policies look like in one migration?</summary>

Everything the table needs, in the file that creates it. Abridged from `20260803000004_platform_team_awards.sql`:

```sql
alter table "platform"."teamAwards" enable row level security;

-- At most one winner per competition. Partial, because every other
-- category may repeat.
create unique index "teamAwards_one_winner_per_competition"
  on "platform"."teamAwards" ("competitionId") where "category" = 'winner';

create policy "public_select" on "platform"."teamAwards"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."teamAwards"
  as restrictive for insert to anon, authenticated with check (false);
```

Row-Level Security is the whole isolation boundary between app schemas — every one of them is reachable through the same PostgREST endpoint and the same publishable key. A new policy, grant, or `security definer` function means running the persona suite as well: `pnpm --filter @devdogsuga/supabase test:rls`, against a live stack.

</details>

## Seeds

`supabase/seed/*.sql` runs on `pnpm sb reset` and only there — `config.toml`'s `[db.seed]` block points at those files, and `db push` applies migrations without them. `01_roles.sql` defines the built-in Member and Root roles; `02_moderation.sql` creates three sign-in-able personas and one open report filed against a real `platform."profile"` row. [Quickstart](/docs/monorepo/guides/quickstart) lists the personas and their password.

Seeds are the right home for anything that must never exist in production, precisely because the reset they ride on is never pointed there. Migrations are the wrong home for the same reason.

## Sharing a migration history

**Generate the file late.** Iterate with `pnpm sb reset` while you work the schema out, and create the migration once the branch is ready to merge — after rebasing — so it is written against the current baseline rather than a stale one:

```bash
git fetch && git rebase origin/main
pnpm sb reset
```

**One migration per pull request**, covering every schema change in it. If two branches generate migrations from the same baseline and touch the same tables, whoever merges second reconciles by hand; a `pnpm sb reset` after the merge surfaces it immediately. CI's `database` job starts a stack on an empty volume for every pull request, so "every migration still applies from scratch" is checked whether or not you thought to.

## Applying a migration

| Target                 | How                                                     |
| ---------------------- | ------------------------------------------------------- |
| your own stack         | `pnpm sb reset`                                         |
| a team sandbox         | `pnpm sb push --team <slug>`                            |
| the shared dev project | `pnpm sb push --remote`, by hand                        |
| production             | `production-migrate` in `.github/workflows/deploy.yaml` |

`pnpm sb push --remote` runs `supabase db push` against the linked project — only the migrations its history table has not recorded — and then regenerates the `Database` types. Production is pushed by CI behind two dry runs: `main-plan` prints the plan on every merge to `main`, and `production-plan` recomputes it seconds before the real push, because the first goes stale as soon as another promotion lands.

Staging is **not** migrated by that workflow. `staging-preflight` only classifies the project as awake or paused, and `staging-deploy` builds and deploys the Workers.

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the schema with no migration record and no rollback path. No script in this repo runs it, and none should.

<details>
<summary>Which command am I actually looking for?</summary>

`pnpm devtools` with no arguments opens a grouped menu of every command the CLI has, with the options each one takes — the shortest path when you do not already know the name. `pnpm sb` is the same CLI under its older name.

Four database commands — `link`, `push`, `reset`, `status` — each take one target: `--local` (the default), `--remote` (the linked Supabase project), or `--team <slug>` (a team's sandbox, reached through the platform). `stop` and `restart` are the other two; they act on the Docker stack on this machine, so they take no target. `link`, `push`, `reset` and `stop` delegate to the `@devdogsuga/supabase` package scripts by name, so those scripts stay the single definition of what a reset is.

The package scripts worth knowing directly:

| Script                                                    | What it does                                        |
| --------------------------------------------------------- | --------------------------------------------------- |
| `pnpm --filter @devdogsuga/supabase new-migration <name>` | Create an empty migration                           |
| `pnpm --filter @devdogsuga/supabase generate-types`       | Regenerate `Database` types from the linked project |
| `pnpm --filter @devdogsuga/supabase generate-types:local` | The same, from the Docker stack                     |
| `pnpm --filter @devdogsuga/supabase test:rls`             | The RLS persona suite — needs a running stack       |
| `pnpm --filter platform db:pull`                          | Re-introspect the Drizzle schema                    |
| `pnpm --filter platform db:seed-roles`                    | Seed the built-in Member and Root roles             |

</details>
