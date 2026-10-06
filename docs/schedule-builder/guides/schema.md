---
name: Schedule-builder schema
description: The schedule_builder schema — where it's defined, its tables, the per-request Drizzle client, and how the Drizzle schema is introspected from SQL migrations.
order: 4
section: guides
---

# Schedule-builder schema

This app owns the **`schedule_builder`** Postgres schema on the shared DevDogs
Supabase project. The monorepo-wide rules — SQL is the source of truth, RLS is
the isolation boundary — are covered in
[Writing a migration](../../platform/guides/migrations.md); this page is what is specific to
this app.

## Where the schema lives

`supabase/migrations/` is the source of truth. `src/server/db/schema/generated/schema.ts`
is **introspected from the live database** by `pnpm -F schedule-builder
types:drizzle` and is never edited by hand; `schema/index.ts` re-exports it,
and `server/db/relations.ts` holds the hand-written Drizzle relations. See
[Database (Drizzle)](../../_shared/guides/stack/db.md) for how
introspection works and why it needs two `drizzle-kit` configs.

The tables fall into three groups:

- **Lookups:** `subjects`, `colleges`, `departments`, `buildings`, `campuses`,
  `scheduleTypes`, `terms`, `partsOfTerm`, `instructors`.
- **Core catalog:** `courses` (with `courseDetails`, whose `prerequisites` is
  `jsonb`), `offerings` (primary key is the **`crn`**, with a composite foreign
  key into `partsOfTerm`), and `meetings` (per-weekday booleans, times, dates,
  and building — plus a `locationStatus` enum).
- **User data**, all RLS-guarded by policies in `supabase/migrations/`:
  `userPreferences`, `userPlanDrafts`, `userPlanDraftCourses`, `userSavedPlans`.

One derived object backs the term selector: the `availableTerms` view, one row
per academic period that has at least one offering. There used to be a second
one — an `offeringSearch` materialized view backing free-text course search —
but it was removed when that search was replaced with subject / instructor /
CRN filters that read the base tables directly. If you find code that still
refreshes it, that code is stale, not the schema.

## Making a schema change

```bash
pnpm devtools new-migration --app schedule-builder <description>
```

writes an empty `supabase/migrations/<timestamp>_schedule_builder_<description>.sql`.
Put the DDL — and any RLS policies it needs — in it by hand, the same way
platform does (see [Writing a migration](../../platform/guides/migrations.md)'s "What does a
table with its policies look like in one migration?"). Then replay it and
re-introspect:

```bash
pnpm devtools supabase db reset              # drop, replay every migration, run the seeds
pnpm -F @devdogsuga/supabase types:db        # regenerate the Database types
pnpm -F schedule-builder types:drizzle       # re-introspect the Drizzle schema
```

If you added tables or foreign keys, add the matching relations to
`src/server/db/relations.ts` by hand, then commit the migration, the
regenerated schema, and the relations change together.

## The Drizzle client

`src/server/db/index.ts` exports a `db` proxy that builds a **per-request**
Drizzle client, keyed through `vinext/cache`'s `cacheForRequest` against
vinext's own per-request store (an `AsyncLocalStorage`-backed context torn down
once the request finishes). Deployed, it connects through the `HYPERDRIVE`
binding and closes the pool after the response streams (`after`, from
`next/server`); with no `HYPERDRIVE` binding — the development environment —
it falls back to a single process-wide client built from `env.DB_URL`.

Because the proxy needs a request context, code that runs **outside** one — a
Cloudflare Workflow step, a script — must build its own client with the exported
`createScheduleBuilderDb(url, max)` instead. The `ScrapeWorkflow` does exactly
this. Reaching for the `db` proxy from a Workflow step is a runtime failure, not
a type error, so it is worth knowing before you write one.
