-- GitHub leaderboard: platform."leaderboardProfiles" and platform."points".
--
-- The one thing to know: both tables are shut to every client role, and the
-- eight restrictive policies at the bottom are the entire lock. The default
-- privileges in the first migration granted ALL on every platform table to
-- anon, authenticated and service_role, so without these policies both tables
-- would be world-readable over PostgREST. Each policy is `as restrictive`,
-- `to public`, with a `false` predicate: a restrictive rule that can never
-- pass, applied to every role including ones that do not exist yet. Turn any
-- one of them permissive, or narrow `to public` to a role list, and that
-- command opens up.
--
-- The writer is the server's own connection: DB_URL, through drizzle, as the
-- `postgres` role, which bypasses RLS. Denying all four commands to every
-- client role therefore costs the application nothing.
--
-- What actually writes here today is one statement: the GitHub OAuth callback
-- upserts a "leaderboardProfiles" row at link time so the platform knows which
-- GitHub account belongs to which member. The point columns on both tables
-- were fed by `syncLeaderboard`, removed 2026-08 along with the GitHub-issue
-- leaderboard, and platform."points" has had no writer since. The mapping is
-- kept because it is only knowable at link time and cannot be rebuilt later.
--
-- Not the competition points system. That is platform."memberPoints" and
-- "competitionStandings", fed by the election tally, in the election-results
-- file. Same word, unrelated tables.
--
-- Nothing in the rest of the migration set touches either table, so this file
-- is a leaf: its only ordering requirement is that the schema and its default
-- privileges already exist.

create table "platform"."leaderboardProfiles" (
  -- GitHub's numeric account id, kept as text. It is the key instead of the
  -- login because a login can be renamed and the id cannot, so a member who
  -- renames their GitHub account keeps their row rather than growing a second.
  "githubId"           character varying(255) primary key,
  "githubLogin"        character varying(255) not null unique,
  "avatarUrl"          text,
  "allTimePoints"      integer not null default 0,
  "allTimeRanking"     integer,
  "currentYearPoints"  integer not null default 0,
  "currentYearRanking" integer
);

-- A second uniqueness rule, not a duplicate of "leaderboardProfiles_githubLogin_key".
-- That constraint forbids two rows spelled identically; this index forbids two
-- rows that differ only in case, which is the rule GitHub itself enforces on
-- logins. It is a bare index with no backing constraint, so it cannot be named
-- as an `on conflict` target. Dropping it as redundant would let `octocat` and
-- `OctoCat` both exist and point at different members.
create unique index "login_idx"
  on "platform"."leaderboardProfiles" (lower(("githubLogin")::text));

alter table "platform"."leaderboardProfiles" enable row level security;

-- The yearly breakdown behind a profile's running totals: the key is
-- ("leaderboardProfileId", "year"), so one row per member per year.
create table "platform"."points" (
  "leaderboardProfileId" character varying(255) not null,
  "year"                 integer not null,
  "streakStart"          date not null,
  "streakLength"         integer not null default 0,
  "longestStreakLength"  integer not null default 0,
  "projectPoints"        integer not null default 0,
  "streakBonusPoints"    integer not null default 0,
  "academyPoints"        integer not null default 0,
  -- Generated and stored, so the total is read but never written. Three
  -- separately earned buckets and one sum stored as a plain column would drift
  -- the first time a backfill updated one without the other.
  "points"               integer not null generated always as (("projectPoints" + "streakBonusPoints") + "academyPoints") stored,

  constraint "points_pkey" primary key ("leaderboardProfileId", "year"),

  -- The name is spelled out because it is not the one Postgres would generate,
  -- and packages/supabase's generated types quote it verbatim as a
  -- `foreignKeyName`, so a rename lands in typed client code. The original
  -- added this FK `not valid` and then validated it, which matters only
  -- against a populated table; created empty, the one-step form here produces
  -- the identical constraint.
  constraint "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey"
    foreign key ("leaderboardProfileId")
    references "platform"."leaderboardProfiles" ("githubId")
    on update cascade on delete cascade
);

alter table "platform"."points" enable row level security;

-- Total deny, both tables, all four commands.
--
-- These four names repeat across "leaderboardProfiles", "points",
-- "oauthRegistrations" and "oauthTestAccounts" for a total of sixteen
-- policies. Policy names are scoped per table, so that is legal and
-- deliberate; a pass that deduplicates by name deletes live policies.
--
-- Split per command rather than written as one `for all using (false)`. Here
-- the deny is total either way, so the split is the shape the rest of the
-- repo uses rather than a load-bearing choice: elsewhere a `for all` policy
-- with only a USING clause silently governs SELECT too, and writing the
-- commands out separately is what stops that surprise.
create policy "crud_public_policy_delete"
  on "platform"."leaderboardProfiles"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."leaderboardProfiles"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."leaderboardProfiles"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."leaderboardProfiles"
  as restrictive
  for update
  to public
using (false)
with check (false);

create policy "crud_public_policy_delete"
  on "platform"."points"
  as restrictive
  for delete
  to public
using (false);

create policy "crud_public_policy_insert"
  on "platform"."points"
  as restrictive
  for insert
  to public
with check (false);

create policy "crud_public_policy_select"
  on "platform"."points"
  as restrictive
  for select
  to public
using (false);

create policy "crud_public_policy_update"
  on "platform"."points"
  as restrictive
  for update
  to public
using (false)
with check (false);
