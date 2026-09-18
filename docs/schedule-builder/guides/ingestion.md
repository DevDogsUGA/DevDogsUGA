---
name: Ingestion
description: How registrar data is scraped, parsed, and reconciled into the schedule_builder schema — collectors, dependency order, and why offerings are cancelled rather than deleted.
order: 2
---

# Ingestion

The app plans against real UGA registrar data, and that data has to be pulled
in, parsed, and reconciled into Postgres before the generator has anything to
work with. Ingestion and [generation](/docs/schedule-builder/guides/generation)
are two independent pipelines that meet only at the database — the generator
never scrapes.

## What triggers it

Two entry points, same work:

- **`cloudflare/ScrapeWorkflow.ts`** — a Cloudflare Workflow, and the real
  target. A Workflow gets durable, retryable steps; the daily production cron
  (`"5 14 * * *"` in `wrangler.jsonc`) dispatches it via
  `cloudflare/scheduled.ts`. The workflow is bound as `SCRAPE_WORKFLOW` in every
  environment.
- **`src/app/(api)/cron/scrape-registrar/route.ts`** — the older HTTP route,
  guarded by a cron secret (`src/lib/cron/auth.ts`; the check is skipped in
  development). Still runs the same pipeline, but needs `next dev` up.

## Populate course data locally

A fresh database has no courses, so the generator has nothing to plan against.
Trigger the scrape workflow through devtools — it starts a temporary Wrangler
session for you (the workflow runtime, which `next dev` does not provide), runs
the scrape against your local Supabase stack, and waits for it to finish:

```bash
pnpm devtools db start && pnpm devtools db reset          # local stack, once
pnpm devtools workflows run --app schedule-builder --tier development
```

Interactively it will offer the one development workflow to pick. To skip every
prompt — in a script, or when you already know what you want — name the binding,
which is stable across tiers:

```bash
pnpm devtools workflows run --app schedule-builder \
  --workflow SCRAPE_WORKFLOW --tier development
```

The full scrape pulls every available term and takes a while. If a Wrangler
session is already up (`pnpm devtools workflows serve --app schedule-builder`),
the trigger reuses it instead of starting its own.

> [!NOTE]
> The `/cron/scrape-registrar` route is a lighter alternative when you already
> have `next dev` running — a plain `GET http://localhost:3001/cron/scrape-registrar`,
> with no secret needed in development. It runs the same code; the workflow path
> is just what production uses and needs no dev server.

## The pipeline

1. **Discover terms.** `detectAvailableTerms()` (`src/lib/parsers/AvailableTerms.ts`)
   fetches the per-semester CSVs; `fetchPartsOfTerm` /
   `resolvePartsOfTermPerTerm` (`PartOfTermScraper.ts`, `termPartsOfTerm.ts`)
   fetch the registrar's calendars. HTML is parsed with `cheerio`.

2. **Reconcile each term.** `reconcileTerm(term, db)`
   (`src/lib/parsers/reconcileTerm.ts`) is the heart of it, and it runs **per
   term in its own transaction**. A set of `*Collector` classes each `collect(row)`
   as rows stream past, then `flush(tx)` in **foreign-key dependency order**,
   each returning an id-map the next collector uses:

   `SubjectCollector` → `CollegeCollector` → `DepartmentCollector` →
   `CampusCollector` → `ScheduleTypeCollector` → `InstructorCollector` →
   `BuildingCollector` → `CourseCollector` → `OfferingCollector` →
   `MeetingCollector`.

   Writes go through `bulkUpsert` (`src/lib/parsers/bulkUpsert.ts`) — upserts,
   not inserts, so a re-scrape updates in place.

3. **Cancel, never delete.** An offering that has vanished from the registrar is
   marked `cancelled`, not removed (`reconcileTerm.ts`). Saved plans reference
   offerings by **CRN**; deleting one would tear a row out from under a student's
   saved schedule. A cancelled offering stays queryable and is simply filtered
   out of new results.

4. **Refresh the search view.** After every term is reconciled, the run
   recreates indexes and runs
   `REFRESH MATERIALIZED VIEW CONCURRENTLY schedule_builder.offeringSearch`. All
   of this SQL is **schema-qualified** on purpose: the `postgres-js` connection's
   `search_path` does not include `schedule_builder`, so an unqualified name
   would resolve to the wrong (or no) object.

## A different "sync"

`src/lib/sync/mergeLocalData.ts` is unrelated to the registrar scrape despite
living next door. It runs on sign-in and copies a signed-out visitor's
`localStorage` drafts and plans into their freshly authenticated account
(`runLocalDataMerge`). If you are looking for where course data lands, that is
`reconcileTerm`, not here.

## Where to look

| Concern                   | File                                                        |
| ------------------------- | ----------------------------------------------------------- |
| Cron route / secret       | `src/app/(api)/cron/scrape-registrar/`, `src/lib/cron/`     |
| Production workflow       | `cloudflare/ScrapeWorkflow.ts`, `scheduled.ts`              |
| Term + calendar discovery | `src/lib/parsers/AvailableTerms.ts`, `PartOfTermScraper.ts` |
| Reconcile + collectors    | `src/lib/parsers/reconcileTerm.ts`                          |
| Bulk upsert               | `src/lib/parsers/bulkUpsert.ts`                             |
