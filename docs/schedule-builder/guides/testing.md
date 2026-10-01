---
name: Testing
description: The suites this app runs — which ones need a database, and what CI actually checks.
order: 21
section: guides
---

# Testing

```bash
pnpm --filter schedule-builder test       # vitest, unit — no database
pnpm --filter schedule-builder test:db    # vitest against a live database
```

## `test`

Plain Vitest, no database involved.

## `test:db`

`vitest.db.config.ts`, run through `with-env` so it follows whichever
database the session currently points at — the local stack, a hosted
development project, or whatever tier you launched devtools under — not only
your own machine. It covers the parts that only make sense against a real
Postgres: `reconcileTerm.db-test.ts` (the ingestion pipeline's writes) and
the generated schema's query validity. Start with a database first:

```bash
pnpm devtools db start
pnpm devtools db reset
```

## Cloudflare preview, not `next dev`

The app deploys to Workers through vinext, and a preview build behaves
differently from `next dev` (it runs on `workerd`, the same runtime as
production). Copy `.dev.vars.example` to `.dev.vars`, then:

```bash
pnpm --filter schedule-builder cf:preview   # vinext build, served by workerd
pnpm --filter schedule-builder cf:dev       # same, with Workflows served locally
```

After editing a `wrangler.jsonc` binding, regenerate the Worker types
(`pnpm --filter schedule-builder cf:typegen`) and commit the diff — CI fails
on drift.

## What CI runs

`.github/workflows/ci.yaml` splits this across two jobs:

- **`validate`** runs `pnpm test` (no database) for every affected package,
  `schedule-builder` included, alongside lint, typecheck and the workspace
  build.
- **`database`** is unconditional, not gated on what changed. It starts a
  local Supabase stack on an empty runner volume, checks the committed
  `database.types.ts` against a fresh regeneration, runs the RLS persona
  suite (`pnpm --filter @devdogsuga/supabase test:rls`) and `test:db` for
  both `schedule-builder` and `platform`.

See [Ingestion](/docs/schedule-builder/guides/ingestion) for what
`reconcileTerm.db-test.ts` actually exercises, and
[Schedule-builder schema](/docs/schedule-builder/guides/schema) for the
schema those tests run against.
