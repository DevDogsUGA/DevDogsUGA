-- Two fixes to rows that hang off a member account.
--
-- 1. Deleting a member who has reflections failed.
--
-- The cascade was already declared end to end: auth.users -> reflections
-- (cascade) -> reflectionRevisions (cascade). Two guards on the way down
-- refused it:
--
--   * `reflectionRevisions_append_only` rejects every DELETE, including the
--     one the cascade issues once the parent reflection is gone.
--   * auditEvents' before/after revision FKs are `on delete restrict`, so a
--     revision an audit event points at could never go at all.
--
-- The member's reflections and their history should go with the account;
-- the audit log should not. So:
--
--   * A revision may be deleted only once its reflection no longer exists --
--     which is exactly the cascade, and never a direct delete.
--   * The audit FKs become `on delete set null`. The event survives (its
--     metadata carries ids only, never reflection text), and loses only the
--     pointer to content that no longer exists.
--   * `auditEvents_append_only` permits exactly that update: nothing changes
--     but a revision pointer going null, and only for a revision that is
--     already gone. Every other update or delete is still refused.
--
-- 2. A member could hold only one test account.
--
-- "oauthTestAccounts_ownerUserId_key" (migration 04) capped every member at
-- one, while /tools/oauth offers up to five (MAX_TEST_ACCOUNTS): the second
-- insert hit the constraint and the action deleted the user it had just
-- created. Migration 32 dropped the matching one-client-per-member
-- constraint and missed this one. The app's cap is the intended one.

create or replace function "platform".reject_reflection_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from "platform"."reflections" r where r."id" = old."reflectionId"
  ) then
    return old;
  end if;

  raise exception 'reflection revisions are append-only' using errcode = '55000';
end;
$$;

create or replace function "platform".reject_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'beforeReflectionRevisionId' - 'afterReflectionRevisionId')
      = (to_jsonb(old) - 'beforeReflectionRevisionId' - 'afterReflectionRevisionId')
    and (
      new."beforeReflectionRevisionId" is not distinct from old."beforeReflectionRevisionId"
      or (
        new."beforeReflectionRevisionId" is null
        and not exists (
          select 1 from "platform"."reflectionRevisions" v
           where v."id" = old."beforeReflectionRevisionId"
        )
      )
    )
    and (
      new."afterReflectionRevisionId" is not distinct from old."afterReflectionRevisionId"
      or (
        new."afterReflectionRevisionId" is null
        and not exists (
          select 1 from "platform"."reflectionRevisions" v
           where v."id" = old."afterReflectionRevisionId"
        )
      )
    )
  then
    return new;
  end if;

  raise exception 'audit events are append-only' using errcode = '55000';
end;
$$;

alter table "platform"."auditEvents"
  drop constraint "auditEvents_beforeReflectionRevisionId_fkey",
  add constraint "auditEvents_beforeReflectionRevisionId_fkey"
    foreign key ("beforeReflectionRevisionId")
    references "platform"."reflectionRevisions"("id") on delete set null,
  drop constraint "auditEvents_afterReflectionRevisionId_fkey",
  add constraint "auditEvents_afterReflectionRevisionId_fkey"
    foreign key ("afterReflectionRevisionId")
    references "platform"."reflectionRevisions"("id") on delete set null;

alter table "platform"."oauthTestAccounts"
  drop constraint "oauthTestAccounts_ownerUserId_key";

create index "oauthTestAccounts_ownerUserId_idx"
  on "platform"."oauthTestAccounts" ("ownerUserId");
