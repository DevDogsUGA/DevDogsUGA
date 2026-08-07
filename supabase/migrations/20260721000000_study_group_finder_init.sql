-- Study Group Finder app schema (Flutter). Owns the `study_group_finder`
-- Postgres schema. Tables are added as the app is built; this reserves the
-- schema with the PostgREST-role grants Supabase only pre-configures for
-- public. Isolation is via RLS, not the schema boundary.

create schema if not exists study_group_finder;

grant usage on schema study_group_finder to anon, authenticated, service_role;

alter default privileges in schema study_group_finder
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema study_group_finder
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema study_group_finder
  grant all on functions to anon, authenticated, service_role;
