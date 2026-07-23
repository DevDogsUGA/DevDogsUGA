-- Platform app schema. Every table/view/enum the platform app owns lives in
-- the `platform` schema (see the monorepo's schema-per-app model). Supabase
-- only pre-configures grants for `public`, so a new schema needs its own
-- USAGE grant + default privileges for the PostgREST roles — without this,
-- PostgREST returns permission errors for everything in the schema.
--
-- Data isolation is enforced by RLS on each table, NOT by the schema boundary
-- (all schemas share one PostgREST endpoint + anon key).

create schema if not exists platform;

grant usage on schema platform to anon, authenticated, service_role;

alter default privileges in schema platform
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema platform
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema platform
  grant all on functions to anon, authenticated, service_role;
