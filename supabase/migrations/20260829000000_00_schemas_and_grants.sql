-- Schemas and PostgREST grants
--
-- Creates the three app schemas (platform, schedule_builder, study_group_finder)
-- and nothing else: no table, view, enum, function or policy. The one thing to
-- know is that the `alter default privileges` blocks below are the only source
-- of table grants in this repo, and default privileges apply only to objects
-- created after them, by the same role. That is why this file runs first and
-- why the whole set has to run as one role.
--
--
-- Conventions for the rest of the set
--
-- The schema boundary is not the security boundary. All three schemas sit
-- behind one PostgREST endpoint and one anon key, so a client that can reach
-- one can reach all three. What keeps rows apart is RLS on every table, not the
-- schema a table lives in.
--
-- Only three things in the whole set grant table privileges explicitly: three
-- grants on the resolvedUserPermissions matview (dropping a matview takes its
-- ACL with it, so each rebuild had to re-issue them) and two column-level
-- grants, on platform.profile and platform.teams. Everything else inherits from
-- here. Hoist a CREATE TABLE above this file, or run part of the set as a
-- second role, and those tables come out with no client privileges at all:
-- PostgREST answers "permission denied for table" across the surface and the
-- migration log shows nothing wrong.
--
-- Because the defaults below hand INSERT, UPDATE and DELETE to anon and
-- authenticated, a table that should be written only by the server closes
-- writes with a restrictive policy per command: no_client_insert,
-- no_client_update, no_client_delete. Those stay three separate policies. A
-- single restrictive `for all using (false)` would also apply to SELECT and
-- would silently cancel the table's public read policy.
--
-- Policy names repeat across tables deliberately. no_client_insert appears on a
-- dozen tables, public_read on thirteen schedule_builder tables,
-- crud_public_policy_* on four more. A policy name is scoped to its table, so a
-- dedupe-by-name pass would delete live policies.
--
-- Every SECURITY DEFINER function is declared `set search_path = ''` and
-- schema-qualifies every name it touches, so a caller cannot shadow a table out
-- from under it. The last file in the set revokes EXECUTE on all platform
-- functions from PUBLIC; it is last because that revoke acts only on functions
-- that already exist. The `grant all on functions` below is what keeps anon,
-- authenticated and service_role working afterwards.


-- Platform app schema. Every table, view and enum the platform app owns lives
-- here (see the monorepo's schema-per-app model). Supabase pre-configures
-- grants only for `public`, so a new schema needs its own USAGE grant and its
-- own default privileges for the PostgREST roles. Without them PostgREST
-- returns permission errors for everything in the schema.

create schema if not exists platform;

grant usage on schema platform to anon, authenticated, service_role;

alter default privileges in schema platform
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema platform
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema platform
  grant all on functions to anon, authenticated, service_role;


-- Schedule Builder app schema.

create schema if not exists schedule_builder;

grant usage on schema schedule_builder to anon, authenticated, service_role;

alter default privileges in schema schedule_builder
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema schedule_builder
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema schedule_builder
  grant all on functions to anon, authenticated, service_role;


-- Study Group Finder app schema (Flutter). Tables are added as the app is
-- built; this reserves the schema with the same role grants.

create schema if not exists study_group_finder;

grant usage on schema study_group_finder to anon, authenticated, service_role;

alter default privileges in schema study_group_finder
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema study_group_finder
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema study_group_finder
  grant all on functions to anon, authenticated, service_role;
