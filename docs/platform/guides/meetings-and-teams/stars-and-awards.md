---
name: Stars & Streaks
description: How authoritative meeting attendance becomes the member passport and weekly streaks.
order: 5
section: guides
---

# Stars & streaks

Stars are a derived participation passport. Nothing increments a stored score:
the `platform.memberStars` view reads current attendance facts, so changes are
visible on the next read without a backfill.

## Stars

- One star is earned for each meeting that links at least one reusable
  workshop and that the member attended — the same rule EL reflection
  eligibility reads (`platform.meeting_has_workshop`); see
  [Attendance](./attendance.md).

Competitions used to add a second kind of star (and a win decorated it). They
are retired; see [Meetings](./index.md#retired-teams-and-competitions). The
platform's code reads only the view's meeting rows, and the view's competition
branch leaves with the table drop.

## Streaks

Weeks begin Monday in `America/New_York`. A qualifying week requires two stars,
or every available star when the club scheduled only one eligible opportunity.
Weeks with no eligible opportunities do not break a streak, and an unfinished
current week receives grace until its opportunities have passed.

The Attendance page shows lifetime meeting stars, current and longest streaks,
this week's progress, and the full passport.

## No overrides

There is no officer override or correction subsystem for attendance. A star is
a fact derived straight from the attendance ledger — there is nothing to
revoke and nowhere for an exception to live. A late check-in is handled by
re-displaying the rotating code, not by a correction after the fact.
