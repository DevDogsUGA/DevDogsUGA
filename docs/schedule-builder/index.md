---
name: Schedule Builder
description: Course planning on real registrar data.
order: 30
---

# Schedule Builder

`apps/schedule-builder` — branded "Optimal Schedule Builder" — is the Next.js app
that plans a UGA student's semester against real registrar data. It runs on the
shared DevDogs Supabase project and owns the **`schedule_builder`** Postgres
schema.

Nothing here repeats the monorepo setup. If you are still getting the repository
running, start at [Monorepo](/docs/monorepo); for the shared schema rules, read
[Database](/docs/platform/guides/database) — this page covers only what is
different about this app.

## Where things are

| Area                  | Path                              |
| --------------------- | --------------------------------- |
| Scrape entry points   | `src/app/(api)/cron/`             |
| Parsing               | `src/lib/parsers/`                |
| Upserts into Postgres | `src/lib/sync/`                   |
| Schedule generation   | `src/lib/algorithm/`              |

Course and instructor data arrive on two cron routes — `scrape-registrar` and
`scrape-rmp` — which parse and then upsert. The generator reads what those
leave behind; it never scrapes anything itself.

## Migrations are drafted, not authored

This is the one place the app departs from
[Database](/docs/platform/guides/database), and the departure is narrow enough
to state in a sentence: the Drizzle schema is where a change is *drafted*, and
`supabase/migrations/` is still the only thing that defines the database.

The schema at `src/server/db/schema/` is **hand-authored** — it is the input to
the draft, not an output of anything. Edit it, then:

```bash
pnpm --filter schedule-builder db:generate   # schema → drizzle-generated/
```

That writes draft SQL under `drizzle-generated/` via
`drizzle-migrations.config.ts`. Carry the draft into a real file in
`supabase/migrations/`, which is what actually runs. Nothing applies
`drizzle-generated/` — treating it as a migration directory is the mistake this
paragraph exists to prevent.

`db:pull` is **not** the reverse of that, despite the name pairing:

```bash
pnpm --filter schedule-builder db:pull       # other schemas → src/supabase/drizzle/
```

Its config filters this app's own schema out (`"!schedule_builder"`) and writes
to `src/supabase/drizzle/`. It exists to give you typed access to the schemas
this app *reads but does not own*. Running it will never regenerate
`src/server/db/schema/`, and expecting it to is how someone concludes their
hand-written schema was silently dropped.

## Deployment

Deploys to Cloudflare Workers through OpenNext, the same path the platform app
takes, on its own zone: `dogdays.dev` in production and `staging.dogdays.dev` in
staging, both declared as custom domains in `wrangler.jsonc`.

`SCHEDULE_BUILDER_URL` has to be kept in step with those by hand, because
nothing cross-checks the two. A mismatch is not a build failure; it is a
callback that silently goes to the wrong place.
