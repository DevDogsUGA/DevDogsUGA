---
name: Backfilling badges
description: Awarding Workshop completed and First Commit for evidence that existed before the badge triggers - what it reads, what it skips on purpose, and how to run it safely.
order: 3
section: infrastructure
---

# Backfilling badges

Badges are awarded by database triggers when attendance, a reflection or a commit is written. Rows that existed before those triggers were added have no awards. `backstage import badges` awards them from the evidence that is reliable, using the same SQL functions the triggers call (`platform.sync_workshop_badge` and `platform.award_first_commit`), so the rules cannot drift.

Run it from a checkout with production credentials (`DB_URL` comes from `.env.production` or Secrets Manager):

```
pnpm backstage import badges --dry-run   # what would be awarded and skipped, per badge
pnpm backstage import badges             # previews, then asks (--yes answers without a terminal)
```

## What it awards

- **Workshop completed:** a member who has attendance at a live meeting and a submitted reflection for a workshop that meeting ran. A reflection with no workshop chosen (all of them from before the picker existed) counts only when the meeting ran exactly one workshop, which is what the reflection form defaults to; the command records that workshop on the reflection, and the trigger then runs the usual sync. A meeting that ran several workshops, or none, is **skipped and counted, never guessed**.
- **First Commit:** a member with a stored default-branch commit and no First Commit row. The platform's scheduled commit sync stores commits for linked members (and its own trigger awards the badge as they land), so this only catches evidence that predates the trigger.

## What it never does

- It never touches an officer-awarded badge or reopens a withdrawn one: a member or pair with any existing row, live or withdrawn, is reported as already held (for Workshop completed that is every row for the member and workshop).
- It never turns stars or commit counts into EL hours.
- Streaks and the weekly art are computed on read from attendance at workshop meetings and from stored commits, so there is nothing to backfill for them.

## Rerunning

It is idempotent: a second run finds everything held and changes nothing. Each real run writes one `badge.backfill` audit event with the counts awarded and skipped.

## Effect on EL evidence

Recording the single workshop onto an old reflection has a side effect: the EL hours evidence counts a reflection only when its workshop matches one the meeting ran, so those defaulted reflections now count as workshop evidence on `/dashboard/attendance` and in the officer EL export. No hours come from stars or commit counts. The edit writes no reflection revision; the `badge.backfill` audit event holds the counts.
