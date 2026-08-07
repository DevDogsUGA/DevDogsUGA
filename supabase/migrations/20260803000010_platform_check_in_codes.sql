-- Check-in codes.
--
-- The design note describes these ("codes are per workshop, not per meeting,
-- because that is the only thing that distinguishes concurrent rooms") but its
-- schema block never defines them, so this fills the gap.
--
-- A table rather than a `checkInCode` column on each of meetings and
-- workshops. `checkIn(code)` takes ONLY the code and resolves it, so codes
-- must be unique across both kinds — and two columns on two tables cannot
-- express that. Two independent unique constraints would let the same string
-- exist as both a workshop code and a meeting code, and the resolver would
-- silently pick whichever it looked at first, attributing attendance to the
-- wrong room. A primary key on `code` makes the collision impossible instead
-- of unlikely.
--
-- The table also gives rotation somewhere to live: rotating is inserting a new
-- row and deleting the old one, rather than overwriting a column and losing
-- the ability to keep a previous code alive through a grace period.
create table "platform"."checkInCodes" (
  "code"       text not null,
  "meetingId"  uuid not null,
  -- Null for a meeting-level code: a meeting with no workshops, or a member
  -- arriving only for judging, checks in without naming a room.
  "workshopId" uuid,
  "createdAt"  timestamptz not null default now(),
  -- Null means "valid until the meeting's own checkInClosesAt". A value here
  -- is what makes a code *rotating* — the previous one can stay redeemable for
  -- a grace period after the next is shown.
  "expiresAt"  timestamptz,

  constraint "checkInCodes_pkey" primary key ("code"),
  -- The same composite target attendance uses: a code cannot name a workshop
  -- belonging to some other meeting.
  constraint "checkInCodes_workshopId_meetingId_fkey"
    foreign key ("workshopId", "meetingId")
    references "platform"."workshops"("id", "meetingId")
    on update cascade on delete cascade,
  constraint "checkInCodes_meetingId_fkey" foreign key ("meetingId")
    references "platform"."meetings"("id") on update cascade on delete cascade
);

alter table "platform"."checkInCodes" enable row level security;

-- The officer console lists the live codes for a meeting.
create index "checkInCodes_meetingId_idx"
  on "platform"."checkInCodes" ("meetingId");

-- No permissive policy at all: a code is a bearer token for attendance, so
-- nothing reads this table from a browser. Redemption goes through the
-- check-in server action, which resolves the code as the owning role and
-- writes the attendance row itself.
create policy "no_client_insert" on "platform"."checkInCodes"
  as restrictive for insert to anon, authenticated with check (false);
create policy "no_client_update" on "platform"."checkInCodes"
  as restrictive for update to anon, authenticated using (false) with check (false);
create policy "no_client_delete" on "platform"."checkInCodes"
  as restrictive for delete to anon, authenticated using (false);
