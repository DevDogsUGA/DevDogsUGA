-- ============================================================
-- Public member profiles
-- ============================================================
--
-- Verified members get a logged-out-visible profile at /community/@<handle>,
-- a spot in the /community directory, a place in the team invite picker and a
-- credit on competition archives. This file is the whole data layer for that:
--
--   * profile gains a master switch, seven per-field switches and a handle;
--   * platform.handle_options(uid) is the one function that says which handles
--     a member may pick, used by the backfill below and by the app;
--   * platform.set_handle(uid, handle) is the only way a handle is written;
--   * platform."publicProfiles" is the ONE place the "is this member public"
--     rule lives. Every public reader joins through it.
--
-- Public by default, each part individually hideable. What never appears here
-- at all, hidden or not: legal and involvement names, ugaEmail, the auth email,
-- attendance, streak, reflections, pronouns, graduation. Adding any of those to
-- "publicProfiles" is a privacy change, not a convenience.


-- ============================================================
-- Columns
-- ============================================================
--
-- "showBio" governs bio AND roleDescription together. They are the same kind of
-- thing to a visitor (words the member wrote about themselves) and a second
-- switch would make a member decide twice. The officer Leadership section is a
-- separate surface that reads roleDescription on its own terms and is not
-- affected by this flag.
--
-- There is no "avatar" column to name a flag after: the image is one object in
-- the public `avatars` bucket keyed by the user id, so "showAvatar" only
-- controls whether this profile points at it. The object itself stays
-- fetchable by anyone who already knows the id; the id is never handed out for
-- a profile that hides its avatar.
--
-- "showEmail" is deliberately NOT consumed here. The address it governs on
-- /account is the UGA address, which the product rules keep self-only.
alter table "platform"."profile"
  add column "publicProfile"      boolean not null default true,
  add column "showName"           boolean not null default true,
  add column "showAvatar"         boolean not null default true,
  add column "showBio"            boolean not null default true,
  add column "showLinks"          boolean not null default true,
  add column "showCompetitions"   boolean not null default true,
  add column "showContributions"  boolean not null default true,
  add column "showStars"          boolean not null default true,
  add column "handle"             text;

-- Lowercase only, so a plain unique index IS case-insensitive uniqueness, and
-- the same lowercase invariant lets lookups compare with `=` on an indexed
-- column. citext would say this directly but drizzle-kit cannot introspect it
-- (see "profile_ugaEmail_lowercase" in file 01).
alter table "platform"."profile"
  add constraint "profile_handle_format"
  check (
    "handle" is null
    or ("handle" ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' and char_length("handle") between 2 and 39)
  );

create unique index "profile_handle_key" on "platform"."profile" ("handle");

-- Directory and invite-picker prefix search.
create index "profile_handle_prefix_idx"
  on "platform"."profile" ("handle" text_pattern_ops)
  where "handle" is not null;

comment on column "platform"."profile"."handle" is
  'The member''s public URL name (/community/@handle). Null until chosen. Lowercase, unique, and written only by platform.set_handle(), which accepts nothing outside platform.handle_options().';
comment on column "platform"."profile"."publicProfile" is
  'Master switch. False removes the member from every public surface regardless of the per-field switches.';

-- The browser may flip the switches. It may not write "handle": a column grant
-- would let a member claim any string that passes the check constraint,
-- including someone else's MyID or a name that impersonates an officer. The
-- grant is additive over file 01's, so the revoke-first rule is already honored
-- and "handle" simply stays off the list.
grant update (
  "publicProfile",
  "showName",
  "showAvatar",
  "showBio",
  "showLinks",
  "showCompetitions",
  "showContributions",
  "showStars"
) on "platform"."profile" to authenticated;


-- ============================================================
-- Handle candidates
-- ============================================================

-- Lowercase, strip accents, keep [a-z0-9]. A fixed translate() rather than
-- unaccent: the extension is not installed in this stack or in the production
-- migration history, and a table here is deterministic where unaccent's
-- dictionary is not.
create or replace function "platform"."handle_slug"(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(
      replace(replace(replace(replace(replace(
        translate(
          input,
          'ÀÁÂÃÄÅĀĂĄÇĆČĎĐÈÉÊËĒĖĘĚÌÍÎÏĪĮŁÑŃŇÒÓÔÕÖØŌŐŘŚŠŞȘŤŢȚÙÚÛÜŪŮŰŲÝŸŹŻŽàáâãäåāăąçćčďđèéêëēėęěìíîïīįłñńňòóôõöøōőřśšşșťţțùúûüūůűųýÿźżž',
          'AAAAAAAAACCCDDEEEEEEEEIIIIIILNNNOOOOOOOORSSSSTTTUUUUUUUUYYZZZaaaaaaaaacccddeeeeeeeeiiiiiilnnnoooooooorsssstttuuuuuuuuyyzzz'
        ),
        'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE')
    ),
    '[^a-z0-9]', '', 'g'
  );
$$;

revoke execute on function "platform"."handle_slug"(text) from anon, authenticated;

create or replace function "platform"."handle_is_valid"(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and candidate ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    and char_length(candidate) between 2 and 39;
$$;

revoke execute on function "platform"."handle_is_valid"(text) from anon, authenticated;


-- ============================================================
-- handle_options
-- ============================================================
--
-- The handles a member may choose, in the order the UI should offer them. One
-- function, so the backfill below and the app can never disagree about what is
-- allowed, and set_handle() can validate against exactly what was offered.
--
--   github           identity_data->>'user_name'   (what auth/providers/github.ts reads)
--   discord          identity_data->>'full_name'   (Supabase's Discord provider writes
--                                                   the username there, not user_name;
--                                                   see ConnectedAccountField/DiscordField)
--   myid             local part of ugaEmail
--   legal_full       legalFirstName + last name
--   legal_initial    legalFirstName + last initial
--   preferred_full   involvementFirstName + last name
--   preferred_initial involvementFirstName + last initial
--   suffixed         only when every candidate above is taken: the first valid
--                    name candidate with the smallest free numeric suffix, 2, 3, ...
--
-- "Last name" is coalesce(involvementLastName, legalLastName): the roster import
-- nulls the involvement columns for anyone off the current roster, and the
-- durable legal name is the right stand-in.
--
-- `available` is false only when ANOTHER member holds the handle. The caller's
-- own current handle counts as available. Identical handles from different
-- kinds collapse into the earliest kind.
--
-- Who may call: a member for their own uid, plus roles with no JWT subject
-- (postgres, the service role, the app server). anon has no execute at all, and
-- an authenticated caller asking about anyone else gets 42501, so the function
-- cannot be used to read another member's GitHub login, MyID or legal name.
-- The unsuffixed candidates. Internal: it has no caller check, so API roles
-- cannot execute it; handle_options() below is the guarded door.
create or replace function "platform"."handle_candidates"(uid uuid)
returns table ("ord" integer, "kind" text, "handle" text, "available" boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.ord,
    c.kind,
    c.handle,
    not exists (
      select 1 from "platform"."profile" other
      where other."handle" = c.handle and other."userId" <> uid
    )
  from (
    select distinct on (raw.handle) raw.ord, raw.kind, raw.handle
    from (
      select 1 as ord, 'github' as kind,
             lower(i.identity_data ->> 'user_name') as handle
        from auth.identities i
       where i.user_id = uid and i.provider = 'github'
      union all
      select 2, 'discord', lower(i.identity_data ->> 'full_name')
        from auth.identities i
       where i.user_id = uid and i.provider = 'discord'
      union all
      select 3, 'myid', lower(split_part(p."ugaEmail", '@', 1))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 4, 'legal_full',
             "platform"."handle_slug"(p."legalFirstName")
               || "platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName"))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 5, 'legal_initial',
             "platform"."handle_slug"(p."legalFirstName")
               || left("platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")), 1)
        from "platform"."profile" p where p."userId" = uid
      union all
      select 6, 'preferred_full',
             "platform"."handle_slug"(p."involvementFirstName")
               || "platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName"))
        from "platform"."profile" p where p."userId" = uid
      union all
      select 7, 'preferred_initial',
             "platform"."handle_slug"(p."involvementFirstName")
               || left("platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")), 1)
        from "platform"."profile" p where p."userId" = uid
    ) raw
    where "platform"."handle_is_valid"(raw.handle)
    order by raw.handle, raw.ord
  ) c
  order by c.ord;
$$;

revoke execute on function "platform"."handle_candidates"(uuid) from anon, authenticated;

-- The smallest free numeric suffix, 2, 3, ..., on `base` for `uid`: the handle
-- a member is offered when everything they would otherwise pick is taken. The
-- base is truncated so the suffixed handle still fits the 39-character limit.
create or replace function "platform"."handle_suffixed"(uid uuid, base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := 2;
  candidate text;
begin
  if base is null then
    return null;
  end if;
  loop
    candidate := left(base, 39 - char_length(n::text)) || n::text;
    exit when "platform"."handle_is_valid"(candidate)
      and not exists (
        select 1 from "platform"."profile" other
        where other."handle" = candidate and other."userId" <> uid
      );
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

revoke execute on function "platform"."handle_suffixed"(uuid, text) from anon, authenticated;

create or replace function "platform"."handle_options"(uid uuid)
returns table ("kind" text, "handle" text, "available" boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  base text;
  suffixed text;
begin
  if caller is not null and caller <> uid then
    raise exception 'handle_options: not your profile' using errcode = '42501';
  end if;

  if exists (select 1 from "platform"."handle_candidates"(uid) c where c.available) then
    return query
      select c.kind, c.handle, c.available
        from "platform"."handle_candidates"(uid) c
       order by c.ord;
    return;
  end if;

  -- Either there are no candidates at all, or every one is taken. Suffix the
  -- member's preferred_initial, computed directly rather than read from the
  -- candidates (an identical earlier kind may have absorbed it), else their
  -- first valid name candidate.
  select p."handle_base" into base
    from (
      select "platform"."handle_slug"(q."involvementFirstName")
               || left("platform"."handle_slug"(coalesce(q."involvementLastName", q."legalLastName")), 1)
               as "handle_base"
        from "platform"."profile" q
       where q."userId" = uid
    ) p
   where "platform"."handle_is_valid"(p."handle_base");

  if base is null then
    select c.handle into base
      from "platform"."handle_candidates"(uid) c
     where c.kind in ('preferred_full', 'legal_full', 'legal_initial', 'preferred_initial')
     order by c.ord
     limit 1;
  end if;

  return query
    select c.kind, c.handle, c.available
      from "platform"."handle_candidates"(uid) c
     order by c.ord;

  suffixed := "platform"."handle_suffixed"(uid, base);
  if suffixed is not null then
    return query select 'suffixed'::text, suffixed, true;
  end if;
end;
$$;

revoke execute on function "platform"."handle_options"(uuid) from anon;


-- ============================================================
-- set_handle
-- ============================================================
--
-- The only writer of "handle". Returns a status instead of raising so a server
-- action can branch without parsing error text:
--
--   'set'          written
--   'taken'        someone else holds it: either already (offered as
--                  available = false) or they won the race between the options
--                  read and this write (the unique index fired)
--   'not_offered'  not in the caller's handle_options(); nothing was written
--   'blocked'      the member is quarantined or suspended, who may not edit
--                  their profile
--   'no_profile'   no profile row for uid
--
-- Same caller rule as handle_options().
create or replace function "platform"."set_handle"(uid uuid, new_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  wanted text := lower(btrim(new_handle));
  offered boolean;
begin
  if caller is not null and caller <> uid then
    raise exception 'set_handle: not your profile' using errcode = '42501';
  end if;

  if not exists (select 1 from "platform"."profile" p where p."userId" = uid) then
    return 'no_profile';
  end if;

  if "platform".is_profile_frozen(uid) or "platform".is_suspended(uid) then
    return 'blocked';
  end if;

  select o.available into offered
    from "platform"."handle_options"(uid) o
   where o.handle = wanted;

  if offered is null then
    return 'not_offered';
  end if;
  if not offered then
    return 'taken';
  end if;

  begin
    update "platform"."profile" set "handle" = wanted where "userId" = uid;
  exception when unique_violation then
    return 'taken';
  end;

  return 'set';
end;
$$;

revoke execute on function "platform"."set_handle"(uuid, text) from anon;


-- ============================================================
-- Backfill
-- ============================================================
--
-- Every member who is verified today gets a handle, so the directory is not
-- empty on the day it ships: their involvement first + last name, else first
-- name + last initial, else that initial form with the smallest free numeric
-- suffix. Matched by handle VALUE, not by option kind, because handle_options
-- folds identical handles into the earliest kind and a member whose legal and
-- roster first names agree has their "preferred_full" reported as "legal_full".
-- Processed oldest account first (userId as the tiebreaker) so a collision
-- always resolves the same way. Members who become verified later pick theirs
-- in the app.
do $$
declare
  m record;
  chosen text;
begin
  for m in
    select p."userId",
           "platform"."handle_slug"(p."involvementFirstName")
             || "platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")) as "full",
           "platform"."handle_slug"(p."involvementFirstName")
             || left("platform"."handle_slug"(coalesce(p."involvementLastName", p."legalLastName")), 1) as "initial"
      from "platform"."profile" p
      join "platform"."profileWithVerification" v on v."userId" = p."userId"
      join auth.users u on u.id = p."userId"
     where v.verified and p."handle" is null
     order by u.created_at, p."userId"
  loop
    chosen := (
      select h
        from (values (1, m."full"), (2, m."initial")) as t(rank, h)
       where "platform"."handle_is_valid"(h)
         and not exists (
           select 1 from "platform"."profile" other
           where other."handle" = h and other."userId" <> m."userId"
         )
       order by rank
       limit 1
    );
    if chosen is null then
      chosen := "platform"."handle_suffixed"(m."userId", m."initial");
    end if;

    if chosen is not null then
      update "platform"."profile" set "handle" = chosen where "userId" = m."userId";
    end if;
  end loop;
end;
$$;


-- ============================================================
-- publicProfiles
-- ============================================================
--
-- The single statement of "who is public": verified AND publicProfile AND has a
-- handle AND not quarantined AND not suspended. Every public reader (profile
-- page, directory, invite search, archive credits) goes through this view or
-- joins to it, so the rule is never restated.
--
-- Access model: SERVER ONLY. The view is owned by postgres and is NOT
-- security_invoker, so it reads profile past its own-row RLS. anon and
-- authenticated get no privilege on it, the same posture as "memberStars"; the
-- platform server connects as postgres and is the only reader. Nothing about a
-- logged-out visitor needs PostgREST to see it.
--
-- "userId" is in the view for server-side joins (activity, invites) and must
-- not be serialized to a page for a profile that hides its avatar. Hidden
-- fields come back NULL; the flags are repeated so the UI can tell "hidden"
-- from "never filled in".
create or replace view "platform"."publicProfiles" as
select
  p."userId",
  p."handle",
  case when p."showName" then p."preferredName" end as "displayName",
  (
    p."showAvatar"
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars' and o.name = p."userId"::text
    )
  ) as "hasAvatar",
  case when p."showBio" then p."bio" end as "bio",
  case when p."showBio" then p."roleDescription" end as "roleDescription",
  case when p."showGithub" then (
    select lower(i.identity_data ->> 'user_name')
      from auth.identities i
     where i.user_id = p."userId" and i.provider = 'github'
  ) end as "githubHandle",
  case when p."showDiscord" then (
    select i.identity_data ->> 'full_name'
      from auth.identities i
     where i.user_id = p."userId" and i.provider = 'discord'
  ) end as "discordHandle",
  case when p."showLinkedin" then (
    select i.identity_data ->> 'name'
      from auth.identities i
     where i.user_id = p."userId" and i.provider = 'linkedin_oidc'
  ) end as "linkedinName",
  p."showName",
  p."showAvatar",
  p."showBio",
  p."showLinks",
  p."showCompetitions",
  p."showContributions",
  p."showStars"
from "platform"."profile" p
join "platform"."profileWithVerification" v on v."userId" = p."userId"
where v.verified
  and p."publicProfile"
  and p."handle" is not null
  and p."quarantinedBy" is null
  and not "platform".is_suspended(p."userId");

revoke all on "platform"."publicProfiles" from anon, authenticated;

comment on view "platform"."publicProfiles" is
  'The one definition of a public member profile. Server-only (no anon/authenticated grant). Hidden fields are NULL. Never add legal/involvement names, emails or attendance.';
