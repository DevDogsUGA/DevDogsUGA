---
name: Where things live
description: '"I want to change X" — a path table for the parts of this app you''ll actually touch.'
order: 20
section: guides
---

# Where things live

| I want to change...                              | Path                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| A public site page or route                      | `src/app/(site)/`                                       |
| An auth route (sign-in, OAuth callback)          | `src/app/(auth)/`                                       |
| An API route (webhooks, cron, export)            | `src/app/(api)/`                                        |
| The officer console                              | `src/app/(site)/console/`, `src/app/(present)/console/` |
| A UI component                                   | `src/components/`                                       |
| Moderation UI (`<ReportDialog>` and friends)     | `src/components/moderation/`                            |
| Teams UI                                         | `src/components/teams/`                                 |
| Participation / stars-and-streaks UI             | `src/components/participation/`                         |
| A React hook                                     | `src/hooks/`                                            |
| A server action                                  | `src/server/actions/`                                   |
| The owned Postgres schema (hand-authored)        | `src/server/db/relations.ts`                            |
| Generated Drizzle schema (never hand-edit)       | `src/server/db/schema/generated/`                       |
| GitHub App calls (teams, competitions, webhooks) | `src/server/github/`                                    |
| The OAuth server ("Sign in with DevDogs")        | `src/server/oauth/`                                     |
| Sign-in providers (Google, GitHub linking)       | `src/server/auth/`                                      |
| Attendance and QR check-in                       | `src/server/attendance/`                                |
| Club config (nav, apps, tech stack, sections)    | `src/config/`                                           |
| Docs system server queries                       | `src/server/docs/`                                      |
| Transactional email                              | `src/server/email/`                                     |
| Discord integration                              | `src/server/discord/`                                   |
| Env contract                                     | `src/env.ts`                                            |
| The Worker entry / cron dispatch (deploy)        | `cloudflare/worker.ts`, `cloudflare/scheduled.ts`       |

See [Identity](./identity/index.md) for the OAuth server and the GitHub App, [Moderation](./moderation/index.md) and [Reporting](./reporting/index.md) for the content-safety subsystem, and [Meetings & Teams](./meetings-and-teams/index.md) for the domain model `src/server/github/` and `src/server/attendance/` build against.
