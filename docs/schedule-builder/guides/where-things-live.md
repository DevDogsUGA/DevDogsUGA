---
name: Where things live
description: '"I want to change X" — a path table for the parts of this app you''ll actually touch.'
order: 20
section: guides
---

# Where things live

| I want to change...                         | Path                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| A page or route                             | `src/app/<route>/` (Next app router)                                        |
| A UI component                              | `src/components/`                                                           |
| Course search UI                            | `src/components/courses/`                                                   |
| Schedule display UI                         | `src/components/schedules/`                                                 |
| Saved plans UI                              | `src/components/saved-plans/`                                               |
| A React Query hook that reads data          | `src/hooks/queries/`                                                        |
| A server action                             | `src/server/actions/`                                                       |
| The owned Postgres schema (hand-authored)   | `src/server/db/schema/schedule-builder.ts`                                  |
| Table relations                             | `src/server/db/relations.ts`                                                |
| The Drizzle client (per-request proxy)      | `src/server/db/index.ts`                                                    |
| Shared domain types (Section, Meeting, …)   | `src/lib/domain/`                                                           |
| The generation engine itself                | `src/lib/generation/engine.ts`                                              |
| A new schedule generation rule              | `src/lib/generation/rules/`, registered in `src/lib/generation/registry.ts` |
| Registrar scraping / parsing                | `src/lib/parsers/`                                                          |
| Reconciling scraped rows into Postgres      | `src/lib/parsers/reconcileTerm.ts`                                          |
| The production scrape trigger (Workflow)    | `cloudflare/ScrapeWorkflow.ts`                                              |
| The dev-only scrape cron route              | `src/app/(api)/cron/scrape-registrar/`                                      |
| Sign-in / auth gating                       | `src/lib/auth.ts`, `src/app/(api)/auth/callback/`                           |
| Merging a signed-out visitor's local drafts | `src/lib/sync/mergeLocalData.ts`                                            |
| Anything kept in `localStorage`             | `src/lib/localStorage/`                                                     |
| The Worker entry / cron dispatch (deploy)   | `cloudflare/worker.ts`, `cloudflare/scheduled.ts`                           |
| Env contract                                | `src/env.ts`                                                                |

See [Schedule generation](./generation.md) and
[Ingestion](./ingestion.md) for how the generation and
scraping paths actually work, not just where they live.
