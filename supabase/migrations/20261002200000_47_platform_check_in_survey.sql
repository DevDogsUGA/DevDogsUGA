-- The check-in survey: config-owned questions, members' answers, and their
-- immutable revisions.
--
-- Questions are authored in Backstage's `@devdogsuga/events`
-- (`questions.json`) and copied here by the config reconcile, the same way
-- meetings are; a meeting's `surveyQuestionIds` lists the meeting-scoped
-- questions it asks, in order. Member-scoped questions are asked at every
-- check-in and are never listed.
--
-- Answers are member-written, through the platform's survey action only.
-- Clients read their own; every write is server-side. Nothing here gates
-- attendance or credit: the survey follows a check-in that is already
-- recorded.

-- ============================================================
-- Questions
-- ============================================================

-- `definition` is the whole question as config states it (prompt, options,
-- limits), validated by the events package before it is written; the columns
-- beside it are what queries and constraints need. A question with answers
-- is never deleted or retyped: the reconcile refuses both, and `retiredAt`
-- is how config stops asking one.
create table "platform"."surveyQuestions" (
  "id"          text not null,
  "scope"       text not null,
  "type"        text not null,
  "definition"  jsonb not null,
  "retiredAt"   timestamptz,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),

  constraint "surveyQuestions_pkey" primary key ("id"),
  constraint "surveyQuestions_id_format"
    check ("id" ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'),
  constraint "surveyQuestions_scope_choices"
    check ("scope" in ('member', 'meeting')),
  constraint "surveyQuestions_type_choices"
    check ("type" in ('text', 'longText', 'choice', 'multiChoice', 'scale')),
  constraint "surveyQuestions_definition_size"
    check (pg_column_size("definition") <= 16384)
);

alter table "platform"."surveyQuestions" enable row level security;

create policy "public_select" on "platform"."surveyQuestions"
  as permissive for select to anon, authenticated using (true);
create policy "no_client_insert" on "platform"."surveyQuestions"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."surveyQuestions"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."surveyQuestions"
  as restrictive for delete to anon, authenticated using (false);

-- An array rather than a join table: the list is config's, rewritten whole by
-- each reconcile, and only ever read whole with its meeting.
alter table "platform"."meetings"
  add column "surveyQuestionIds" text[] not null default '{}';

-- ============================================================
-- Answers
-- ============================================================

-- One table for both scopes. A member question's answer has no meeting and
-- is one per person; a meeting question's is one per person per meeting.
-- Which scope a question is lives on the question, so the survey action, not
-- a constraint, keeps `meetingId` null exactly for member questions.
-- `answer` is the question type's JSON shape (events' `answerSchema`), with
-- choices stored by option id.
create table "platform"."surveyAnswers" (
  "id"          uuid not null default gen_random_uuid(),
  "userId"      uuid not null,
  "questionId"  text not null,
  "meetingId"   uuid,
  "answer"      jsonb not null,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),

  constraint "surveyAnswers_pkey" primary key ("id"),
  constraint "surveyAnswers_userId_fkey" foreign key ("userId")
    references auth."users"("id") on update cascade on delete cascade,
  constraint "surveyAnswers_questionId_fkey" foreign key ("questionId")
    references "platform"."surveyQuestions"("id") on update cascade on delete restrict,
  constraint "surveyAnswers_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete restrict,
  constraint "surveyAnswers_answer_size"
    check (pg_column_size("answer") <= 16384)
);

alter table "platform"."surveyAnswers" enable row level security;

create unique index "surveyAnswers_member_key"
  on "platform"."surveyAnswers" ("userId", "questionId")
  where "meetingId" is null;
create unique index "surveyAnswers_meeting_key"
  on "platform"."surveyAnswers" ("userId", "questionId", "meetingId")
  where "meetingId" is not null;
create index "surveyAnswers_meetingId_idx"
  on "platform"."surveyAnswers" ("meetingId")
  where "meetingId" is not null;
create index "surveyAnswers_questionId_idx"
  on "platform"."surveyAnswers" ("questionId");

create policy "own_select" on "platform"."surveyAnswers"
  as permissive for select to authenticated
  using ((select auth.uid()) = "userId");
create policy "no_client_insert" on "platform"."surveyAnswers"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."surveyAnswers"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."surveyAnswers"
  as restrictive for delete to anon, authenticated using (false);

-- Every save writes the answer as it now stands, so any past moment is
-- reconstructable: an export for a meeting reads a member answer as it stood
-- when that meeting ended, not as it was last edited. A null `answer` is a
-- member clearing one. Not tied to `surveyAnswers` by key, so clearing (which
-- deletes the answer row) keeps its history.
create table "platform"."surveyAnswerRevisions" (
  "id"          uuid not null default gen_random_uuid(),
  "userId"      uuid not null,
  "questionId"  text not null,
  "meetingId"   uuid,
  "answer"      jsonb,
  "recordedAt"  timestamptz not null default now(),

  constraint "surveyAnswerRevisions_pkey" primary key ("id"),
  constraint "surveyAnswerRevisions_userId_fkey" foreign key ("userId")
    references auth."users"("id") on update cascade on delete cascade,
  constraint "surveyAnswerRevisions_questionId_fkey" foreign key ("questionId")
    references "platform"."surveyQuestions"("id") on update cascade on delete restrict,
  constraint "surveyAnswerRevisions_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete restrict,
  constraint "surveyAnswerRevisions_answer_size"
    check ("answer" is null or pg_column_size("answer") <= 16384)
);

alter table "platform"."surveyAnswerRevisions" enable row level security;

create index "surveyAnswerRevisions_userId_questionId_idx"
  on "platform"."surveyAnswerRevisions" ("userId", "questionId", "recordedAt" desc);
create index "surveyAnswerRevisions_meetingId_idx"
  on "platform"."surveyAnswerRevisions" ("meetingId")
  where "meetingId" is not null;

create policy "own_or_auditor_select" on "platform"."surveyAnswerRevisions"
  as permissive for select to authenticated
  using (
    (select auth.uid()) = "userId"
    or "platform".has_permission((select auth.uid()), 'canViewAuditLog')
  );
create policy "no_client_insert" on "platform"."surveyAnswerRevisions"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."surveyAnswerRevisions"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."surveyAnswerRevisions"
  as restrictive for delete to anon, authenticated using (false);

-- Append-only to every path but one: deleting an account cascades here (the
-- `userId` foreign key's own trigger runs the delete, so `pg_trigger_depth()`
-- is above 1), and survey answers, unlike reflection evidence, go with the
-- person who gave them.
create or replace function "platform".reject_survey_answer_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'survey answer revisions are append-only' using errcode = '55000';
end;
$$;

create trigger "surveyAnswerRevisions_append_only"
  before update or delete on "platform"."surveyAnswerRevisions"
  for each row execute function "platform".reject_survey_answer_revision_mutation();
