---
name: Local setup
description: Running just the schedule-builder app — its dev command, environment, ports, and why signing in reaches into the platform.
order: 1
---

# Local setup

This assumes you already have the repository running against a database —
[Quickstart](/docs/monorepo/guides/quickstart) gets you there. Everything below
is what is specific to `apps/schedule-builder`.

## Run it

```bash
pnpm dev --filter schedule-builder
```

`dev` is `with-env next dev`, so the command reads the shared root `.env` (and
`.env.generated`, when the local Supabase stack is running) before Next starts.
The app serves on **port 3001** — `platform` takes 3000, so both can run at
once. Going through turbo (`pnpm dev --filter …`) rather than
`pnpm --filter schedule-builder dev` also builds the workspace packages the app
imports first; see the note in [Contributing](/docs/monorepo/guides/contributing).

## Environment

`src/env.ts` is the app's env contract, validated with `@t3-oss/env-nextjs` on
top of the shared `@devdogsuga/env` registry. It **resolves `DEPLOY_ENV` at
import time and throws on an unrecognised value**, so a broken env fails the
process loudly rather than booting half-configured. Builds that legitimately run
without secrets — CI, the Docker image, `cf:typegen` — set
`SKIP_ENV_VALIDATION` to skip the check.

The Supabase block (`API_URL`, `DB_URL`, `PUBLISHABLE_KEY`, `REST_URL`,
`SECRET_KEY`, and the S3 keys) is marked `localStack`, which means the running
local Docker stack supplies all of it through `.env.generated`; you only type
those values in when you point at a hosted project. Two values are easy to get
wrong:

- **`DB_URL` must be the Session pooler string (port 5432)**, not the
  Transaction pooler. `drizzle-kit` relies on prepared statements the
  transaction pooler drops, and hangs rather than erroring.
- **`NEXT_PUBLIC_AUTH_MODE`** selects the auth path — `devdogs` in development,
  `google` in production. It is public because the client reads it.

## Signing in needs the platform

This app has no user store of its own. In development it authenticates against
the **platform's OAuth server** (`custom:devdogs`); in production it uses shared
Google restricted to `hd: uga.edu`. `src/lib/auth.ts` then gates on `@uga.edu`
emails. The callback lands at `/auth/callback`
(`src/app/(api)/auth/callback/route.ts`).

The practical consequence: **any signed-in flow needs the platform's OAuth
server reachable.** Register this app as a client once with
`pnpm devtools oauth`, and run the platform app locally when you are exercising
sign-in. Signed-out browsing works without it — a visitor's drafts live in
`localStorage` until they sign in, at which point `src/lib/sync/mergeLocalData.ts`
copies them into the account.

## Populate course data locally

The generator has nothing to plan against until the registrar scrape has run at
least once. Trigger the scrape workflow through devtools — it starts a temporary
Wrangler session, runs the scrape against your local stack, and waits for it to
finish:

```bash
pnpm devtools workflows run --app schedule-builder --tier development
```

(Or, if you already have `next dev` up, `GET http://localhost:3001/cron/scrape-registrar`
runs the same pipeline with no secret needed in development.) See
[Ingestion](/docs/schedule-builder/guides/ingestion) for what the run does and
the non-interactive form.

## Cloudflare preview

The app deploys to Workers through OpenNext, and the preview build behaves
differently from `next dev` (it runs on `workerd`). Copy `.dev.vars.example` to
`.dev.vars`, then:

```bash
pnpm --filter schedule-builder cf:preview     # OpenNext build on workerd
pnpm --filter schedule-builder cf:dev          # with Workflows served locally
```

After editing a `wrangler.jsonc` binding, regenerate the Worker types
(`cf:typegen`) and commit the diff — CI fails on drift.

## Tests

```bash
pnpm --filter schedule-builder test       # vitest, unit
pnpm --filter schedule-builder test:db    # vitest against a live local stack
```

`test:db` (`vitest.db.config.ts`) covers the parts that only make sense against
Postgres — `reconcileTerm.db-test.ts`, the schema tests — so it needs
`pnpm devtools db start && pnpm devtools db reset` first.
