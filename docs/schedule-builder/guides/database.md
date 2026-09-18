---
name: Database
description: The schedule_builder schema — where it's defined, its tables, the per-request Drizzle client, and why migrations are drafted from the schema but authored by hand.
order: 4
---

# Database

This app owns the **`schedule_builder`** Postgres schema on the shared DevDogs
Supabase project. The monorepo-wide rules — SQL is the source of truth, RLS is
the isolation boundary — are covered in
[Database](/docs/platform/guides/database); this page is what is specific to
this app.

## Where the schema lives

`src/server/db/schema/schedule-builder.ts` is **hand-authored** and declared
with `pgSchema("schedule_builder")`; `schema/index.ts` only re-exports it, and
`server/db/relations.ts` holds the Drizzle relations.

The tables fall into three groups:

- **Lookups:** `subjects`, `colleges`, `departments`, `buildings`, `campuses`,
  `scheduleTypes`, `terms`, `partsOfTerm`, `instructors`.
- **Core catalog:** `courses` (with `courseDetails`, whose `prerequisites` is
  `jsonb`), `offerings` (primary key is the **`crn`**, with a composite foreign
  key into `partsOfTerm`), and `meetings` (per-weekday booleans, times, dates,
  and building — plus a `locationStatus` enum).
- **User data**, all RLS-guarded via `crudPolicy`: `userPreferences`,
  `userPlanDrafts`, `userPlanDraftCourses`, `userSavedPlans`.

Two derived objects back search: the `availableTerms` view and the
`offeringSearch` **materialized view**, which carries a Postgres `to_tsvector`
full-text vector. Ingestion refreshes it after each scrape (see
[Ingestion](/docs/schedule-builder/guides/ingestion)).

## Migrations are drafted, not authored

This is the one place the app departs from the shared database flow, and the
trap most newcomers hit. The Drizzle schema is where a change is **drafted**;
`supabase/migrations/` is still the only thing that **defines** the database.

```bash
pnpm --filter schedule-builder db:generate   # schema/ → drizzle-generated/ (a DRAFT)
```

That runs `drizzle-kit` via `drizzle-migrations.config.ts` (scoped with
`schemaFilter: ["schedule_builder"]`) and writes SQL under `drizzle-generated/`.
**Nothing applies `drizzle-generated/`.** Carry the SQL it produces into a real
file in `supabase/migrations/`, which is what `pnpm devtools db reset` and every
deploy actually run. Treating `drizzle-generated/` as a live migration directory
is the mistake this section exists to prevent.

## `db:pull` is not the reverse

```bash
pnpm --filter schedule-builder db:pull       # OTHER schemas → src/supabase/drizzle/
```

Despite the name pairing with `db:generate`, `db:pull` uses
`drizzle-introspection.config.ts`, which filters this app's **own** schema out
(`"!schedule_builder"`) and writes to `src/supabase/drizzle/`. It exists to give
you typed access to the schemas this app *reads but does not own*. It will never
regenerate `src/server/db/schema/`, and expecting it to is how someone concludes
their hand-written schema was silently dropped.

## The Drizzle client

`src/server/db/index.ts` exports a `db` proxy that builds a **per-request**
Drizzle client, keyed on the OpenNext Cloudflare context through a `WeakMap`.
Deployed, it connects through the `HYPERDRIVE` binding; locally it uses
`env.DB_URL`.

Because the proxy needs a request context, code that runs **outside** one — a
Cloudflare Workflow step, a script — must build its own client with the exported
`createScheduleBuilderDb(url, max)` instead. The `ScrapeWorkflow` does exactly
this. Reaching for the `db` proxy from a Workflow step is a runtime failure, not
a type error, so it is worth knowing before you write one.
