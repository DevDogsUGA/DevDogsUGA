---
name: Sandbox App
description: The fixture app that demonstrates how an application integrates with DevDogs moderation — and the two traps that integration hides.
---

# The Sandbox App

`sandbox` is a fixture application: three tables of fake content living in their own Postgres schema, registered in `platform."apps"` like any real app. It is not a product. It exists so that reporting and moderation can be exercised, demonstrated, and copied.

Its migration is [`20260730000003_sandbox_fixture_app.sql`](https://github.com/DevDogs-UGA/DevDogs-Website/blob/main/supabase/migrations/20260730000003_sandbox_fixture_app.sql), and its fixture rows come from `supabase/seed/02_moderation.sql`. **If you are integrating a new app with moderation, read those two files.** This page explains why they say what they say.

## Why it exists

A freshly reset instance contains no user-generated content anywhere. `schedule_builder` holds course data, which is read-only reference material nobody can report. `study_group_finder` has no content tables yet. The Community Resource Forum has not migrated. Without fixtures, three separate things break at once:

1. **The tooling has nothing to work on.** `pnpm devtools` can check what the catalog derived, but its end-to-end round-trip — file a report, quarantine it, look again as someone else — needs content to file against, and `file_report` will not invent any.
2. **The test suite has nothing to assert.** Every claim the moderation system makes has the shape "reporting content does X". With no content there is no X.
3. **A contributor integrating an app has no worked example.** "Add a foreign key" is a sentence; a schema that works is a thing you can copy.

One fixture schema covers all three, which is why it ships as a real migration rather than as test-only scaffolding.

## The three tables are three different shapes

This is the part worth understanding, because any app you integrate will be one of these three.

### `posts` — pure derivation

A primary key, a foreign key to `auth.users`, two text columns, and the foreign key to `platform."reportResolutions"`. There is **no row for it in `platform."contentTypes"`**. Everything is derived from the catalog:

| Property          | Value           | Derived from                                  |
| ----------------- | --------------- | --------------------------------------------- |
| content type      | `posts`         | the table name                                |
| label             | `Posts`         | title-cased table name                        |
| ref column        | `id`            | the single-column primary key                 |
| author column     | `authorUserId`  | its one foreign key to `auth.users`           |
| snapshot columns  | `{title, body}` | its `text`/`varchar` columns, in column order |
| visibility        | `restricted`    | the default                                   |
| quarantine column | `quarantinedBy` | the foreign key to `reportResolutions`        |

Adding one column was the entire integration. There is no registration call, nothing to restart, and no cache to invalidate — `platform.content_types()` asks `pg_constraint` every time.

### `comments` — derivation with a second foreign key

The same shape, plus `postId` referencing `posts`. That matters for two reasons. Author derivation counts foreign keys **to `auth.users` specifically** and requires exactly one, so an unrelated foreign key does not confuse it. And a second content type in the same app means cross-type behaviour is testable: two independently quarantinable types under one registration.

### `profiles` — declaration, not derivation

The interesting one. It has **no** foreign key to `reportResolutions`, so the catalog would never find it. It becomes reportable purely through one row:

```sql
insert into "platform"."contentTypes"
  ("appId", "tableName", "contentType", "label", "authorColumn", "snapshotColumns", "visibility")
select a."id", 'profiles', 'profile', 'Profile', 'userId',
       array['handle', 'bio']::text[], 'public'
from "platform"."apps" a where a."slug" = 'sandbox';
```

That single row does five things, which is why it is the best illustration of the override table:

- **renames** the type (`profiles` → `profile`);
- **labels** it;
- **disambiguates** the author column, naming `userId` rather than relying on derivation;
- **narrows** the snapshot to two named columns rather than every text column;
- **opens** visibility, so the snapshot is returned to the reporter rather than withheld.

And because there is no quarantine column, resolving a report against it with `quarantine` **raises**, the transaction rolls back, and no decision is recorded. `profiles` exists so that path runs on every test execution instead of being a comment in a migration nobody reaches.

**This is the forum's `profile` type exactly.** A bad forum profile is remedied by suspending its owner, not by hiding a row. When the forum migrates it gets `resource` and `comment` free from their foreign keys and writes one row that looks almost identical to the above.

## What the schema demonstrates

### The two RLS rules every app must add

Both appear on every sandbox table, in the form an integrating app should copy.

```sql
-- every read policy
using (
  "quarantinedBy" is null
  or "authorUserId" = (select auth.uid())
  or "platform".has_permission((select auth.uid()), 'canModerate')
)

-- every write policy
with check (
  "authorUserId" = (select auth.uid())
  and not "platform".is_suspended((select auth.uid()))
)
```

The read rule is the one that gets silently missed, and the reason is structural: **quarantine is the only moderation outcome whose effect lives in the app's policies rather than the platform's.** A suspension takes effect because every app's write policies call `is_suspended()`. A ban takes effect inside Supabase Auth. But quarantine means nothing unless the app filters on the column — the platform sets it and has no way to observe whether anyone reads it.

That is the same failure mode as the webhook delivery this system replaced: an outcome recorded on one side with no evidence it landed on the other. It is why `apply_content_action()` raises rather than no-oping, and why the persona suite asserts the hiding rather than the setting.

### A third rule the plan does not mention

`author_update` also requires `"quarantinedBy" is null`:

```sql
create policy "author_update" on sandbox."posts"
  as permissive for update to authenticated
  using (
    "authorUserId" = (select auth.uid())
    and "quarantinedBy" is null
    and not "platform".is_suspended((select auth.uid()))
  )
  with check ("authorUserId" = (select auth.uid()));
```

Without it an author can rewrite quarantined content — editing the evidence a moderator is looking at, while the frozen snapshot in `platform."reports"` silently diverges from what the row now says.

### Denial in production

Every table carries the same restrictive policy:

```sql
create policy "non_prod_only" on sandbox."posts"
  as restrictive for all to anon, authenticated
  using (not "platform".is_production())
  with check (not "platform".is_production());
```

`for all` is correct here, and it is the **only** place in this subsystem where it is. Everywhere else a restrictive `for all ... using (false)` is a bug, because it applies to `SELECT` too and silently overrides the permissive read policy sitting next to it — that is exactly how `platform."instance"` was made invisible during development. Here, denying `SELECT` is the entire point.

Note that the schema **exists in production**, tables and all. Migrations stay byte-identical across every tier, so there is no branch to get wrong and no "did that run there?" question to answer. The gate is a property of the data, not of the deployment.

## Trap 1: column-level `REVOKE` does not work the way it reads

The guarantee that a client cannot set or clear its own quarantine is a **grant**, not a policy. `apply_content_action()` runs as the definer and needs no grant, so removing `UPDATE` on that one column from clients closes the hole at plan-time cost — which is to say, free.

The obvious way to write it does nothing at all:

```sql
-- WRONG. Changes nothing.
revoke update ("quarantinedBy") on sandbox."posts" from authenticated;
```

Column privileges do not subtract from table-level ones. Every app schema in this monorepo runs `alter default privileges ... grant all on tables to anon, authenticated`, so `authenticated` already holds a table-wide `UPDATE`, and the revoke above leaves `has_column_privilege()` returning `true`. The author can clear their own quarantine, and nothing anywhere reports a problem.

The grant has to be built up per column rather than pared down:

```sql
revoke update on sandbox."posts" from anon, authenticated;
grant update ("title", "body") on sandbox."posts" to authenticated;
```

`sandbox` therefore does **not** use `alter default privileges` at all; it grants explicitly, which is the pattern to copy. The persona suite asserts both halves: that an author cannot clear a quarantine, and that they can still edit a post that is not quarantined — so the denial is provably about that column and that state, not about `UPDATE` in general.

A related detail: `anon` gets `select` only. Row-level security would refuse an anonymous write regardless, since no permissive write policy names that role, but a grant nothing can exercise is dead weight in a file meant to be copied — and it becomes live the day someone widens a policy.

## Trap 2: `sandbox` is excluded from Drizzle introspection

The platform app runs **two** `drizzle-kit pull` passes into two generated modules:

| Config                            | Schema filter                                      | Output                                     |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `drizzle.config.ts`               | `["platform"]`                                     | `src/server/db/schema/generated/schema.ts` |
| `drizzle-introspection.config.ts` | `["*", "!platform", "!public", "!sandbox", "!_*"]` | `src/supabase/drizzle/schema.ts`           |

They already have a dependency edge. Platform tables have foreign keys to `auth.users` and `auth.oauth_clients`, which Drizzle cannot resolve across two separate pulls, so `scripts/post-pull.ts` re-injects the import on every pull:

```ts
import {
  usersInAuth as users,
  oauthClientsInAuth as oauthClients,
} from "~/supabase/drizzle/schema";
```

So the direction is **platform → supabase/drizzle**, one way.

`sandbox` matched `"*"` and landed in the second module — but its tables point at `platform."reportResolutions"`, which lives in the first. Drizzle emitted the reference with no import that could resolve it, and the build broke:

```
src/supabase/drizzle/schema.ts(443,41): error TS2304: Cannot find name 'reportResolutions'.
src/supabase/drizzle/relations.ts(27,40): error TS2339: Property 'reportResolutionsInPlatform' does not exist...
```

Adding the reverse import would make two machine-generated modules mutually importing, held together by a post-processing script injecting imports in both directions. It would likely work at runtime — the references sit inside arrow functions and evaluate lazily — but it is not a thing worth owning.

Excluding is right on the merits anyway. `src/supabase/drizzle` exists so the console can reach the **Supabase-managed** schemas through Drizzle, and every consumer in the codebase imports only `auth` tables (`usersInAuth`, `identitiesInAuth`, `oauthConsentsInAuth`). Sandbox content is fixture data the tooling reaches over PostgREST from the browser; the console has no reason to read another app's tables server-side.

> **Any app that adds the quarantine column belongs on that exclusion list.** The forum will hit this exact wall when `forum."resources"` and `forum."comments"` acquire their foreign keys.
>
> A better long-term fix is to flip that filter from a denylist to an allowlist. Today `"*"` opts every future app schema _in_ and relies on somebody remembering to opt it out. An allowlist of Supabase-managed schemas cannot fail that way, and nothing currently imports the schemas it would drop.

## Trap 3: seeded personas need four empty strings

The contributor loop ends with "sign in as a seeded persona", and that has to work on the local Docker stack, which is HTTP and therefore cannot host OAuth at all. So `02_moderation.sql` creates three real `auth.users` rows:

| Email                    | Password   | Purpose                                                                                                                |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `member@sandbox.test`    | `password` | an ordinary member — the only way to _encounter_ a permission boundary, since you are always Root on your own instance |
| `author@sandbox.test`    | `password` | owns the sandbox content, including one quarantined post                                                               |
| `moderator@sandbox.test` | `password` | resolves the queue                                                                                                     |

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
3. Revoke table-level `UPDATE` from `anon, authenticated` and grant it back per column, omitting `"quarantinedBy"` — see [Trap 1](#trap-1-column-level-revoke-does-not-work-the-way-it-reads).
4. Add the quarantine predicate to every read policy and the suspension predicate to every write policy.
5. For content that is reportable but not quarantinable, write one `platform."contentTypes"` row declaring it — see `profiles` above.
6. Seed report reasons and feedback topics for the app.
7. Add the schema to `[api] schemas` in `config.toml`, and to the exclusion list in `drizzle-introspection.config.ts`.
8. Verify with `pnpm devtools doctor --app <slug>`, then run the end-to-end round-trip against real content. The round-trip is the step that matters: it exercises _your_ read policy, which is the one thing the platform cannot check for you.
