---
name: Supabase
description: One Postgres project shared by every app, one schema each, and the Row-Level Security rules that are the only real boundary between them.
order: 3
---

# Supabase

Supabase is the database, auth and storage layer for every app in the repo: Postgres 17, `supabase-js` 2.112.3, `@supabase/ssr` 0.12.4, CLI 2.115.0. There is one project, and each app owns one schema inside it. Read this before writing a migration, a policy, or a client factory. It is not a Supabase tutorial — [their docs](https://supabase.com/docs) are that — and it will not tell you how to get a stack running, which [Quickstart](/docs/monorepo/guides/quickstart) does.

## One project, one schema per app

`packages/supabase/src/schemas.ts` is the canonical map: `platform`, `schedule_builder`, `study_group_finder`. Those names are created by the SQL migrations in `supabase/migrations` and exposed through `[api] schemas` in `supabase/config.toml`.

Schema isolation is **organizational, not a security boundary**. Every schema is reachable through the same PostgREST endpoint with the same publishable key, so Row-Level Security is what actually protects data. The only credential that bypasses RLS is the service role (`SECRET_KEY`).

Client factories live in `@devdogsuga/supabase` and take the app's schema as an argument, which becomes the client's default for `.from()`. Set it explicitly; never rely on the endpoint's default profile.

> [!WARNING]
> `[api] schemas` lists `study_group_finder` **first on purpose** — being first makes it PostgREST's default REST profile, which is the only schema supadart can generate Dart models from. Do not reorder that list.

Ports in `config.toml` stay literals rather than `env(...)`: `supabase seed` validates the file against a typed schema that interpolates `env()` into _string_ fields only, so an `env()` in a numeric field makes it exit 1 — silently, under the `with-env` wrapper. Everything else in that file may still use `env()`.

## Locking down a function takes both halves

Postgres grants `EXECUTE` to `PUBLIC` on every function by default, and `20260616232300_platform_init.sql` additionally grants it to `anon` and `authenticated` through default privileges. Revoking from either side alone fails open, silently:

```sql
revoke execute on function "platform".content_types()
  from public, anon, authenticated;
```

<details>
<summary>Why does the scoped <code>alter default privileges … revoke</code> not work?</summary>

`alter default privileges in schema "platform" revoke execute on functions from public` is a **no-op**, and a silent one. `pg_default_acl` stores a delta that Postgres merges on top of `acldefault()` at creation time, and PUBLIC's EXECUTE lives in `acldefault()` — it is never written into the row, so a revoke has nothing there to remove. This was measured on PostgreSQL 17.6 and cost two days of believing the schema was closed; `20260807000004_platform_close_public_execute.sql` carries the full write-up and the statement that does work.

</details>

## The RLS persona suite

Policies, grants and `security definer` functions are covered by a separate Vitest suite that needs a live stack, so `pnpm test` does not run it:

```bash
pnpm devtools link && pnpm devtools reset
pnpm --filter @devdogsuga/supabase test:rls
```

Every case asserts **both an allow and a deny** — a policy test that only checks the allow side passes just as happily when the policy is missing entirely. The suite runs single-threaded because the personas share one database and several cases assert on global state.
