-- The commit sync's daily heartbeat. The platform's daily-jobs check treats a
-- missing row as overdue, so the row exists before the check starts looking
-- for it (apps/platform/src/server/heartbeats/jobs.ts). The sync writes it
-- itself, in the transaction that completes a clean daily cycle.
insert into platform."jobHeartbeats" ("job") values ('platform-commit-sync') on conflict do nothing;
