-- The Devpost sync's job row and daily heartbeat. The platform's daily-jobs
-- check treats a missing heartbeat row as overdue, so the row exists before the
-- check starts looking for it (apps/platform/src/server/heartbeats/jobs.ts).
-- The sync writes it itself, in the transaction that completes a clean cycle.
-- The job row is also in the platform seed; inserting it here as well means the
-- sync does not depend on the seed having run.
insert into platform."projectSyncJobs" ("job") values ('devpost-sync') on conflict do nothing;
insert into platform."jobHeartbeats" ("job") values ('platform-devpost-sync') on conflict do nothing;
