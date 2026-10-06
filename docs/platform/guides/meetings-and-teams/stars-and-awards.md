---
name: Stars & Streaks
description: How authoritative meeting attendance and competition participation become the member passport and weekly streaks.
order: 5
section: guides
---

# Stars & streaks

Stars are a derived participation passport. Nothing increments a stored score:
the `platform.memberStars` view reads current attendance and competition facts,
so changes are visible on the next read without a backfill.

## Stars

- One star is earned for each meeting whose `countsForCredit` flag is
  enabled and that the member attended — the same flag EL reflection
  eligibility reads; see
  [Attendance](./attendance.md).
- One star is earned for each DevDogs competition the member's team
  participated in — every mirrored (converted) competition counts, no
  separate flag: being a real, kicked-off GitHub issue IS counting.
- A competition win decorates its competition star; it is not another star.

Participation is `platform.competitionEntries`: held an active membership on
the entering team (`teamMembers."joinedAt"`/`"leftAt"`) at the moment that
team's entry — a pull request linking the competition's issue — opened, and
the entry opened before the issue closed (or it is still open). One row per
entry pull request, and `memberStars` groups by (member, competition) so a
team that reopens an entry after the first PR closed still earns its members
exactly one star, not two.

`competitionEntries` is kept current by `server/github/prEvent.ts`'s
`pull_request` webhook handling (opened, edited, reopened, closed) and the
nightly `/cron/github-reconcile` backstop (`reconcileEntries`). Winning is
`competitionEntries."mergedAt" is not null` — merging the winning pull
request IS recording the winner, there is no separate officer step — see
[Competitions](./competitions.md).

## Streaks

Weeks begin Monday in `America/New_York`. A qualifying week requires two stars,
or every available star when the club scheduled only one eligible opportunity.
Weeks with no eligible opportunities do not break a streak, and an unfinished
current week receives grace until its opportunities have passed.

Competitions are bucketed by `kickedOffAt` — when the draft converted into an
issue — not by whenever the entry window happens to close. A competition has
no fixed night any more (see
[Competitions](./competitions.md)), so
kickoff is the one moment every competition star can anchor a streak week to.

The Attendance page shows lifetime meeting/competition volume, current and
longest streaks, this week's progress, and the full passport.

## No overrides

There is no officer override or correction subsystem for attendance or
competition participation. A star is a fact derived straight from the
attendance ledger and the competition-entry mirror — there is nothing to
revoke and nowhere for an exception to live. A late check-in is handled by
re-displaying the rotating code, not by a correction after the fact.
