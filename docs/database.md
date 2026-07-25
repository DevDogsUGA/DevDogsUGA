# Database & Migrations

## Philosophy

SQL migration files are the source of truth. The Drizzle TypeScript schema (`src/server/db/schema/generated/`) is generated from the live database and never edited by hand. The only hand-maintained schema file is `src/server/db/relations.ts`, which defines Drizzle relational query structure on top of the generated types.

This means:

- **To change the schema**, write SQL — not TypeScript.
- **The TypeScript types follow** from the SQL, not the other way around.
- **RLS policies, triggers, functions, and storage policies** all live in migration files alongside table DDL, with no workarounds needed.

Drizzle is used exclusively as the type-safe query layer. It does not own the schema.

## Making a schema change

```
pnpm db:migration:new <name>
```

This creates `supabase/migrations/<timestamp>_<name>.sql`. Write your DDL in that file.

```sql
-- Example: add a column
alter table "public"."profiles" add column "website" text;
```

Then apply it locally and regenerate TypeScript types:

```
pnpm db:migrate
```

Test locally, then verify the migration replays correctly from scratch:

```
pnpm db:reset
```

If you added new tables or foreign keys, update `src/server/db/relations.ts` to add the corresponding Drizzle relations. Commit the migration file and any relations changes together.

## Injecting extra SQL

Anything that goes beyond plain table DDL belongs directly in the migration file — RLS policies, triggers, functions, storage policies, seed data for system rows:

```sql
-- Adding a table with RLS
create table "public"."announcements" (
  "id" uuid not null default gen_random_uuid(),
  "body" text not null,
  "createdAt" timestamp without time zone not null default now()
);

alter table "public"."announcements" enable row level security;

create policy "announcements_read"
on "public"."announcements"
as permissive for select
to authenticated
using (true);
```

There is no Drizzle workaround layer — write SQL and it works.

## Scripts reference

| Script                         | What it does                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm db:migration:new <name>` | Create a new empty migration file in `supabase/migrations/`                          |
| `pnpm db:migrate`              | Apply pending migrations → regenerate TS types → seed built-in roles                 |
| `pnpm db:reset`                | Wipe local DB, replay all migrations from scratch → regenerate TS types → seed roles |
| `pnpm db:pull`                 | Regenerate TS types from the current DB state without applying migrations            |
| `pnpm db:seed-roles`           | Seed the built-in Member and Root roles (idempotent)                                 |
| `pnpm db:push:remote`          | Push pending migrations to the linked production Supabase project                    |
| `pnpm sb:start`                | Start local Supabase, export credentials to `.env.local`, seed storage buckets       |
| `pnpm sb:stop`                 | Stop local Supabase                                                                  |
| `pnpm sb:restart`              | Stop and restart local Supabase                                                      |
| `pnpm dev`                     | Full local dev startup: start Supabase → apply migrations → start Next.js            |

## Multi-contributor workflow

Database migrations have ordering constraints that code changes don't. Follow these rules to avoid conflicts:

**Generate migration files late.** Don't run `pnpm db:migration:new` at the start of a feature branch. Iterate locally using `pnpm db:migrate` as you figure out the schema, then generate the migration file when the feature is ready to merge — after rebasing onto `main`.

**One migration per PR.** A PR should produce at most one migration file covering all schema changes for that feature. This keeps the history readable and reduces the surface area for conflicts.

**Rebase before generating.** Before running `pnpm db:migration:new`:

```
git fetch && git rebase origin/main
pnpm db:reset   # re-apply all existing migrations on a clean slate
```

Then apply your schema changes on top and generate the file. The migration will be generated against the latest baseline rather than a stale one.

**CI verifies with `pnpm db:reset`.** Every PR should run `pnpm db:reset` in CI to confirm all migrations replay cleanly in order. This catches conflicts before merge, not after.

If two contributors generate migrations from the same baseline that touch the same tables, one of them must manually reconcile after merge. `pnpm db:reset` will surface the conflict immediately.

## Production deployment

Migrations are applied to the linked Supabase project with:

```
pnpm db:push:remote
```

This runs `supabase db push`, which applies only the migrations that haven't yet been applied to the remote project (tracked by Supabase's internal migration history table).

**Never run `drizzle-kit push` against a production database.** That command pushes directly without a migration record and has no rollback path.

## Drizzle config files

| File                              | Purpose                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `drizzle.config.ts`               | Public schema — used for `drizzle-kit pull` (generates `src/server/db/schema/generated/`) |
| `drizzle-introspection.config.ts` | Non-public schemas (`auth`, `storage`, etc.) — generates `src/supabase/drizzle/schema.ts` |

Both configs point at the local DB URL and are only used with `drizzle-kit pull`. Neither is used for migrations.

## For sibling projects

The same workflow applies to other DevDogs-UGA projects that use Supabase:

1. Manage migrations in `supabase/migrations/` via the Supabase CLI (`supabase migration new`, `supabase migration up`, `supabase db reset`).
2. Use `drizzle-kit pull` to generate TypeScript types from the DB after applying migrations.
3. Maintain a manual `relations.ts` for Drizzle relational queries.
4. Never use `drizzle-kit push` against production.

For Flutter projects: use the Supabase CLI for migration management; the Drizzle layer is not applicable.
