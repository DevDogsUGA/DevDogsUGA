-- Remove the feedback system.
--
-- Feedback moves out of the platform entirely, to an Airtable form with
-- automations behind it. Nothing here is replaced: there is no successor table,
-- no successor RPC, and no migration path for the rows, because the only
-- writer was a dialog on devdogsuga.org and the console was the only reader.
--
-- The permission that guarded it, "canManageFeedback", is dropped in the next
-- migration rather than this one. It is a column on "roles" projected through
-- the resolvedUserPermissions materialized view, so removing it means rebuilding
-- that view and its refresh trigger -- a bigger and more delicate change than
-- anything below, and one worth being able to revert on its own.
--
-- Note what this migration does NOT need to clean up: every RLS policy that
-- referenced "canManageFeedback" was attached to one of the two tables dropped
-- here (feedbackTopics: manager_insert/update/delete; feedback:
-- own_or_manager_select, manager_update), so they go with their tables.

-- ============================================================
-- Functions
-- ============================================================

drop function if exists "platform".list_feedback_topics(text);

drop function if exists "platform".submit_feedback(
  text, "platform"."feedbackType", text, text, uuid,
  "platform"."feedbackSeverity", jsonb
);

-- ============================================================
-- Tables
-- ============================================================
--
-- "feedback" first: it holds the only foreign key into "feedbackTopics".

drop table if exists "platform"."feedback";
drop table if exists "platform"."feedbackTopics";

-- ============================================================
-- Types
-- ============================================================

drop type if exists "platform"."feedbackType";
drop type if exists "platform"."feedbackSeverity";
drop type if exists "platform"."feedbackStatus";

-- ============================================================
-- Storage -- deliberately NOT done here
-- ============================================================
--
-- The `feedback-attachments` bucket cannot be removed by a migration. Supabase
-- guards its storage tables with `protect_objects_delete` and
-- `protect_buckets_delete` triggers, which raise
--
--   Direct deletion from storage tables is not allowed. Use the Storage API
--   instead.
--
-- on any DELETE, including as `postgres`. Disabling those triggers to get
-- around it would be fighting a guard that exists for good reason, so the
-- bucket is removed in two other places instead:
--
--   * supabase/config.toml -- the [storage.buckets.feedback-attachments] block
--     is deleted in this same change. That is what stops it being recreated on
--     every `supabase start` / `db reset`, so local and CI instances simply
--     never have it again.
--   * production -- a one-time removal through the Storage API or the Supabase
--     dashboard, if anyone cares to. Nothing ever wrote
--     "feedback"."attachmentPaths", so the bucket is empty and leaving it
--     costs nothing but tidiness.
--
-- Recorded here rather than in a checklist somewhere because the config.toml
-- edit is invisible from the migration history, and this is where someone will
-- look when they wonder why the bucket is still on production.
