# schedule-builder

The DevDogs course schedule builder (branded "DogDays") — a
Next.js app on the shared DevDogs Supabase project, owning the
**`schedule_builder`** Postgres schema
(`supabase/migrations/<timestamp>_schedule_builder_<desc>.sql`).

For monorepo setup, env handling, and the contribution workflow, see
[Toolkit](../../docs/toolkit/index.md); project-facing docs are
[Schedule Builder](../../docs/schedule-builder/index.md).

## Develop

```bash
pnpm -F schedule-builder dev   # local stack auto-detected, else remote
```

Schema changes follow the shared workflow in
[Database](../../docs/platform/guides/database.md): write SQL under
`supabase/migrations/` by hand (`pnpm devtools preset new-migration --app
schedule-builder`), replay it, then run `pnpm -F schedule-builder
types:drizzle` to regenerate the Drizzle schema from the live DB. See
[Database](../../docs/schedule-builder/guides/database.md) for what's
specific to this app's schema.

## Course data

Course and instructor data arrive through the daily registrar scrape, a
Cloudflare Workflow (`cloudflare/ScrapeWorkflow.ts`), with parsing in
`src/lib/parsers/` and upserts in `src/lib/sync/`. Schedule generation lives in
`src/lib/generation/`. See
[Ingestion](../../docs/schedule-builder/guides/ingestion.md).

## Deploy

Deploys to Cloudflare Workers via vinext like the platform app: `pnpm -F schedule-builder preview`
locally; CI runs `DEPLOY_ENV=<tier> pnpm build` through `.github/workflows/deploy-app.yaml`. Branded **DogDays**, on its own zone:
`dogdays.dev` (production) and `staging.dogdays.dev` (staging), as custom
domains in `wrangler.jsonc` — keep `SCHEDULE_BUILDER_URL` in step, since
nothing cross-checks them. In-app branding is DogDays throughout, drawing the
mark and app copy from `@devdogsuga/brand`, with its own light/dark zinc-and-red
design (system `prefers-color-scheme`; not the platform's design language).
