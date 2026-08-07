-- Attendance capture moves to Airtable.
--
-- Workshops are run with an Airtable form -- attendance is collected alongside
-- the poll questions that get asked in the room anyway -- and co-branded events
-- arrive as a CSV from whichever club ran their own scheme. Both land in one
-- Airtable table, and the sync mirrors them into `platform.attendance`.
--
-- Postgres stays the thing the platform READS. It has to: `memberStars` is a
-- view over this table, `judgingPass` decides team eligibility from it, and
-- neither can depend on a vendor being reachable or on a fifteen-minute sync
-- being current. So this is a mirror, not a move -- Airtable is where a row is
-- CREATED, and here is where it is asked about.
--
-- Nothing about the existing shape changes. `unique ("meetingId", "userId")`
-- still means a member attends a meeting once however many workshops it holds,
-- and "workshopId" is still the dimension recording which room they sat in.

-- ============================================================
-- The new capture method
-- ============================================================
--
-- A fourth value rather than reusing 'officer'. The distinction is not
-- pedantry: "recordedBy" is constrained to be non-null only for 'officer', so
-- an Airtable row recorded as 'officer' would either lie about who typed it or
-- violate that check. It is also the honest answer to "how do we know they
-- were there" -- a form the member submitted themselves is a different claim
-- from an officer asserting it.
alter type "platform"."checkInMethod" add value if not exists 'airtable';

-- ============================================================
-- Traceability back to the record that produced the row
-- ============================================================
--
-- The Airtable record id, so a re-import updates the row it created rather than
-- colliding with it. The same reasoning as everywhere else in this sync:
-- identity is the record id, never a name or an email, because ids survive the
-- officer fixing a typo and emails do not.
--
-- Nullable, because rows created by the check-in code or by an officer have no
-- Airtable record behind them and never will.
alter table "platform"."attendance"
  add column "airtableRecordId" text;

comment on column "platform"."attendance"."airtableRecordId" is
  'The Airtable record this row was imported from. Null for rows created by check-in code or by an officer. Unique, so a re-import updates rather than duplicates.';

-- Partial, so the many null rows from the code and officer paths do not all
-- have to be distinct from each other.
create unique index "attendance_airtableRecordId_key"
  on "platform"."attendance" ("airtableRecordId")
  where "airtableRecordId" is not null;

-- ============================================================
-- Where a form-created account's identity may NOT go
-- ============================================================
--
-- A form asks for a MyID and nobody has checked it. That address becomes
-- `auth.users.email` -- it has to, since sign-in is Google restricted to
-- hd=uga.edu and the address is how a later sign-in finds this row -- but it
-- must NOT become `platform.profile."ugaEmail"`.
--
-- `profile_ugaEmail_key` is unique and the Involvement CSV import writes that
-- column for every roster member inside one transaction. If a mistyped MyID
-- were already sitting there under somebody else's account, the roster import
-- would raise a unique violation and abort -- one typo in a form would break
-- the import for the entire club.
--
-- So `ugaEmail` and `legal*` stay what migration 20260803000000 says they are:
-- durable identity, sourced from the roster, never from self-declaration. This
-- comment is the enforcement, because the rule is about WHO WRITES rather than
-- about a value, and no constraint can see the difference.
comment on index "platform"."profile_ugaEmail_key" is
  'Unique, and written only by the Involvement roster import. The Airtable attendance import deliberately leaves "ugaEmail" null on accounts it creates: a self-declared MyID landing here would make one typo abort the next roster import for everybody.';
