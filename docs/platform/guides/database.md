---
name: Database
description: SQL migrations own the schema and the Drizzle types are introspected from it — the change loop, the seeds, and how a migration reaches each database.
order: 3
section: infrastructure
---

# Database

The platform's tables live in the `platform` schema of the shared Supabase Postgres database, built by the one migration history at `supabase/migrations/`. Read this before you add a table, a column, a policy, or a trigger: it covers the change loop, the seeds, how contributors keep out of each other's way, and how a migration reaches the dev project and production. If you only want to _query_ the database, you want [Database (Drizzle)](/docs/platform/guides/stack/db) instead — the client factory, both `drizzle-kit` configs, and the pooler settings that are not optional are all there.

## SQL is the source of truth

`supabase/migrations/*.sql` owns the schema. `apps/platform/src/server/db/schema/generated/schema.ts` is introspected **from the live database** by `drizzle-kit pull` and is never edited by hand. The only file written by hand beside it is `src/server/db/relations.ts`, a `defineRelations` call over those generated tables.

So a schema change is a SQL change, and the TypeScript follows it. RLS policies, triggers, functions, and storage policies all sit in the migration file next to the table DDL — there is no workaround layer to route around, because Drizzle does not own any of it.

## Making a schema change

```bash
pnpm devtools db migration new
```

asks which app/schema the migration belongs to (`platform`, `schedule_builder`, or `study_group_finder`) and writes an empty `supabase/migrations/<timestamp>_<schema>_<desc>.sql`. Put the DDL in it:

```sql
alter table "platform"."profile" add column "website" text;
```

Then replay it, and regenerate the two type artifacts it can affect:

```bash
pnpm devtools db reset                # drop, replay every migration, run the seeds, regenerate types
pnpm devtools db introspect --app platform   # re-introspect the Drizzle schema
```

`pnpm devtools db reset` regenerates `packages/supabase/src/database.types.ts`, the `Database` types `supabase-js` uses — the same thing `pnpm devtools db types` does on its own against a database that is already up to date. Neither touches the Drizzle schema — that is `db introspect`, which runs both configs and then `scripts/post-pull.ts`. If you added tables or foreign keys, add the matching relations to `src/server/db/relations.ts` by hand.

Commit the migration, the regenerated types, and the relations change together. CI regenerates `database.types.ts` against your migrations and fails on any diff.

<details>
<summary>What does a table with its policies look like in one migration?</summary>

Everything the table needs, in the file that creates it. Abridged from `20260829050100_16_platform_team_awards.sql`:

```sql
alter table "platform"."competitionEntries" enable row level security;

create index "competitionEntries_competitionId_idx"
  on "platform"."competitionEntries" ("competitionId");

create policy "public_select" on "platform"."competitionEntries"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."competitionEntries"
  as restrictive for insert to anon, authenticated with check (false);
```

Row-Level Security is the whole isolation boundary between app schemas — every one of them is reachable through the same PostgREST endpoint and the same publishable key. A new policy, grant, or `security definer` function means running the persona suite as well: `pnpm --filter @devdogsuga/supabase test:rls`, against a live stack.

</details>

## Seeds

`supabase/seed/` is split into `production/` and `development/`. `pnpm devtools db reset` runs both — `config.toml`'s `[db.seed]` block lists `seed/production/*.sql` before `seed/development/*.sql` — and `db push` applies migrations without either. `production/01_roles.sql` owns the complete role and permission catalogue without assigning Root; `production/03_officers.sql` creates officer profiles and assignments; `development/02_moderation.sql` creates three sign-in-able personas and one open report — `member@`, `author@` and `moderator@devdogs.test`, password `password` for all three; see [Integrating an app](/docs/platform/guides/reporting/integrating)'s "Testing it" for what each is for.

A staging or production target never runs `db reset` — that erases everything else on it — so it only ever gets `seed/production/`, applied on its own by the Backstage devtools' `db seed production` command.

Seeds are the right home for anything that must never exist in production, precisely because the reset they ride on is never pointed there. Migrations are the wrong home for the same reason.

## Sharing a migration history

**Generate the file late.** Iterate with `pnpm devtools db reset` while you work the schema out, and create the migration once the branch is ready to merge — after rebasing — so it is written against the current baseline rather than a stale one:

```bash
git fetch && git rebase origin/main
pnpm devtools db reset
```

**One migration per pull request**, covering every schema change in it. If two branches generate migrations from the same baseline and touch the same tables, whoever merges second reconciles by hand; a `pnpm devtools db reset` after the merge surfaces it immediately. CI's `database` job starts a stack on an empty volume for every pull request, so "every migration still applies from scratch" is checked whether or not you thought to.

If `main` grew a newer migration while yours was open, recreate yours with a fresh timestamp rather than rebasing the old one in place — CI fails a pull request whose new migration timestamps older than `main`'s latest. Regenerate types with `pnpm devtools db types` afterward; never hand-merge `packages/supabase/src/database.types.ts`, it is generated and any manual edit is overwritten by the next reset anyway.

## Applying a migration

| Target                 | How                                                     |
| ---------------------- | ------------------------------------------------------- |
| your own stack         | `pnpm devtools db reset`                                |
| the shared dev project | `pnpm devtools --tier development:remote db migrate`    |
| production             | `production-migrate` in `.github/workflows/deploy.yaml` |

`pnpm devtools --tier development:remote db migrate` runs `supabase db push --db-url` against the session's database — only the migrations its history table has not recorded — and then regenerates the `Database` types. Production is pushed by CI behind two dry runs: `main-plan` prints the plan on every merge to `main`, and `production-plan` recomputes it seconds before the real push, because the first goes stale as soon as another promotion lands.

Staging is **not** migrated by that workflow. `staging-preflight` only classifies the project as awake or paused, and `staging-deploy` builds and deploys the Workers.

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the schema with no migration record and no rollback path. No script in this repo runs it, and none should.

<details>
<summary>Which command am I actually looking for?</summary>

`pnpm devtools` with no arguments opens the grouped menu of interactive
commands — the shortest path when you do not already know the name.

Database operations live under `pnpm devtools db`. Endpoint commands such as
`status`, `migrate`, `reset`, and `types` act on the session's database
(`--tier development:local|development:remote|staging|production`, picked at
launch), while `start`, `stop`, and `restart` act on this machine's
containers. Run `pnpm devtools db --help` for the full list, grouped by
layer.

The `devtools db` commands worth knowing directly:

| Command                                       | What it does                                                   |
| --------------------------------------------- | -------------------------------------------------------------- |
| `pnpm devtools db migration new`              | Create an empty, correctly timestamped migration               |
| `pnpm devtools db types`                      | Regenerate `database.types.ts`, format it, rebuild the package |
| `pnpm devtools db introspect --app <slug>`    | Re-introspect that app's Drizzle schema                        |
| `pnpm --filter @devdogsuga/supabase test:rls` | The RLS persona suite — needs a running stack                  |
| `pnpm devtools db seed roles`                 | Reconcile the role and permission catalogue                    |

</details>
