---
name: Ingestion
description: How registrar data is scraped, parsed, and reconciled into the schedule_builder schema — collectors, dependency order, and why offerings are cancelled rather than deleted.
order: 2
section: guides
---

# Ingestion

The app plans against real UGA registrar data, and that data has to be pulled
in, parsed, and reconciled into Postgres before the generator has anything to
work with. Ingestion and [generation](./generation.md)
are two independent pipelines that meet only at the database — the generator
never scrapes.

## What triggers it

Two entry points, same work:

- **`cloudflare/ScrapeWorkflow.ts`** — a Cloudflare Workflow, and the real
  target. A Workflow gets durable, retryable steps; in production it fires on
  a **native Workflow schedule** (`"5 14 * * *"`, on the `SCRAPE_WORKFLOW`
  binding itself in `wrangler.jsonc`) — not through `cloudflare/scheduled.ts`.
  That file's Worker-cron dispatch exists for other routes and is
  deliberately empty right now; the registrar scrape is the one schedule this
  app has, and it bypasses the Worker scheduled handler entirely.
- **`src/app/(api)/cron/scrape-registrar/route.ts`** — the older HTTP route,
  guarded by a cron secret (`src/lib/cron/auth.ts`; the check is skipped in
  development). Still runs the same pipeline, but needs `next dev` up.

## Populate course data

A fresh database has no courses, so the generator has nothing to plan against.
Trigger the scrape workflow through devtools — it starts a temporary `vinext dev`
session for you (the workflow runtime, which `next dev` does not provide), runs
the scrape against whichever database the session's `--tier` points at — the
local stack, a hosted development project, staging, or production — and waits
for it to finish:

```bash
pnpm devtools supabase start && pnpm devtools supabase db reset   # local stack, once
pnpm -F schedule-builder populate:courses
```

`populate:courses` is `devtools jobs run` for the development tier. Run that directly to pick a job interactively:

```bash
pnpm devtools jobs run --app schedule-builder --tier development
```

Interactively it will offer the one development workflow to pick. To skip every
prompt — in a script, or when you already know what you want — name the binding,
which is stable across tiers:

```bash
pnpm devtools jobs run --app schedule-builder \
  --workflow SCRAPE_WORKFLOW --tier development
```

If `.env` names a hosted development database while the local stack is also
running, `--tier development` is ambiguous and devtools refuses it; pass
`--tier development:local` or `--tier development:remote` instead.

The full scrape pulls every available term and takes a while. If a session is
already up (`pnpm devtools jobs serve --app schedule-builder`, which also
serves the app itself), the trigger reuses it instead of starting its own.

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
   as rows stream past, then `flush(tx)` in **foreign-key dependency order**:
   `SubjectCollector`, `CollegeCollector`, `CampusCollector`,
   `ScheduleTypeCollector`, `InstructorCollector`, and `BuildingCollector` have
   no dependency on each other and flush in parallel; `DepartmentCollector`
   flushes next (it needs the college id map); then `CourseCollector` (needs
   subject/college/department); then `OfferingCollector` (needs
   course/instructor/schedule-type/campus); then `MeetingCollector` (needs the
   set of valid CRNs `OfferingCollector` returns). Each flush returns an
   id-map a later collector uses.

   Writes go through `bulkUpsert` (`src/lib/parsers/bulkUpsert.ts`) — upserts,
   not inserts, so a re-scrape updates in place.

3. **Cancel, never delete.** An offering that has vanished from the registrar is
   marked `cancelled`, not removed (`reconcileTerm.ts`). Saved plans reference
   offerings by **CRN**; deleting one would tear a row out from under a student's
   saved schedule. A cancelled offering stays queryable and is simply filtered
   out of new results.

> [!NOTE]
> There used to be a fourth step here refreshing a search materialized view.
> It's gone — free-text course search was replaced with subject / instructor /
> CRN filters that read the base tables directly, and the view was dropped
> with it. See [Schedule-builder schema](./schema.md).

## A different "sync"

`src/lib/sync/mergeLocalData.ts` is unrelated to the registrar scrape despite
living next door. It runs on sign-in and copies a signed-out visitor's
`localStorage` drafts and plans into their freshly authenticated account
(`runLocalDataMerge`). If you are looking for where course data lands, that is
`reconcileTerm`, not here.

## Where to look

| Concern                                              | File                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Cron route / secret                                  | `src/app/(api)/cron/scrape-registrar/`, `src/lib/cron/`                  |
| Production workflow + its native schedule            | `cloudflare/ScrapeWorkflow.ts`, `wrangler.jsonc`'s `workflows[]` binding |
| Worker cron dispatch (other routes, currently empty) | `cloudflare/scheduled.ts`                                                |
| Term + calendar discovery                            | `src/lib/parsers/AvailableTerms.ts`, `PartOfTermScraper.ts`              |
| Reconcile + collectors                               | `src/lib/parsers/reconcileTerm.ts`                                       |
| Bulk upsert                                          | `src/lib/parsers/bulkUpsert.ts`                                          |
