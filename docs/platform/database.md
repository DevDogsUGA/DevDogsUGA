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
pnpm --filter @devdogsuga/supabase new-migration <name>
```

This creates `supabase/migrations/<timestamp>_<name>.sql`. Write your DDL in that file.

```sql
-- Example: add a column
alter table "public"."profiles" add column "website" text;
```

Then apply it locally and regenerate TypeScript types:

```
pnpm sb reset
```

Test locally, then verify the migration replays correctly from scratch:

```
pnpm sb reset
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

`pnpm devtools` opens a menu covering all of this, which is the shortest path if
you do not already know what you want. The commands below are the same tool with
its arguments spelled out — `pnpm sb` is a long-standing alias for it, and both
names take the same commands.

Four commands over three targets. `--local` is the default; `--remote` is the
linked Supabase project; `--team <slug>` reaches a team's sandbox environment
through the platform.

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm sb link`          | Boot the Docker stack and write `.env.generated`                 |
| `pnpm sb link --remote` | Link the CLI to `PROJECT_REF` (one-time)                         |
| `pnpm sb reset`         | Drop and replay every migration, run the seeds, regenerate types |
| `pnpm sb push --remote` | Apply pending migrations to the linked project                   |
| `pnpm sb status`        | Report the target's health                                       |

Two more come from the same dispatcher and act on your own stack only:

| Command                          | What it does                                                     |
| -------------------------------- | ---------------------------------------------------------------- |
| `pnpm devtools doctor --app <s>` | What the catalog derived from an app's schema, and what is wrong |
| `pnpm devtools roundtrip`        | File a report, quarantine it, and check who can still see it     |

Everything else is a package script, reached directly:

| Script                                                    | What it does                                         |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @devdogsuga/supabase new-migration <name>` | Create an empty migration in `supabase/migrations/`  |
| `pnpm --filter @devdogsuga/supabase generate-types`       | Regenerate `Database` types from the linked project  |
| `pnpm --filter @devdogsuga/supabase generate-types:local` | The same, from the Docker stack                      |
| `pnpm --filter @devdogsuga/supabase test:rls`             | The RLS persona suite (needs a running stack)        |
| `pnpm --filter platform db:pull`                          | Regenerate the Drizzle schema from the DB            |
| `pnpm --filter platform db:seed-roles`                    | Seed the built-in Member and Root roles (idempotent) |

## Seeds

`supabase/seed/*.sql` runs on `pnpm sb reset` — and **only** then.
`db push` applies migrations without them, so a remote project reached by `push`
has migrations but no personas, no roles and nothing to moderate.

Seeds are the right place for anything that must not exist in production, since
the reset they ride on is never pointed there. Migrations are the wrong place for
the same reason.

## Multi-contributor workflow

Database migrations have ordering constraints that code changes don't. Follow these rules to avoid conflicts:

**Generate migration files late.** Don't run `pnpm --filter @devdogsuga/supabase new-migration` at the start of a feature branch. Iterate locally using `pnpm sb reset` as you figure out the schema, then generate the migration file when the feature is ready to merge — after rebasing onto `main`.

**One migration per PR.** A PR should produce at most one migration file covering all schema changes for that feature. This keeps the history readable and reduces the surface area for conflicts.

**Rebase before generating.** Before running `pnpm --filter @devdogsuga/supabase new-migration`:

```
git fetch && git rebase origin/main
pnpm sb reset   # re-apply all existing migrations on a clean slate
```

Then apply your schema changes on top and generate the file. The migration will be generated against the latest baseline rather than a stale one.

**CI already verifies this.** The `database` job in `.github/workflows/ci.yaml` boots a fresh local stack on every PR, which replays every migration from scratch — no separate reset step.

If two contributors generate migrations from the same baseline that touch the same tables, one of them must manually reconcile after merge. `pnpm sb reset` will surface the conflict immediately.

## Applying migrations

The shared **dev** project is pushed by hand:

```
pnpm sb push --remote
```

This runs `supabase db push`, which applies only the migrations that haven't yet been applied to the remote project (tracked by Supabase's internal migration history table).

**Staging and production are applied by CI, never by hand** — the deploy workflow dry-runs the plan and then pushes (`production-migrate` in `.github/workflows/deploy.yaml`; the workflow's comments explain the gates).

**Never run `drizzle-kit push` against a production database.** That command pushes directly without a migration record and has no rollback path.

## Drizzle config files

| File                              | Schema filter                                | Generates                         |
| --------------------------------- | -------------------------------------------- | --------------------------------- |
| `drizzle.config.ts`               | `platform`                                   | `src/server/db/schema/generated/` |
| `drizzle-introspection.config.ts` | everything except `platform`, `public`, `_*` | `src/supabase/drizzle/schema.ts`  |

The exclusions on the second one are not arbitrary. A schema whose tables carry
a foreign key to `platform."reportResolutions"` — the key that registers them as
moderatable content — must be excluded, because drizzle emits that reference
without an import it can resolve, producing a file that does not compile
(importing across would make the two generated modules circular). `sandbox` was
the original case; the rule outlives the instance.

**Any app schema that adds the quarantine column belongs on that exclusion
list**, for exactly the same reason. Nothing is lost: that module exists so the
console can reach the Supabase-managed schemas through Drizzle, and no consumer
imports anything but `auth` from it.

Both configs point at whichever database `with-env` resolves (`DB_URL`) and are only used with `drizzle-kit pull`. Neither is used for migrations.

## For sibling projects

The same workflow applies to other DevDogsUGA projects that use Supabase:

1. Manage migrations in `supabase/migrations/` via the Supabase CLI (`supabase migration new`, `supabase migration up`, `supabase db reset`).
2. Use `drizzle-kit pull` to generate TypeScript types from the DB after applying migrations.
3. Maintain a manual `relations.ts` for Drizzle relational queries.
4. Never use `drizzle-kit push` against production.

For Flutter projects: use the Supabase CLI for migration management; the Drizzle layer is not applicable.
