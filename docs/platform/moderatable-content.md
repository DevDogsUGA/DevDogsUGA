---
name: Moderatable Content
description: How an application's content becomes reportable and quarantinable — the worked example, and the three traps integration hides.
---

# Making content moderatable

A table becomes moderatable by acquiring one column. That is the whole registration:

```sql
alter table forum."resources"
  add column "quarantinedBy" uuid
    references "platform"."reportResolutions"("id") on delete set null;
```

Nothing is stored on the platform side, so nothing can drift: drop the column and the table stops being moderatable, with no stale registration left behind to disagree with the schema. `platform.content_types()` asks `pg_constraint` every time — there is no registration call, nothing to restart, and no cache to invalidate.

This page is about everything that sentence leaves out.

The worked example is [`20260808000000_platform_profile_moderation.sql`](https://github.com/DevDogs-UGA/DevDogs-Website/blob/main/supabase/migrations/20260808000000_platform_profile_moderation.sql), which makes `platform."profile"` — a member's display name and bio — reportable. **If you are integrating a new app, read that file.** This page explains why it says what it says.

> **This used to be a fixture.** Until August 2026 the worked example was a `sandbox` schema of fake posts and comments, registered in `platform."apps"` on every tier including production and denied there by a restrictive policy. It is gone. A fixture app is indistinguishable from a real one to everything downstream, it had to be excluded by hand from Drizzle introspection and listed by hand in `config.toml`, and it meant the reference implementation was the one piece of the system nobody actually used. Real content that ships on every tier is a better example than fake content that ships on every tier.

## Quarantine does not mean the same thing for every kind of content

This is the distinction to get right before writing any policy, because it decides which one you write.

| Effect             | What it does                                                         | The policy that carries it |
| ------------------ | -------------------------------------------------------------------- | -------------------------- |
| `hide` _(default)_ | the row stops being visible to anyone but its author and a moderator | the **read** policy        |
| `freeze`           | the row stays visible and stops being editable                       | the **update** policy      |

Both are declared on `platform."contentTypes"."quarantineEffect"`, and the default is `hide` because that is what an app with user-generated content almost always means.

`platform."profile"` is a `freeze`, and it is worth understanding why hiding is not merely undesirable there but unavailable:

- **`preferredName` is load-bearing.** Rosters, teams, attendance, standings and the leaderboard all render it. A profile row that disappears does not look moderated, it looks like data loss, in half a dozen places at once.
- **The row is already private over PostgREST.** Profile's `SELECT` policy is `auth.uid() = "userId"` — own row only — so there is nobody for a quarantine predicate to hide it from. Adding one would hide the account settings page from its own owner and nothing else.

What the remedy actually is, for a profile: the display name is reset to the member's name of record, and they lose the ability to change it back.

### The name of record

A trigger fires when `quarantinedBy` goes non-null — never when a report is merely filed. That property is structural rather than a rule to remember: `quarantinedBy` is a foreign key to a _resolution_, and there is no resolution until a moderator has decided one, so there is no value to write before then.

It takes the name from two sources, in order:

1. **`legalFirstName` / `legalLastName`.** These come from the Involvement roster import and are never cleared by it — unlike `involvement*`, which the import nulls across every row before repopulating, and which is therefore unusable as a name of record.
2. **The Google identity's name, only when that identity's email is on `@uga.edu`.** A personal Gmail display name is self-set, so resetting an abusive name to it changes nothing in precisely the case this remedy exists for. The institutional domain is what makes the name attested by somebody other than its owner.

If neither is available the name is **left alone** rather than blanked, and a warning goes to the Postgres log. A profile with an empty `preferredName` renders as a gap in every roster, which is worse than the name a moderator is already looking at — and they still have `warn`, `suspend` and `ban` for that.

## A freeze has to cover the whole surface, not one table

This is the mistake most worth copying the answer to. The public profile is **three** things, and only one of them is the table the column sits on:

| Surface                      | Where it lives                            | How the freeze reaches it                          |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------- |
| display name, bio, pronouns… | `platform."profile"`                      | `"quarantinedBy" is null` in its own update policy |
| links on the public profile  | `platform."profileLinks"`                 | `platform.is_profile_frozen()`                     |
| avatar                       | an object in the `avatars` storage bucket | `platform.is_profile_frozen()`                     |

Freeze only the first and a member moves the abuse into a link title or an avatar image — stopped, as far as the moderation record shows, while still editing the page a moderator was looking at.

The helper is `security definer` rather than an inline subquery, and that is not stylistic:

```sql
create or replace function "platform".is_profile_frozen(uid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from "platform"."profile" p
    where p."userId" = uid and p."quarantinedBy" is not null
  );
$$;
```

A policy's subquery runs as the **querying role**, so `select 1 from platform."profile"` inside one is itself subject to profile's RLS. That happens to work today, because profile's read policy is own-row-only and the policy only ever asks about the caller's own row — but it is true by coincidence, and it would fail silently open the day that policy changes.

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

The quarantine rule is the one that gets silently missed, and the reason is structural: **quarantine is the only moderation outcome whose effect lives in the app's policies rather than the platform's.** A suspension takes effect because every app's write policies call `is_suspended()`. A ban takes effect inside Supabase Auth. But quarantine means nothing unless the app acts on the column — the platform sets it and has no way to observe whether anyone reads it.

That is the same failure mode as the webhook delivery this system replaced: an outcome recorded on one side with no evidence it landed on the other. It is why `apply_content_action()` raises rather than no-oping, and why the persona suite asserts the effect rather than the setting.

An app that hides should freeze as well. Without it an author can rewrite quarantined content — editing the evidence a moderator is looking at, while the frozen snapshot in `platform."reports"` silently diverges from what the row now says.

## Trap 1: column-level `REVOKE` does not work the way it reads

The guarantee that a client cannot set or clear its own quarantine is a **grant**, not a policy. `apply_content_action()` runs as the definer and needs no grant, so removing `UPDATE` on that one column from clients closes the hole at plan-time cost — which is to say, free.

The obvious way to write it does nothing at all:

```sql
-- WRONG. Changes nothing.
revoke update ("quarantinedBy") on forum."resources" from authenticated;
```

Column privileges do not subtract from table-level ones. Every app schema in this monorepo runs `alter default privileges ... grant all on tables to anon, authenticated`, so `authenticated` already holds a table-wide `UPDATE`, and the revoke above leaves `has_column_privilege()` returning `true`. The author can clear their own quarantine, and nothing anywhere reports a problem.

The grant has to be built up per column rather than pared down:

```sql
revoke update on forum."resources" from anon, authenticated;
grant update ("title", "body") on forum."resources" to authenticated;
```

`platform."profile"` had already done this, for an unrelated reason — [`20260803000000`](https://github.com/DevDogs-UGA/DevDogs-Website/blob/main/supabase/migrations/20260803000000_platform_profile_identity.sql) revoked the table-wide grant to keep clients out of `ugaEmail` and `legal*`. That is why adding `quarantinedBy` to it needed no grant statement of its own: **a column added after the revoke is unreachable by clients by default.** Doing it in the other order is what leaves the hole.

The persona suite asserts both halves: that a quarantined member cannot clear their own column, and that a moderator cannot forge one onto somebody else — the same error either way, because this is a role-level denial rather than a row-level one.

## Trap 2: an app with a quarantine column must be excluded from Drizzle introspection

The platform app runs **two** `drizzle-kit pull` passes into two generated modules:

| Config                            | Schema filter                          | Output                                     |
| --------------------------------- | -------------------------------------- | ------------------------------------------ |
| `drizzle.config.ts`               | `["platform"]`                         | `src/server/db/schema/generated/schema.ts` |
| `drizzle-introspection.config.ts` | `["*", "!platform", "!public", "!_*"]` | `src/supabase/drizzle/schema.ts`           |

They already have a dependency edge. Platform tables have foreign keys to `auth.users` and `auth.oauth_clients`, which Drizzle cannot resolve across two separate pulls, so `scripts/post-pull.ts` re-injects the import on every pull:

```ts
import {
  usersInAuth as users,
  oauthClientsInAuth as oauthClients,
} from "~/supabase/drizzle/schema";
```

So the direction is **platform → supabase/drizzle**, one way.

Any other app's schema matches `"*"` and lands in the second module — but a table with a quarantine column points at `platform."reportResolutions"`, which lives in the first. Drizzle emits the reference with no import that could resolve it, and the build breaks:

```
src/supabase/drizzle/schema.ts(443,41): error TS2304: Cannot find name 'reportResolutions'.
src/supabase/drizzle/relations.ts(27,40): error TS2339: Property 'reportResolutionsInPlatform' does not exist...
```

Adding the reverse import would make two machine-generated modules mutually importing, held together by a post-processing script injecting imports in both directions. It would likely work at runtime — the references sit inside arrow functions and evaluate lazily — but it is not a thing worth owning.

Excluding is right on the merits anyway. `src/supabase/drizzle` exists so the console can reach the **Supabase-managed** schemas through Drizzle, and every consumer in the codebase imports only `auth` tables. An app's own content is reached over PostgREST; the console has no reason to read another app's tables server-side.

> A better long-term fix is to flip that filter from a denylist to an allowlist. Today `"*"` opts every future app schema _in_ and relies on somebody remembering to opt it out. An allowlist of Supabase-managed schemas cannot fail that way, and nothing currently imports the schemas it would drop.

## Trap 3: seeded personas need four empty strings

The contributor loop ends with "sign in as a seeded persona", and that has to work on the local Docker stack, which is HTTP and therefore cannot host OAuth at all. So `supabase/seed/02_moderation.sql` creates three real `auth.users` rows:

| Email                    | Password   | Purpose                                                                                                                 |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `member@devdogs.test`    | `password` | an ordinary member — the only way to _encounter_ a permission boundary, since you are Root on your own instance         |
| `author@devdogs.test`    | `password` | owns the profile the seeded report is filed against, and carries a name of record so the reset has something to restore |
| `moderator@devdogs.test` | `password` | holds a Moderator role: works the report queue, and nothing else                                                        |

Inserting into `auth.users` directly is a documented pattern, and a naive row looks correct — it exists, `encrypted_password` holds a valid bcrypt hash, `email_confirmed_at` is set. Sign-in nevertheless fails with:

```json
{
  "code": 500,
  "error_code": "unexpected_failure",
  "msg": "Database error querying schema"
}
```

which names neither a column nor a user. GoTrue scans several `auth.users` columns into **non-nullable Go strings**, so a `NULL` is a scan error rather than an empty value. Four of them have no database default:

- `confirmation_token`
- `recovery_token`
- `email_change_token_new`
- `email_change`

(`phone_change`, `email_change_token_current` and `reauthentication_token` all default to `''` and are fine.) The seed sets those four to `''` explicitly.

There is a second, quieter requirement: **GoTrue resolves an email/password sign-in through `auth.identities`, not `auth.users`.** A user row with no matching `provider = 'email'` identity exists, appears in the dashboard, and cannot log in. The seed backfills one per user.

None of this affects the persona test suite, which calls `auth.admin.createUser()` and lets GoTrue write both rows itself. Hand-writing them is only necessary from a `.sql` seed, which has no HTTP client available.

## Integrating your own app

1. Register the app in `platform."apps"` (slug, schema name, display name) from a migration.
2. Add `"quarantinedBy" uuid references platform."reportResolutions"(id) on delete set null` to each table holding moderatable content. That foreign key _is_ the registration.
3. Revoke table-level `UPDATE` from `anon, authenticated` and grant it back per column, omitting `"quarantinedBy"` — see [Trap 1](#trap-1-column-level-revoke-does-not-work-the-way-it-reads). Do this **before** adding the column and there is nothing to omit.
4. Decide whether quarantine hides or freezes, declare it on `platform."contentTypes"` if it is not `hide`, and add the matching predicate to every read or update policy. Add the suspension predicate to every write policy.
5. Find every other surface the same content reaches — a second table, a storage object — and freeze those too.
6. For content that is reportable but **not** quarantinable, write one `platform."contentTypes"` row declaring it, with no foreign key. Resolving such a report with `quarantine` raises and the whole decision rolls back, which is what makes the outcome atomic.
7. Add the schema to `[api] schemas` in `config.toml`, and to the exclusion list in `drizzle-introspection.config.ts`.
8. Verify with `pnpm devtools doctor --app <slug>`, then `pnpm devtools roundtrip`. The round-trip is the step that matters: it exercises _your_ policy, which is the one thing the platform cannot check for you.

> **`config.toml` changes need a restart, not a reset.** `[api] schemas` becomes PostgREST's `db-schemas` at `supabase start`, so `supabase db reset` alone leaves the old list in place — and if a schema on it no longer exists, PostgREST refuses to build its schema cache at all and every request returns `PGRST002`. `pnpm exec supabase stop && pnpm exec supabase start`.
