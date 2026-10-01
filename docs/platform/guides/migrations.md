---
name: Writing a migration
description: SQL migrations own the schema and the Drizzle types are introspected from it — the change loop, seeds, and how a migration reaches each database.
order: 3
section: guides
---

# Writing a migration

The platform's tables live in the `platform` schema of the shared Supabase Postgres database, built by the one migration history at `supabase/migrations/`. Read this before you add a table, a column, a policy, or a trigger: it covers the change loop, the seeds, how contributors keep out of each other's way, and how a migration reaches the dev project and production. If you only want to _query_ the database, you want [Database (Drizzle)](/docs/platform/guides/stack/db) instead — the client factory, both `drizzle-kit` configs, and the pooler settings that are not optional are all there.

## SQL is the source of truth

`supabase/migrations/*.sql` owns the schema. `apps/platform/src/server/db/schema/generated/schema.ts` is introspected **from the live database** by `drizzle-kit pull` and is never edited by hand. The only file written by hand beside it is `src/server/db/relations.ts`, a `defineRelations` call over those generated tables.

So a schema change is a SQL change, and the TypeScript follows it. RLS policies, triggers, functions, and storage policies all sit in the migration file next to the table DDL — there is no workaround layer to route around, because Drizzle does not own any of it.

## Making a schema change

```bash
pnpm devtools preset new-migration
```

asks which app/schema the migration belongs to (`platform`, `schedule_builder`, or `study_group_finder`) and writes an empty `supabase/migrations/<timestamp>_<schema>_<desc>.sql`. Put the DDL in it:

```sql
alter table "platform"."profile" add column "website" text;
```

Then replay it, and regenerate the two type artifacts it can affect:

```bash
pnpm devtools supabase db reset       # drop, replay every migration, run the seeds
pnpm -F @devdogsuga/supabase types:db # regenerate the Database types
pnpm -F platform types:drizzle        # re-introspect the Drizzle schema
```

`types:db` rewrites `packages/supabase/src/database.types.ts`, the `Database` types `supabase-js` uses. It does not touch the Drizzle schema — that is `types:drizzle`, which runs both configs and then the fixups in `scripts/drizzle-pull.ts`. If you added tables or foreign keys, add the matching relations to `src/server/db/relations.ts` by hand.

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

Seeds live in two flat folders, listed in `config.toml`'s `[db.seed] sql_paths`: `supabase/seed/roles/<role>.sql` (one file per role) and `supabase/seed/officers/<officer>.sql` (one file per officer: account, profile, academic programs, links and role grants). `officers/avatars/` holds the headshots that `[storage.buckets.avatars] objects_path` loads. Patterns run in the listed order, so roles exist before officers are granted them, and files within a pattern run alphabetically. `**` does not search subfolders, so keep both folders flat. `pnpm devtools supabase db reset` runs them against whichever tier the session points at, and `db push` applies migrations without them.

Every seed statement is insert-only (`on conflict do nothing`), so a file is safe to run again and never overwrites an edit made in the console or in /account. Fix existing data through the console, the CLI or a one-off migration, not by editing a seed. Seeds also never write a role's `discordRoleId` after the role exists: linking a role to Discord goes through the console's link flow. The rule that Member and President exist, and that President holds every permission, is a migration (`20261001130000_42_platform_core_roles.sql`); a new permission column is granted to President by the migration that adds it. To store an officer's Discord user id before they link, insert into `platform."officerDiscordIds"` from their file.

A staging or production target never runs `db reset` — that erases everything else on it. Seed it by hand with `pnpm devtools supabase db push --include-seed`; the deploy pipeline does not seed. Supabase records each file's hash in `supabase_migrations.seed_files`: a new file runs once, and an edited file only gets its hash updated, which matches insert-only. Because that table is empty on staging and production today, record the existing files' hashes there before the first `--include-seed` push, or it runs every file once and brings back anything officers deleted.

There is no seed data for sign-in-able test accounts. Sign in with a second account of your own and give it the role you want to see through, with `pnpm devtools roles grant <email> <role>` (`roles revoke` takes it back). See [Integrating an app](/docs/platform/guides/reporting/integrating)'s "Testing it".

Seeds are the right home for anything that must never exist in production, precisely because the reset they ride on is never pointed there. Migrations are the wrong home for the same reason.

## Sharing a migration history

**Generate the file late.** Iterate with `pnpm devtools supabase db reset` while you work the schema out, and create the migration once the branch is ready to merge — after rebasing — so it is written against the current baseline rather than a stale one:

```bash
git fetch && git rebase origin/main
pnpm devtools supabase db reset
```

**One migration per pull request**, covering every schema change in it. If two branches generate migrations from the same baseline and touch the same tables, whoever merges second reconciles by hand; a `pnpm devtools supabase db reset` after the merge surfaces it immediately. CI's `database` job starts a stack on an empty volume for every pull request, so "every migration still applies from scratch" is checked whether or not you thought to.

If `main` grew a newer migration while yours was open, recreate yours with a fresh timestamp rather than rebasing the old one in place — CI fails a pull request whose new migration timestamps older than `main`'s latest. Regenerate types with `pnpm -F @devdogsuga/supabase types:db` afterward; never hand-merge `packages/supabase/src/database.types.ts`, it is generated and any manual edit is overwritten by the next reset anyway.

## Applying a migration

| Target                 | How                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| your own stack         | `pnpm devtools supabase db reset`                                 |
| the shared dev project | `pnpm devtools --tier development:remote preset apply-migrations` |
| production             | `production-migrate` in `.github/workflows/deploy.yaml`           |

`pnpm devtools --tier development:remote preset apply-migrations` runs `supabase db push --db-url` against the session's database — only the migrations its history table has not recorded — and then offers to regenerate the `Database` types. Staging and production work the same way, with the maintainer-only mechanics — CI's dry runs, `staging-preflight`/`staging-deploy`, and the `backstage deploy` steps that operate on a hosted project — covered in [Hosted databases](/docs/toolkit/infrastructure/hosted-databases).

> [!WARNING]
> Never run `drizzle-kit push` against a hosted database: it writes the schema with no migration record and no rollback path. No script in this repo runs it, and none should.

For what the session `--tier` flag means and the rest of the `devtools supabase` passthrough, see [devtools](/docs/toolkit/guides/devtools).
