-- Remove the check-in code system.
--
-- Codes existed to distinguish concurrent rooms: a short rotating string shown
-- at the front of each workshop, redeemed on the platform, resolving to a
-- (meeting, workshop) pair. The Airtable form supersedes all of it -- the
-- member picks the workshop from a linked-record field, which is the same
-- disambiguation without anybody having to read a screen and type.
--
-- Three paths remain: the form, an officer adding somebody by hand, and the
-- Discord command the design note describes but nothing has built yet.
--
-- > **Verified before writing this**: `platform."checkInCodes"` holds 0 rows and
-- > `platform.attendance` holds 0 rows with `method = 'code'`, on the linked
-- > project as well as locally. Nothing here rewrites history, because there is
-- > no history to rewrite. Had there been any, the enum value would have stayed
-- > -- attendance is a ledger, and a row saying how somebody was counted must
-- > not be edited to say something else.

drop table if exists "platform"."checkInCodes";

-- ============================================================
-- 'code' leaves the enum
-- ============================================================
--
-- Postgres has no `alter type ... drop value`, so the type is rebuilt. Worth
-- the ceremony rather than leaving a value nothing can produce: an enum is a
-- claim about what the column may contain, and one listing a capability that
-- no longer exists sends the next reader looking for the code path that writes
-- it.
--
-- The check constraint has to come off first. It names the column being
-- retyped, and Postgres will not rewrite a constraint's expression underneath
-- an `alter column ... type`.
alter table "platform"."attendance"
  drop constraint "attendance_recordedBy_only_for_officer";

alter table "platform"."attendance"
  alter column "method" type text using "method"::text;

drop type "platform"."checkInMethod";

create type "platform"."checkInMethod" as enum ('discord', 'officer', 'airtable');

alter table "platform"."attendance"
  alter column "method" type "platform"."checkInMethod"
  using "method"::"platform"."checkInMethod";

-- Unchanged in meaning: 'officer' is still the only method somebody else can
-- record on your behalf, so a row naming a recorder under any other method is
-- still lying about how the member was counted.
alter table "platform"."attendance"
  add constraint "attendance_recordedBy_only_for_officer"
  check ("recordedBy" is null or "method" = 'officer');
