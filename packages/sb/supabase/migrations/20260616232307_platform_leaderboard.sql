create table "platform"."leaderboardProfiles" (
  "githubId" character varying(255) not null,
  "githubLogin" character varying(255) not null,
  "avatarUrl" text,
  "allTimePoints" integer not null default 0,
  "allTimeRanking" integer,
  "currentYearPoints" integer not null default 0,
  "currentYearRanking" integer
);

alter table "platform"."leaderboardProfiles" enable row level security;

create table "platform"."points" (
  "leaderboardProfileId" character varying(255) not null,
  "year" integer not null,
  "streakStart" date not null,
  "streakLength" integer not null default 0,
  "longestStreakLength" integer not null default 0,
  "projectPoints" integer not null default 0,
  "streakBonusPoints" integer not null default 0,
  "academyPoints" integer not null default 0,
  "points" integer not null generated always as ((("projectPoints" + "streakBonusPoints") + "academyPoints")) stored
);

alter table "platform"."points" enable row level security;


CREATE UNIQUE INDEX "leaderboardProfiles_pkey" ON platform."leaderboardProfiles" USING btree ("githubId");

CREATE UNIQUE INDEX "leaderboardProfiles_githubLogin_key" ON platform."leaderboardProfiles" USING btree ("githubLogin");

CREATE UNIQUE INDEX login_idx ON platform."leaderboardProfiles" USING btree (lower(("githubLogin")::text));

CREATE UNIQUE INDEX points_pkey ON platform.points USING btree ("leaderboardProfileId", year);


alter table "platform"."leaderboardProfiles" add constraint "leaderboardProfiles_pkey" PRIMARY KEY using index "leaderboardProfiles_pkey";

alter table "platform"."points" add constraint "points_pkey" PRIMARY KEY using index "points_pkey";

alter table "platform"."leaderboardProfiles" add constraint "leaderboardProfiles_githubLogin_key" UNIQUE using index "leaderboardProfiles_githubLogin_key";

alter table "platform"."points" add constraint "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey" FOREIGN KEY ("leaderboardProfileId") REFERENCES platform."leaderboardProfiles"("githubId") ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "platform"."points" validate constraint "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey";


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
