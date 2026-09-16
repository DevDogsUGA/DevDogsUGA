---
name: Stars & Streaks
description: How authoritative meeting attendance and competition participation become the member passport and weekly streaks.
order: 4
---

# Stars & streaks

Stars are a derived participation passport. Nothing increments a stored score:
the `platform.memberStars` view reads current attendance and competition facts,
so corrections are visible on the next read without a backfill.

## Stars

- One star is earned for each meeting whose `Counts toward progress` flag is
  enabled and whose attendance has not been revoked.
- One star is earned for each DevDogs competition with that flag enabled when
  the member belongs to a participating team.
- A competition win decorates its competition star; it is not another star.

Competition participation is normally frozen at judging from a registered
team with an entry. `participationOverride` is the durable officer exception.
A grant can cover a missing entry; a revoke can remove otherwise-derived
participation; clearing returns the team to the normal rule.

## Streaks

Weeks begin Monday in `America/New_York`. A qualifying week requires two stars,
or every available star when the club scheduled only one eligible opportunity.
Weeks with no eligible opportunities do not break a streak, and an unfinished
current week receives grace until its opportunities have passed.

Competitions are bucketed by the start of their opening meeting, not by the
Monday on which judging closes. This prevents a competition closing during the
next workshop from being credited to the wrong streak week.

The Attendance page shows lifetime meeting/competition volume, current and
longest streaks, this week's progress, and the full passport.

## Corrections and history

Revoked attendance disappears from stars and streaks without deleting its
ledger row. Competition overrides behave the same way. Each officer correction
is an Airtable form command and a permanent audit event, so the current display
and its history remain separate concerns.
