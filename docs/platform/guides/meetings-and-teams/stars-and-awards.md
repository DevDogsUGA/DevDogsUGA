---
name: Stars & Streaks
description: How authoritative meeting attendance and competition participation become the member passport and weekly streaks.
order: 4
---

# Stars & streaks

Stars are a derived participation passport. Nothing increments a stored score:
the `platform.memberStars` view reads current attendance and competition facts,
so changes are visible on the next read without a backfill.

## Stars

- One star is earned for each meeting whose `Counts toward progress` flag is
  enabled and that the member attended.
- One star is earned for each DevDogs competition with that flag enabled when
  the member belongs to a participating team.
- A competition win decorates its competition star; it is not another star.

> [!NOTE]
> The competition half is currently a STUB. The platform redesign's teams-core
> step made teams persistent and competition-independent, dropping
> `teams."competedAt"` and the column team participation used to freeze
> against — so `memberStars`' competition branch compiles but returns nothing,
> and every star this view currently produces is a meeting star. The
> platform redesign's competitions step rewires this to the competition-entry
> mirror: participation becomes "collaborator on a team-branch that entered
> before the competition's issue closed", derived from git and GitHub rather
> than frozen once by a cron pass.

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

## No overrides

There is no officer override or correction subsystem for attendance or
competition participation. A star is a fact derived straight from the
attendance ledger (and, once the competitions step lands, the competition-entry
mirror) — there is nothing to revoke and nowhere for an exception to live. A
late check-in is handled by re-displaying the rotating code, not by a
correction after the fact.
