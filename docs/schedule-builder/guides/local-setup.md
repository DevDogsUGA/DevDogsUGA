---
name: Environment and Cloudflare preview
description: The app's env contract, and testing against the deployed Worker runtime rather than next dev.
order: 1
section: guides
---

# Environment and Cloudflare preview

For how to actually start the app day to day, see
[Run the app](/docs/schedule-builder/getting-started/run). This page is what's
specific once you're past that.

## Environment

`src/env.ts` is the app's env contract, validated with `@t3-oss/env-nextjs` on
top of the shared `@devdogsuga/env` registry. It resolves `DEPLOY_ENV` at
import time and **throws on an unrecognised value**, so a broken env fails the
process loudly rather than booting half-configured. Builds that legitimately
run without secrets — CI, `cf:typegen` — set `SKIP_ENV_VALIDATION` to skip the
check.

The Supabase block (`API_URL`, `DB_URL`, `PUBLISHABLE_KEY`, `REST_URL`,
`SECRET_KEY`, and the S3 keys) is marked `localStack`: a running local Docker
stack supplies all of it through `.env.generated`, and only a hosted project
needs these typed in by hand (see
[Supabase, hosted](/docs/schedule-builder/getting-started/supabase-hosted)).

One value is specific to this app: **`NEXT_PUBLIC_AUTH_MODE`** selects the
sign-in path — `devdogs` in development, `google` in production. It's public
because the client reads it directly.

## Cloudflare preview

The app deploys to Workers through vinext, and the preview build behaves
differently from local `next dev` (it runs on `workerd`, the same runtime as
production). Copy `.dev.vars.example` to `.dev.vars`, then:

```bash
pnpm --filter schedule-builder cf:preview     # vinext build, served by workerd
pnpm --filter schedule-builder cf:dev          # same, with Workflows served locally
```

After editing a `wrangler.jsonc` binding, regenerate the Worker types
(`pnpm --filter schedule-builder cf:typegen`) and commit the diff — CI fails on
drift.

## Tests

```bash
pnpm --filter schedule-builder test       # vitest, unit
pnpm --filter schedule-builder test:db    # vitest against a live local stack
```

`test:db` (`vitest.db.config.ts`) covers the parts that only make sense against
Postgres — `reconcileTerm.db-test.ts`, the schema tests — so it needs
`pnpm devtools db start && pnpm devtools db reset` first.
