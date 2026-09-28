---
name: Schedule Builder
description: Course planning on real registrar data — architecture and domain terms for apps/schedule-builder.
order: 30
---

# Schedule Builder

`apps/schedule-builder` — branded "DogDays" — is the Next.js app that plans a
UGA student's semester against real registrar data.

> [!TIP]
> Just getting started? Start at
> [Getting started](/docs/schedule-builder/getting-started/prerequisites) instead of this
> page. Working the **schedule-builder competition**? The brief is a GitHub
> issue, not a doc — see every open
> [competition issue](https://github.com/DevDogsUGA/DevDogsUGA/issues?q=is%3Aissue+label%3Acompetition).

## Architecture

- **Next.js on Workers.** Built and deployed through vinext
  (`vite.config.ts` + `@cloudflare/vite-plugin`), not OpenNext — the Worker
  entry is `cloudflare/worker.ts`, and the KV-backed data/CDN cache rides the
  `VINEXT_KV_CACHE` binding.
- **`schedule_builder` Postgres schema.** Owned by this app on the shared
  DevDogs Supabase project; see [Database](/docs/schedule-builder/guides/database).
- **Ingestion.** A Cloudflare Workflow (`cloudflare/ScrapeWorkflow.ts`) scrapes
  the UGA registrar on a daily cron, parses it, and reconciles it into
  Postgres. See [Ingestion](/docs/schedule-builder/guides/ingestion).
- **Generation.** A rule-based engine searches conflict-free combinations of
  sections and ranks them. See
  [Schedule generation](/docs/schedule-builder/guides/generation).

## Glossary

- **Term** — one semester's registration period, keyed by an `academicPeriod` code.
- **Part of term** — a sub-window of a term with its own dates (a full-semester
  and an 8-week course in the same term have different parts of term).
- **Course** — a catalog entry (subject + course number + title), independent of any term.
- **Section (offering)** — one instance of a course in one term, keyed by its
  **CRN**. Cancelled sections are kept, not deleted — saved plans reference a CRN.
- **CRN** — Course Reference Number, the registrar's primary key for a section.
- **Instructor** — who teaches a section. `Professor.quality` is a dormant
  field, always `null` (no rating source is wired up).
- **Meeting** — one weekly time block of a section (days, times, building/room).
- **Schedule** — a conflict-free set of sections, one per requested course.
- **Rule** — one unit of generation logic that can reject a section, prune a
  partial schedule, reject a complete schedule, or score it.

## Where to go next

- [Getting started](/docs/schedule-builder/getting-started/prerequisites) — set up and run this app
- [Where things live](/docs/schedule-builder/guides/where-things-live) — "I want to change X"
- [Database](/docs/schedule-builder/guides/database), [Ingestion](/docs/schedule-builder/guides/ingestion), [Schedule generation](/docs/schedule-builder/guides/generation)
