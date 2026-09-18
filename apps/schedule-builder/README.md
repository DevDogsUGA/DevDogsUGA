# schedule-builder

The DevDogs course schedule builder (branded "DogDays") — a
Next.js app on the shared DevDogs Supabase project, owning the
**`schedule_builder`** Postgres schema
(`supabase/migrations/*_schedule_builder_init.sql`).

For monorepo setup, env handling, and the contribution workflow, see
[Monorepo](../../docs/monorepo/index.md); project-facing docs are
[Schedule Builder](../../docs/schedule-builder/index.md).

## Develop

```bash
pnpm dev --filter schedule-builder   # local stack auto-detected, else remote
```

Schema changes follow the shared workflow in
[Database](../../docs/platform/guides/database.md), with one twist: this app
drafts its migrations from the Drizzle schema — `db:generate` (drizzle-kit,
via `drizzle-migrations.config.ts`) writes draft SQL to `drizzle-generated/`,
which is then carried into a real migration in
`supabase/migrations/` (the source of truth). `db:pull` regenerates the
Drizzle schema from the live DB.

## Course data

Course and instructor data arrive via cron route (`src/app/(api)/cron/`):
`scrape-registrar`, with parsing in `src/lib/parsers/` and
upserts in `src/lib/sync/`. Schedule generation lives in `src/lib/algorithm/`.

## Deploy

Deploys to Cloudflare Workers via OpenNext like the platform app: `cf:preview`
locally; CI runs `cf:build:*` / `cf:deploy:*` from
`.github/workflows/deploy.yaml`. Branded **DogDays**, on its own zone:
`dogdays.dev` (production) and `staging.dogdays.dev` (staging), as custom
domains in `wrangler.jsonc` — keep `SCHEDULE_BUILDER_URL` in step, since
nothing cross-checks them. In-app branding is DogDays throughout, drawing the
mark and app copy from `@devdogsuga/og`, with its own light/dark zinc-and-red
design (system `prefers-color-scheme`; not the platform's design language).
