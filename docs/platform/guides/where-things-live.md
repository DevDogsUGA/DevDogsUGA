---
name: Where things live
description: '"I want to change X" — a path table for the parts of this app you''ll actually touch.'
order: 20
section: guides
---

# Where things live

Paths are relative to `apps/platform` in the [DevDogsUGA repository](https://github.com/DevDogsUGA/DevDogsUGA/tree/main/apps/platform), except `supabase/` and `docs/`, which are at the repository root.

| I want to change...                             | Path                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| A public site page or route                     | `src/app/(site)/`                                           |
| An auth route (sign-in, OAuth callback)         | `src/app/(auth)/`                                           |
| An API route (cron, export)                     | `src/app/(api)/`                                            |
| The dashboard and presentation pages            | `src/app/(site)/dashboard/`, `src/app/(present)/dashboard/` |
| A UI component                                  | `src/components/`                                           |
| Moderation UI (`<ReportDialog>` and friends)    | `src/components/moderation/`                                |
| Participation / stars-and-streaks UI            | `src/components/participation/`                             |
| A React hook                                    | `src/hooks/`                                                |
| Access rules and caller loading                 | `src/server/auth/access.ts`                                 |
| Dashboard sections and rules                    | `src/config/dashboard.ts`                                   |
| Projects, owners, reports and record rules      | `src/server/projects/`                                      |
| GitHub repo control and commit sync             | `src/server/github/`                                        |
| Hackathons and Devpost sync                     | `src/server/hackathons/`                                    |
| Draft / Command forms                           | `src/ui/settings-form.tsx`, `src/ui/use-command.tsx`        |
| A server action                                 | `src/server/actions/`                                       |
| Drizzle relations (hand-authored)               | `src/server/db/relations.ts`                                |
| Generated Drizzle schema (never hand-edit)      | `src/server/db/schema/generated/`                           |
| The OAuth server ("Sign in with DevDogs")       | `src/server/oauth/`                                         |
| Sign-in providers (Google, GitHub linking)      | `src/server/auth/`                                          |
| Attendance and QR check-in                      | `src/server/attendance/`                                    |
| Club config (nav, apps, tech stack, sections)   | `src/config/`                                               |
| Docs queries, publishing, preview and readiness | `src/server/docs/`                                          |
| Transactional email                             | `src/server/email/`                                         |
| Discord integration                             | `src/server/discord/`                                       |
| Env contract                                    | `src/env.ts`                                                |
| Migrations, seeds, RLS tests (DevDogsUGA)       | `supabase/`, `packages/supabase/`                           |
| These docs (DevDogsUGA)                         | `docs/platform/`                                            |
| The Worker entry / cron dispatch (deploy)       | `cloudflare/worker.ts`, `cloudflare/scheduled.ts`           |

See [Identity](./identity/index.md) for the OAuth server, [Moderation](./moderation/index.md) and [Reporting](./reporting/index.md) for the content-safety subsystem, and [Meetings](./meetings-and-teams/index.md) for the domain model `src/server/attendance/` builds against.
