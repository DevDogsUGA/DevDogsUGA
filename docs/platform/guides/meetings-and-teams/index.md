---
name: Meetings & Teams
description: The shape of club participation — meetings, workshops, week-long competitions, and teams — and why a competition is a row of its own rather than a stage of a workshop.
order: 1
---

# Meetings & Teams

DevDogs meets weekly. Each meeting runs one or more **workshops** in parallel, one per project. A workshop usually ends by announcing a feature, which opens a **competition**: teams then have most of a week to build it asynchronously, presenting and being judged at the _following_ meeting. Read this page before touching anything that reads `platform.meetings`, `workshops`, `competitions` or `teams`. If you only need a function signature, skip to the generated [`server/teams`](/docs/platform/reference/server/teams) reference instead.

The detail the model has to get right: a competition is not a room with a start time. It is a week-long window bracketed by two in-person moments belonging to two _different_ meetings, so a meeting straddles two competitions — it judges the one that opened last week and opens the next one.

```
Meeting 1 (Sep 3)        Meeting 2 (Sep 10)       Meeting 3 (Sep 17)
├─ workshop: SGF         ├─ judging: SGF comp     ├─ judging: Sched comp
│    opens competition ──┤                        │
│                        ├─ workshop: Scheduler ──┘
└──── teams build, async ┘
```

**Not every workshop opens a competition.** A supplementary workshop is complete on its own, and it is simply a `workshops` row with no `competitions` row — a structural fact rather than an inferred absence, which is what makes the one-star rule fall out with no special case anywhere.

## Four rows, each answering one question

| Row            | Answers                                                         |
| -------------- | --------------------------------------------------------------- |
| `meetings`     | when and where the club gathered, and who showed up             |
| `workshops`    | the teaching slot for one project recommendation at one meeting |
| `competitions` | the week of async work a workshop opened, and who won it        |
| `teams`        | who built it, and what they entered                             |

There is no `projects` table any more — a workshop's project is free text on the row (`workshops."project"`, e.g. "DogDays", nullable), not a foreign key. See [Config-as-code](/docs/platform/guides/meetings-and-teams/club-config) for why.

Attendance attaches to the meeting with the workshop as a dimension, never to the competition — there is nothing to attend in a week of async work. Teams hang off the competition, so a team belongs to exactly one week.

Three constraints carry most of the meaning:

- **`competitions."workshopId"` is unique.** A workshop opens at most one competition, and the pair is a foreign key rather than an inference from two rows sharing a meeting.
- **`competitions."judgingStartsAt"` is an authored datetime**, and it is the authority: the roster lock, the star freeze and the competition-closed check all read it. `judgingMeetingId` is a label column beside it, nullable and not written by the sync.
- **`workshops` carries `unique (id, "meetingId")`** solely so attendance can declare a composite foreign key and have the database reject a row naming a workshop from another meeting.

## Where it lives

The schema is `supabase/migrations/20260829040000_11_platform_events_core.sql` (meetings, workshops, competitions), amended in place for the config-as-code cutover: `meetings.countsTowardProgress` and `elEligible` merged into one `countsForCredit` flag, `meetings.configId`/`surveyUrl` and `workshops.configId` were added, `workshops.projectId` and the `projects` table were dropped in favor of `workshops."project"` as free text. `20260829050100_16_platform_team_awards.sql` has the `memberStars` view.

The code is `apps/platform/src/server/` under `teams/`, `airtable/`, `config/` and `loaders/`. Most scheduled passes are routes under `app/(api)/cron/`, including the config reconcile (`/cron/config-reconcile`) and the fifteen-minute Airtable pull (`/airtable/sync`, competitions and members only now). `cloudflare/scheduled.ts` is the one file that maps every cron expression to its route, so read it rather than guessing a path from a schedule.

## Read next

- [Teams](/docs/platform/guides/meetings-and-teams/teams) — forming one, joining one, the cap, the lead, and re-forming next week.
- [Attendance](/docs/platform/guides/meetings-and-teams/attendance) — the ledger and check-in.
- [Stars & awards](/docs/platform/guides/meetings-and-teams/stars-and-awards) — what participation adds up to.
- [Config-as-code](/docs/platform/guides/meetings-and-teams/club-config) — where meetings and workshops come from now.
- [Airtable sync](/docs/platform/guides/meetings-and-teams/airtable-sync) — where competitions, members and teams still come from.

Scoring is off-platform (officer scores and live voting, run outside the site). The only per-competition state the platform persists is who won — a `teamAwards` row with `category = 'winner'`, written by an officer through `awardTeam` — and the results page collapses to entrants plus that winner, if one has been recorded.

## Why it's like this

<details>
<summary>Why was the earlier <code>(event, track, stage)</code> shape wrong?</summary>

An earlier draft had one `sessions` table keyed `(event, track, stage)`, with `stage` being `workshop | hackathon`. It failed on three counts once the real timeline was described:

- `startsAt` and `endsAt` are meaningless on a competition row. There is nothing to check into.
- The competition star was defined as attendance on the hackathon session, which could never fire — nobody attends a week of async work.
- `unique (eventId, trackId, stage)` assumed both stages lived inside one event, but the workshop is at meeting _N_ and the judging at meeting _N+1_.

The general shape of the error: **a table that mixes things you attend with things that merely have a duration.** Splitting them is what lets attendance key to something real, and it removed the discriminator entirely — there is no `eventStage` enum, which is the clearest sign the split was right.

</details>

<details>
<summary>Why does judging carry its own datetime instead of the meeting's?</summary>

Presentations are their own occasion. They happen at a meeting, but they are not the meeting, and the two start at different moments whenever anything else is on the agenda first.

- **Two competitions judged at one meeting can be judged at different times** — study group finder at 18:00, scheduler at 18:40. Deriving from the meeting would give both the same instant and lock both rosters at once.
- **Judging need not be at a workshop meeting at all.** A dedicated presentations night is a `meetings` row with no workshops and a competition pointing at it.
- **The lock predicate reads one row** rather than joining `teams → competitions → meetings`. `isLocked` is evaluated on every join attempt and every team page render.

> [!WARNING]
> The freeze query does **not** use that predicate. `freezeParticipation` spells its filter out in SQL — `submissionState = 'open'` and `judgingStartsAt <= now()` — and so ignores the predicate's third term, `lockedManuallyAt`. A manually locked roster is still frozen by the pass. `lockState.ts` exports `lockedSql()` and `teamLockFilter()` for exactly this case and **nothing calls either of them**, so the two spellings can drift without anything failing.

A null `judgingStartsAt` means "not scheduled yet", and everything downstream treats it as _not yet_ rather than _never_: the roster stays open, the freeze skips the competition, and no star is awarded.

</details>

<details>
<summary>Why is a workshop's project free text instead of its own table?</summary>

It used to be: `projects` was a table with a `displayName`, a `slug`, an `appId` linking it to `platform.apps` for moderation, and a `sortOrder` officers controlled. All of that was Airtable plumbing that outlived the reason it existed — the table was authored in Airtable like `meetings` and `workshops` were, and once those two moved to config-as-code the table had nothing left to justify a foreign key: a workshop names the body of work it recommends the same way an officer would say it out loud ("DogDays", "DogDays & DogPack"), and nothing else in the schema ever needed to join on it independently.

Dropping it removed a table, a foreign key, a sort column with no authoring surface (`projects."sortOrder"` had no UI that ever wrote it — see the schedule-builder rework notes for the general pattern of "a configuration point with no way to configure it"), and every `left join projects` in the loaders. A workshop's `title` still falls back to its `project` string exactly the way it used to fall back to the joined `displayName`; the fallback chain did not change, only what it is a join versus a column.

</details>
