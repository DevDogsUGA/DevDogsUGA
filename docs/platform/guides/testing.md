---
name: Testing
description: The suites this app runs — which ones need a database, and what CI actually checks.
order: 21
section: guides
---

# Testing

The `platform` commands below run from a [Backstage](https://github.com/DevDogsUGA/Backstage) clone, where the app lives; the RLS suite runs here.

```bash
pnpm --filter platform test        # vitest, unit — no database
pnpm --filter platform test:db     # vitest against a live database
pnpm --filter @devdogsuga/supabase test:rls   # the RLS persona suite
```

## `test`

Plain Vitest, no database involved. This is what `pnpm test` at the Backstage root
runs for every package that has it.

## `test:db`

`vitest.db.config.ts`, run through `with-env` so it picks up whichever
database the session's `.env`/`.env.generated` currently points at. It covers
the parts that only make sense against Postgres — query validity against the
real schema, and the privilege-surface guards in
`resolveCredential.db-test.ts` that assert the shape of the GRANTS a
`security definer` function relies on, which nothing else can see. These
commands follow the session the same way every `devtools supabase` command does:
whichever development tier — local or hosted — is currently active, not only
your own machine.

Before running it locally:

```bash
pnpm devtools supabase start
pnpm devtools supabase db reset
pnpm --filter @devdogsuga/supabase run codegen
```

## The RLS persona suite

`pnpm --filter @devdogsuga/supabase test:rls` is a separate Vitest config
(`packages/supabase/vitest.rls.config.ts`) that needs a live stack and its
credentials, which is why it isn't part of `pnpm test`. It signs personas in
for real with `signInWithPassword` rather than hand-signed JWTs, asserts
**both an allow and a deny** for every policy, and runs single-threaded
because the personas share one database. See
[Supabase](../../_shared/guides/stack/supabase.md)'s "The RLS persona suite" for
more, and [Integrating your own app](./moderation/integrating.md)
for why it's the step that actually proves a moderation integration works.

## What CI runs

`.github/workflows/ci.yaml` splits this across two jobs:

- **`validate`** runs `pnpm test` (no database) for every affected package
  alongside lint, typecheck and the workspace build.
- **`database`** is unconditional — not gated on what changed, because
  migrations and RLS are the highest-consequence things in the repo. It
  starts a local Supabase stack on an empty runner volume (which doubles as
  the "every migration still applies from scratch" check), generates the
  database types from it, then runs the RLS suite and `test:db` for
  `schedule-builder`.

The platform app's own `test` and `test:db` suites run in
[Backstage](https://github.com/DevDogsUGA/Backstage), against a stack started from the DevDogsUGA commit its
`devdogsuga.lock` pins.

Every credential CI test suite uses is the well-known local-stack constant
Supabase publishes in its own docs — nothing in CI can reach a real project,
by construction, not by omission.
