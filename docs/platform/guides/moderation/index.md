---
name: Moderation
description: How a table becomes reportable and quarantinable — the one column that registers it, what quarantine means for different kinds of content, and why a freeze has to cover every surface the content reaches.
order: 1
---

# Moderation

A table becomes moderatable by acquiring one column:

```sql
alter table forum."resources"
  add column "quarantinedBy" uuid
    references "platform"."reportResolutions"("id") on delete set null;
```

That is the whole registration. This page is about everything that sentence leaves out, and you need it if you own a table members can write to. If you are only calling the reporting functions from a client, [Reporting](/docs/platform/guides/reporting) is the page you want; the SQL you actually have to write is [Integrating your own app](/docs/platform/guides/moderation/integrating).

Nothing is stored on the platform side, so nothing can drift. `platform.content_types()` asks `pg_constraint` every time — there is no registration call, nothing to restart, and no cache to invalidate. Drop the column and the table stops being moderatable, with no stale registration left behind to disagree with the schema.

The worked example is [`20260808000000_platform_profile_moderation.sql`](https://github.com/DevDogsUGA/DevDogsUGA/blob/main/supabase/migrations/20260808000000_platform_profile_moderation.sql), which makes `platform."profile"` — a member's display name and bio — reportable. **If you are integrating a new app, read that file.** This page explains why it says what it says.

## Everything else is derived

| Property     | Derived from                                   | Override when                        |
| ------------ | ---------------------------------------------- | ------------------------------------ |
| content type | the table name                                 | you want `resource`, not `resources` |
| label        | title-cased table name                         | you want nicer wording               |
| author       | the table's single foreign key to `auth.users` | there are two                        |
| snapshot     | every `text`/`varchar` column, in order        | a column is sensitive or noisy       |
| visibility   | **`restricted`**                               | the content is public                |
| URL          | none                                           | you want moderators to click through |

Overrides go in `platform."contentTypes"`, one optional row per table. A row on its own — with no foreign key anywhere — **declares content that is reportable but not quarantinable**: a profile, say, where the remedy is suspending the member rather than hiding a row.

The snapshot default is the one to think about before accepting it. It is copied into `platform."reports"."contentSnapshot"` and kept forever, so on a table carrying anything sensitive in a text column, the default quietly turns every report into a durable record of it.

## Quarantine does not mean the same thing for every kind of content

Settle this before writing any policy, because it decides which policy you write.

| Effect             | What it does                                                         | The policy that carries it |
| ------------------ | -------------------------------------------------------------------- | -------------------------- |
| `hide` _(default)_ | the row stops being visible to anyone but its author and a moderator | the **read** policy        |
| `freeze`           | the row stays visible and stops being editable                       | the **update** policy      |

Both are declared on `platform."contentTypes"."quarantineEffect"`, and null coalesces to `hide` because that is what an app with user-generated content almost always means.

`platform."profile"` is a `freeze`, and hiding it is not merely undesirable but unavailable. `preferredName` is load-bearing — rosters, teams, attendance, standings and the leaderboard all render it, so a profile row that disappears does not look moderated, it looks like data loss in half a dozen places at once. And the row is already private over PostgREST: profile's `SELECT` policy is `auth.uid() = "userId"`, own row only, so there is nobody for a quarantine predicate to hide it from. Adding one would hide the account settings page from its own owner and nothing else.

### The name of record

What the remedy actually is, for a profile: the display name is reset to the member's name of record, and they lose the ability to change it back.

A trigger fires when `quarantinedBy` goes non-null — never when a report is merely filed. That property is structural rather than a rule to remember: `quarantinedBy` is a foreign key to a _resolution_, and there is no resolution until a moderator has decided one, so there is no value to write before then.

It takes the name from two sources, in order:

1. **`legalFirstName` / `legalLastName`**, which come from the Involvement roster import and are never cleared by it — unlike `involvement*`, which the import nulls across every row before repopulating, and which is therefore unusable as a name of record.
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

<details>
<summary>Why is <code>is_profile_frozen()</code> a <code>security definer</code> function rather than an inline subquery?</summary>

A policy's subquery runs as the **querying role**, so `select 1 from platform."profile"` inside one is itself subject to profile's RLS. That happens to work today, because profile's read policy is own-row-only and the policy only ever asks about the caller's own row — but it is true by coincidence, and it would fail silently open the day that policy changes.

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

`execute` is revoked from `public` and `anon`, so only a signed-in caller's own policies reach it.

</details>

## Why it's like this

<details>
<summary>Why does the effect live on my table instead of in <code>platform</code>?</summary>

The **decision** is `platform."reportResolutions"` — the audit record, platform-owned, never lost. The **effect** is `"quarantinedBy"` on your own table, a foreign key pointing back at the decision that caused it.

Keeping the effect local is deliberate. Your app has to add a predicate to its policies either way, so moving the state into `platform` would relocate the risk of missing it rather than removing it — while costing a partial index on the hot read path and turning every listing into a cross-schema anti-join. A local column also lets you express more than hiding: showing the author "removed by moderators", restoring, keeping something out of public lists but inside their own drafts.

`on delete set null` means deleting a decision un-quarantines automatically, and the column carries its own provenance — "why is this hidden?" is a join, not a guess.

</details>
