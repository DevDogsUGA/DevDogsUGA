-- When each daily background job last succeeded.
--
-- Sentry bills every active Crons monitor as a seat, and the plan covers one.
-- The fifteen-minute platform cron keeps it ("platform-cron-config-reconcile").
-- The daily jobs used to have monitors of their own; now each one writes its
-- row here when a run succeeds, and the fifteen-minute cron's
-- /cron/heartbeats route fails, and so errors that one monitor, when a row is
-- older than its job's allowance. A job that never runs, or keeps failing,
-- still alerts, through a monitor it does not own.
--
-- "job" is the old monitor slug, so the history in Sentry still reads under
-- the same name:
--   platform-nightly-repair  the platform's 00:00 UTC cron group
--   schedule-builder-scrape  the schedule-builder's 14:05 UTC ScrapeWorkflow
--
-- Both rows are seeded at migrate time, so the first check after the deploy
-- that brings this in has something to compare against and gives each job a
-- full allowance before it can report it overdue.
--
-- Server-only: RLS on, closed on every verb, reached through the owner
-- connection like "configReconcileState". The schedule-builder writes its row
-- over that same connection (both Workers share one Hyperdrive config).

create table "platform"."jobHeartbeats" (
  "job" text not null,
  "succeededAt" timestamptz not null default now(),

  constraint "jobHeartbeats_pkey" primary key ("job")
);

alter table "platform"."jobHeartbeats" enable row level security;

create policy "crud_public_policy_delete" on "platform"."jobHeartbeats"
  as restrictive for delete to public using (false);
create policy "crud_public_policy_insert" on "platform"."jobHeartbeats"
  as restrictive for insert to public with check (false);
create policy "crud_public_policy_select" on "platform"."jobHeartbeats"
  as restrictive for select to public using (false);
create policy "crud_public_policy_update" on "platform"."jobHeartbeats"
  as restrictive for update to public using (false) with check (false);

insert into "platform"."jobHeartbeats" ("job") values
  ('platform-nightly-repair'),
  ('schedule-builder-scrape');
