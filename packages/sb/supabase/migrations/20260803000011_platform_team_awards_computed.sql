-- The winner award has no author.
--
-- `teamAwards."awardedBy"` was `not null`, which is right for the awards an
-- officer authors — an honourable mention is a judgement, and knowing whose it
-- was matters. But the design note is explicit that the `winner` row is
-- WRITTEN BY THE TALLY, not authored by anyone: it is the arithmetic, and
-- there is no officer to name.
--
-- Leaving the column not-null forces the tally to invent a value, and every
-- available candidate is a lie — a sentinel user, the team's own id, or
-- whichever officer happened to trigger the cron. Null is the honest
-- representation of "computed", and it is distinguishable from every real
-- author.
alter table "platform"."teamAwards"
  alter column "awardedBy" drop not null;

comment on column "platform"."teamAwards"."awardedBy" is
  'The officer who authored this award. Null means it was computed by the tally, which is the case for every category = ''winner'' row.';
