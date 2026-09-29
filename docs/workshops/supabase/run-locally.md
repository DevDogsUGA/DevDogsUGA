---
name: "Run It Locally"
description: "Turn the workshop's SQL into migration files and run the whole stack on your own machine."
order: 4
---

<!-- Generated from Backstage apps/slides/decks/2026-09-28-supabase.md by `pnpm export:md`; edit the deck, not this file. -->

# Run It Locally

<!-- prettier-ignore-start -->

## Start Supabase Locally

```bash
# Start Postgres, Auth, and Studio in Docker
pnpm dlx supabase start
# Print the local API URL, Studio URL, and publishable key
pnpm dlx supabase status
```

## Turn the SQL into Migrations

```bash
# Create empty, timestamped files under supabase/migrations
pnpm dlx supabase migration new guestbook
pnpm dlx supabase migration new profiles
# Paste in the SQL we ran in the Dashboard, then
# rebuild the local database from those files
pnpm dlx supabase db reset
```

`supabase/migrations/20260928000000_guestbook.sql`:

```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
-- …
alter table public.messages enable row level security;
-- …
-- Anyone (signed in or not) can read the guestbook.
create policy "messages are readable by everyone"
  on public.messages
  for select
  to anon, authenticated
  using (true);
-- …
-- Only signed-in users can post, and only under their own user id.
create policy "authenticated users can insert their own messages"
  on public.messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);
-- …
-- Signed-in users can remove their own messages. There is no update
-- policy: we only support post-and-delete for this workshop.
create policy "authenticated users can delete their own messages"
  on public.messages
  for delete
  to authenticated
  using (auth.uid() = user_id);
```

`supabase/migrations/20260928000100_profiles.sql`:

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

alter table public.profiles enable row level security;
-- …
-- Names are public (they show up next to every message), but nobody can
-- write to this table directly -- only the trigger below does that.
create policy "profiles are readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
-- …
-- Runs as the table owner (security definer) so it can insert into
-- public.profiles even though the signed-in user has no write policy
-- there. `search_path = ''` stops it from being tricked by a
-- same-named function or table planted earlier in a caller's search path.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;
-- …
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
-- …
-- Backfill: give everyone who signed up before this migration a profile too.
insert into public.profiles (id, name)
select
  id,
  coalesce(
    raw_user_meta_data ->> 'name',
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'preferred_username',
    split_part(email, '@', 1)
  )
from auth.users
on conflict (id) do nothing;
-- …
-- Messages now point at profiles (not auth.users directly), so PostgREST
-- can embed `profiles(name)` in a single select. The client can no longer
-- send its own author_name -- the name always comes from the server.
alter table public.messages
  add constraint messages_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.messages drop column author_name;
```

## Configure OAuth Sign-In

`supabase/config.toml`:

```toml
[auth.external.apple]
enabled = false
client_id = ""
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"
# Overrides the default auth callback URL derived from auth.external_url.
redirect_uri = ""
# Overrides the default auth provider URL. Used to support self-hosted gitlab, single-tenant Azure,
# or any other third-party OIDC providers.
url = ""
# If enabled, the nonce check will be skipped. Required for local sign in with Google auth.
skip_nonce_check = false
# If enabled, it will allow the user to successfully authenticate when the provider does not return an email address.
email_optional = false
```

```bash
# Register "Sign in with DevDogs" on the local stack
# (a custom provider, so it isn't in config.toml)
pnpm dlx @devdogsuga/devtools oauth
```

The monorepo works exactly like this: every schema change is a migration under `supabase/migrations`.

<!-- prettier-ignore-end -->
