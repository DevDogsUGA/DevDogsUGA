-- Demote this instance to a development tier.
--
-- "platform"."instance"."environment" defaults to 'production' so that a fresh
-- database fails closed (see 20260729000000_platform_instance_gate.sql). Seeds
-- run on `supabase db reset`, which is only ever pointed at a local stack or a
-- contributor's own throwaway project -- never at production -- so this is the
-- one place where flipping the gate open is unambiguously safe.
--
-- For a remote test project, where `db push` applies migrations without running
-- seeds, use `pnpm --filter @devdogsuga/sb set-environment test` instead.

update "platform"."instance" set "environment" = 'local' where "id";
