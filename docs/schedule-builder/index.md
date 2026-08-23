---
name: Schedule Builder
description: Course schedule planning for UGA students, built on the registrar scrape pipeline.
order: 30
---

# Schedule Builder

Schedule Builder helps UGA students plan their semester around real registrar data.

> [!NOTE]
> Documentation for this project is still being written. Add markdown files under
> `docs/schedule-builder/` and they will appear in the sidebar automatically.

## Where the code lives

The app lives at `apps/schedule-builder`. It shares the monorepo's Supabase project
and owns its own Postgres schema, following the same conventions as the platform app —
see [Database & Migrations](/docs/platform/database) for the shared rules.
