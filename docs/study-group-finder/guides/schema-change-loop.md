---
name: Schema change loop
description: Adding a table to study_group_finder — the migration, the generated Dart model, and writing RLS so a client only ever reaches its own rows.
order: 3
section: guides
---

# Schema change loop

`study_group_finder` has no tables yet — every table this app gets starts
with this loop. `your_table` below is a placeholder; swap in whatever you are
actually building.

## 1. Draft the migration

```bash
pnpm devtools db migration new
```

It asks which app/schema the migration is for when you don't pass one
(`--app study-group-finder`), and names the file
`<timestamp>_study_group_finder_<desc>.sql` — the schema goes in the
filename because one flat `supabase/migrations/` directory holds every app's
migrations together, in the order they run.

> [!IMPORTANT]
> Before you merge, check `main` hasn't grown a newer migration than yours.
> If it has, recreate your file with a fresh timestamp — CI fails a new
> migration whose timestamp is older than `main`'s latest.

## 2. Write the SQL

```sql
create table "study_group_finder"."your_table" (
  "id" uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users (id) on delete cascade,
  -- your columns
  "createdAt" timestamptz not null default now()
);
```

Then enable RLS and write policies — see below. `study_group_finder`'s
schema-level grants already exist
(`supabase/migrations/20260829000000_00_schemas_and_grants.sql`): `anon` and
`authenticated` get `INSERT`/`UPDATE`/`DELETE`/`SELECT` on every table by
default, by way of `alter default privileges`. That grant is what makes RLS
the only thing standing between a client and every row in your table — skip
it and the table is wide open.

## 3. Apply it and regenerate types

```bash
pnpm devtools db migrate
pnpm --filter study-group-finder types:db
```

`types:db` reads whatever tables exist through supadart, so a new
table is picked up automatically — nothing to register. Regenerate rather
than hand-editing `lib/generated/`; it is gitignored output, not source.

## 4. Use the generated model

```dart
final rows = await Supabase.instance.client
    .schema('study_group_finder')
    .from('your_table')
    .select();
```

`.schema('study_group_finder')` matches the `postgrestOptions` the client was
initialised with in `lib/main.dart` — set it explicitly rather than relying
on which schema PostgREST treats as default.

## Row Level Security

RLS is what actually protects your table — the schema boundary is
organizational, not a security boundary: every schema in this project sits
behind the same PostgREST endpoint and the same publishable key, so a client
that can reach one schema can reach all three. Nothing stops a client from
querying `study_group_finder` today and `platform` tomorrow with the same
key; only each table's own policies decide what a given user gets back.

**Enable it, always, before you write a policy:**

```sql
alter table "study_group_finder"."your_table" enable row level security;
```

A table with RLS enabled and **no policies at all** denies everything by
default — that is the safe failure mode while you are still deciding what a
policy should say.

### `auth.uid()`

Every request PostgREST serves runs as either `anon` (no session) or
`authenticated` (a valid Supabase Auth JWT), and `auth.uid()` reads the
authenticated user's id straight out of that JWT — `null` for `anon`. A
policy comparing a row's owner column against `auth.uid()` is how "only my
own rows" gets enforced at the database, not trusted to the client.

### Policy shapes

The repo's own convention (see `supabase/migrations/20260829020100_08_schedule_builder.sql`)
is one `for all` policy per owner-scoped table, with the same predicate in
`using` (which rows a query is allowed to see or touch) and `with check`
(which rows a write is allowed to produce or leave behind):

```sql
create policy "users_own_rows" on "study_group_finder"."your_table"
  as permissive for all to "authenticated"
  using (auth.uid() = "study_group_finder"."your_table"."userId")
  with check (auth.uid() = "study_group_finder"."your_table"."userId");
```

Split it into one policy per command instead when the rule genuinely differs
by operation — a table with public reads but owner-only writes needs a
`select` policy open to `anon, authenticated` plus separate `insert`,
`update` and `delete` policies scoped to the owner, rather than one `for all`
policy trying to say both things at once:

```sql
create policy "public_read" on "study_group_finder"."your_table"
  for select to anon, authenticated using (true);

create policy "owner_write" on "study_group_finder"."your_table"
  for insert to authenticated with check (auth.uid() = "userId");
```

A restrictive policy (`as restrictive`) narrows what a permissive policy
already allowed — it's how a handful of tables in this repo close writes
entirely (`no_client_insert`/`no_client_update`/`no_client_delete`, one
policy per command) on rows only the server should ever write. Restrictive
policies **AND** together and with the permissive set, so getting the split
wrong is easy: a single restrictive `for all using (false)` also blocks
`select`, silently cancelling a public-read policy on the same table. Write
one restrictive policy per command you actually mean to close.

### Testing it

`packages/supabase/testing` is this repo's RLS persona suite — it signs in as
real personas with `signInWithPassword` and asserts both sides of every rule:
an allow and a deny. A policy test that only checks the allow side still
passes when the policy is missing entirely, so always assert the deny too:

```bash
pnpm devtools db start && pnpm devtools db reset
pnpm --filter @devdogsuga/supabase test:rls
```

See [`@devdogsuga/supabase`](/docs/toolkit/guides/stack/supabase) for how the
persona suite is wired up, and
[Supabase's own RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
for the mechanics beyond what's specific to this repo.
