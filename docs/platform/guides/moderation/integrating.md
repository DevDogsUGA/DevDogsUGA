---
name: Integrating your own app
description: The policy predicates every app must add, the eight steps to make a table moderatable, and the three traps that let an integration look finished while doing nothing.
order: 2
---

# Integrating your own app

The SQL half of moderation, for whoever owns an app schema holding member-written content. Read [Moderation](/docs/platform/guides/moderation) first: whether quarantine hides or freezes decides which policy you write here. Wiring a Report button into a client is [Reporting](/docs/platform/guides/reporting/integrating) instead.

## The rules every app must add

```sql
-- every read policy, when quarantineEffect is `hide`
using (
  "quarantinedBy" is null
  or "authorUserId" = (select auth.uid())
  or "platform".has_permission((select auth.uid()), 'canModerate')
)

-- every update policy, when quarantineEffect is `freeze`
using (
  "authorUserId" = (select auth.uid())
  and "quarantinedBy" is null
)

-- every write policy, always
with check (
  "authorUserId" = (select auth.uid())
  and not "platform".is_suspended((select auth.uid()))
)
```

The quarantine rule is the one that gets silently missed, and the reason is structural: **quarantine is the only moderation outcome whose effect lives in the app's policies rather than the platform's.** The platform sets the column and has no way to observe whether anyone reads it.

An app that hides should freeze as well. Without it an author can rewrite quarantined content — editing the evidence a moderator is looking at, while the frozen snapshot in `platform."reports"` diverges from what the row now says.

## The steps

1. Register the app in `platform."apps"` — slug, schema name, display name — from a migration.
2. Revoke table-level `UPDATE` from `anon, authenticated` and grant it back per column, **before** adding the quarantine column. See Trap 1.
3. Add `"quarantinedBy" uuid references platform."reportResolutions"(id) on delete set null` to each moderatable table.
4. Declare `quarantineEffect` on `platform."contentTypes"` if it is not `hide`, add the matching predicate to every read or update policy, and the suspension predicate to every write policy.
5. Find every other surface the same content reaches — a second table, a storage object — and freeze those too.
6. For content that is reportable but **not** quarantinable, write one `platform."contentTypes"` row with no foreign key. Resolving such a report with `quarantine` raises and rolls the decision back, which is what makes the outcome atomic.
7. Add the schema to `[api] schemas` in `supabase/config.toml` and to the exclusion list in `drizzle-introspection.config.ts`. See Trap 2.
8. Verify with `pnpm devtools doctor --app <slug>`, then `pnpm devtools roundtrip` — the step that matters, because it exercises _your_ policy.

⚠️ **`config.toml` changes need a restart, not a reset.** `[api] schemas` becomes PostgREST's `db-schemas` at `supabase start`, so `supabase db reset` leaves the old list in place — and a schema on it that no longer exists stops PostgREST building its schema cache at all: every request returns `PGRST002`. Run `stop-local-stack`, then `start-local-stack`, in `@devdogsuga/supabase`.

## Trap 1: column-level `REVOKE` does not work the way it reads

The guarantee that a client cannot set or clear its own quarantine is a **grant**, not a policy: `apply_content_action()` is a definer and needs none. The obvious way to write it does nothing at all:

```sql
-- WRONG. Changes nothing.
revoke update ("quarantinedBy") on forum."resources" from authenticated;
```

Column privileges do not subtract from table-level ones. Every app schema here runs `alter default privileges ... grant all on tables to anon, authenticated, service_role`, so `authenticated` already holds a table-wide `UPDATE` and the revoke above leaves `has_column_privilege()` returning `true`. The author can clear their own quarantine, and nothing reports a problem.

The grant has to be built up per column rather than pared down:

```sql
revoke update on forum."resources" from anon, authenticated;
grant update ("title", "body") on forum."resources" to authenticated;
```

`platform."profile"` had already revoked the table-wide grant for an unrelated reason ([`20260803000000`](https://github.com/DevDogsUGA/DevDogsUGA/blob/main/supabase/migrations/20260803000000_platform_profile_identity.sql), keeping clients out of `ugaEmail` and `legal*`), which is why adding `quarantinedBy` needed no grant of its own: **a column added after the revoke is unreachable by clients by default.** The other order leaves the hole.

## Trap 2: an app with a quarantine column must be excluded from Drizzle introspection

The platform app runs **two** `drizzle-kit pull` passes into two generated modules:

| Config                            | Schema filter                          | Output                            |
| --------------------------------- | -------------------------------------- | --------------------------------- |
| `drizzle.config.ts`               | `["platform"]`                         | `src/server/db/schema/generated/` |
| `drizzle-introspection.config.ts` | `["*", "!platform", "!public", "!_*"]` | `src/supabase/drizzle/`           |

They already have one dependency edge: platform tables have foreign keys to `auth.users` and `auth.oauth_clients`, which Drizzle cannot resolve across two pulls, so `scripts/post-pull.ts` re-injects that import every time. It runs **platform → supabase/drizzle**, one way.

Any other app's schema matches `"*"` and lands in the second module — but a table with a quarantine column points at `platform."reportResolutions"`, in the first. Drizzle emits a reference it has no import for, so the generated file does not compile and the build breaks. Adding the reverse import would make two machine-generated modules mutually importing.

Excluding costs nothing anyway: `src/supabase/drizzle` exists so the console can reach the **Supabase-managed** schemas, and every consumer imports only `auth` tables.

## Trap 3: seeded personas need four empty strings

An app that seeds its own sign-in-able accounts inserts into `auth.users` from SQL: the local Docker stack is HTTP and cannot host OAuth. A naive row looks correct — it exists, `encrypted_password` holds a valid bcrypt hash, `email_confirmed_at` is set — and sign-in still fails with `"Database error querying schema"`, which names neither a column nor a user.

GoTrue scans several `auth.users` columns into **non-nullable Go strings**, so a `NULL` is a scan error, not an empty value. Four have no database default, and `supabase/seed/02_moderation.sql` sets them to `''` explicitly:

- `confirmation_token`
- `recovery_token`
- `email_change_token_new`
- `email_change`

A second, quieter requirement: **GoTrue resolves an email/password sign-in through `auth.identities`, not `auth.users`.** A user row with no matching `provider = 'email'` identity exists, shows in the dashboard, and cannot log in. The seed backfills one per user.

Neither applies to the persona test suite, which calls `auth.admin.createUser()` and lets GoTrue write both rows. Hand-writing them is only necessary from a `.sql` seed.
