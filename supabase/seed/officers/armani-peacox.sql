-- Armani Peacox: account, profile, academic programs, links and role grants.
--
-- Insert only, safe to run again: every write is `on conflict do nothing` (or
-- guarded by `not exists`), so a rerun never overwrites what the officer has
-- since edited in /account or what an admin changed in the console. Corrections
-- go through the console, the CLI or a one-off migration.
--
-- Runs after `seed/roles/*.sql` (config.toml's `[db.seed] sql_paths` order),
-- which is what guarantees the roles granted below exist. Each file is its own
-- transaction, so an ambiguous account match here rolls back only this officer.
--
-- The officer is matched to `auth.users` case-insensitively on their UGA MyID
-- address or any altEmail, and a placeholder account is created only where
-- nothing matches. If they sign in under an address on neither list, GoTrue
-- mints a NEW user and this profile is stranded, so add the address here
-- before a reset. The headshot is `avatars/<seeded id>`, carried into the
-- `avatars` bucket by `objects_path` in config.toml.
--
-- No Discord user id is on record for this officer. To store one, add
--   insert into "platform"."officerDiscordIds" ("userId", "discordUserId")
--   values (v_user, '<snowflake>') on conflict do nothing;
-- inside the block below; the sync-discord-roles cron then treats them as
-- linked until they link through OAuth.
--
-- Submitted as Ashlee Peacox; Armani is the name she goes by. Her wording,
-- her pronouns -- see the note above.

begin;

do $$
declare
  v_slug constant text := 'armani-peacox';
  v_email constant text := 'aap86342@uga.edu';
  v_alt_emails constant text[] := array['ashlee.peacox@uga.edu']::text[];
  v_seeded_id constant uuid := '00000000-0000-4000-b000-000000000005';
  v_user uuid;
  v_matches integer;
begin
  -- Create the placeholder container only where NOTHING matches yet -- primary
  -- or altEmail, case-insensitively. A created row has no password and no
  -- `auth.identities` row, so it cannot sign in. The four empty strings are
  -- not decoration: GoTrue scans those token columns into non-nullable Go
  -- strings and they have no database default, so a row without them fails
  -- every sign-in with an error naming neither the column nor the user.
  insert into "auth"."users" (
    "id", "instance_id", "aud", "role", "email",
    "raw_app_meta_data", "raw_user_meta_data",
    "confirmation_token", "recovery_token",
    "email_change_token_new", "email_change",
    "created_at", "updated_at"
  )
  select
    v_seeded_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', v_email,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', now(), now()
  where not exists (
    select 1 from "auth"."users" u
    where lower(u."email") = lower(v_email)
       or lower(u."email") = any (
            select lower("e") from unnest(v_alt_emails) as "e"
          )
  )
  on conflict ("id") do nothing;

  -- Rank the candidates (lower wins; weights 4/2/1 make it a strict hierarchy):
  -- a row `platform.profile` already links beats one it does not, a real
  -- account beats this seed's own container, and a primary-address match beats
  -- an altEmail match. Two accounts tied after that are two people this file
  -- refuses to guess between.
  with "scored" as (
    select
      u."id",
      (case when exists (
         select 1 from "platform"."profile" p where p."userId" = u."id"
       ) then 0 else 4 end)
        + (case when u."id" = v_seeded_id then 2 else 0 end)
        + (case when lower(u."email") = lower(v_email) then 0 else 1 end)
        as "score"
    from "auth"."users" u
    where lower(u."email") = lower(v_email)
       or lower(u."email") = any (
            select lower("e") from unnest(v_alt_emails) as "e"
          )
  ), "best" as (
    select "id" from "scored"
    where "score" = (select min("score") from "scored")
  )
  select count(*), (array_agg("id"))[1] into v_matches, v_user from "best";

  if v_matches > 1 then
    raise exception
      'supabase/seed/officers/armani-peacox.sql: ambiguous account match for % '
      '(checked %, alt emails: %). The primary/altEmail addresses match more '
      'than one distinct auth.users row, and this seed refuses to guess which '
      'one is theirs. Merge the duplicate accounts or correct the seeded '
      'email/altEmails, then replay.',
      v_slug, v_email, array_to_string(v_alt_emails, ', ');
  end if;

  -- Insert only: an existing profile is left exactly as its owner has it.
  insert into "platform"."profile" (
    "userId", "preferredName", "ugaEmail", "legalFirstName", "legalLastName",
    "roleDescription",
    "graduationYear", "graduationSemester", "pronouns",
    "showGithub", "showLinkedin",
    "involvementFirstName", "involvementLastName", "involvementImportedAt"
  ) values (
    v_user, 'Armani Peacox', v_email, 'Ashlee', 'Peacox',
    'Armani is a Computer Science and Interdisciplinary Art student at the University of Georgia with a passion for game development. She serves on the Campus Engagement Team for UGA''s DevDogs chapter and is actively involved in TheHackPack, Girls Who Code, and the Powerlifting & Bodybuilding Club. Her interests include gameplay programming, game design, virtual and augmented reality, human-computer interaction, and digital art.',
    null, null, array['she', 'her']::text[],
    false, false,
    'Armani', 'Peacox', now()
  )
  on conflict ("userId") do nothing;

  -- Academic programs, by UGA Bulletin id. The catalogue is reference data the
  -- daily scrape owns; these rows only make sure the ids this officer selects
  -- exist, and the scrape refreshes every field from the source.
  insert into "platform"."academicPrograms"
    ("id", "name", "credential", "category", "schoolCode", "bulletinUrl", "lastSeenAt")
  values
    (73962, 'Computer Science', 'BS', 'undergraduate_major', 'ARTS',
    'https://bulletin.uga.edu/Program/Details/73962?IDc=ARTS', now()),
    (86044, 'Art: Interdisciplinary Art', 'AB', 'undergraduate_major', 'ARTS',
    'https://bulletin.uga.edu/Program/Details/86044?IDc=ARTS', now()),
    (62630, 'Undergraduate Certificate in New Media', 'CERT-UG',
    'undergraduate_certificate', 'JOUR',
    'https://bulletin.uga.edu/Program/Details/62630?IDc=JOUR', now())
  on conflict ("id") do nothing;

  insert into "platform"."profileAcademicPrograms"
    ("userId", "programId", "sortOrder")
  values
    (v_user, 73962, 0),
    (v_user, 86044, 1),
    (v_user, 62630, 2)
  on conflict do nothing;

  insert into "platform"."userRoles" ("userId", "roleId")
  select v_user, r."id"
  from "platform"."roles" r
  where r."title" in ('Campus Engagement Team')
  on conflict do nothing;
end $$;

commit;
