---
name: Meetings & Teams
description: The shape of club participation — meetings, workshops, git-native competitions, and git-native teams — and why none of the three hang off each other any more.
order: 1
section: guides
---

# Meetings & Teams

DevDogs meets weekly. Each meeting runs one or more **workshops** in parallel, one per project. A workshop usually ends by announcing a feature; an officer turns that into a **competition** by hand, on GitHub, and the platform mirrors it — there is no schedule relationship between a workshop and the competition it announces any more. Read this page before touching anything that reads `platform.meetings`, `workshops`, `competitions` or `teams`. If you only need a function signature, skip to `server/teams/` source instead.

**Not every workshop opens a competition.** A supplementary workshop is complete on its own, and announcing a competition off one is an officer's manual GitHub action rather than anything the schema tracks between the two rows.

## Four rows, each answering one question

| Row            | Answers                                                             |
| -------------- | ------------------------------------------------------------------- |
| `meetings`     | when and where the club gathered, and who showed up                 |
| `workshops`    | the teaching slot for one project recommendation at one meeting     |
| `competitions` | a mirror of a GitHub issue -- see [Competitions](./competitions.md) |
| `teams`        | a persistent project team -- see [Teams](./teams.md)                |

There is no `projects` table any more — a workshop's project is free text on the row (`workshops."project"`, e.g. "DogDays", nullable), not a foreign key. See [Events](../../infrastructure/events.md) for why.

Attendance attaches to the meeting with the workshop as a dimension, never to a competition — there is nothing in-person to attend about a GitHub issue.

**Neither teams nor competitions hang off a meeting or a workshop any more.** A team is a persistent git branch (`team/<slug>` off `main`) that can enter any number of competitions over its life, and a competition is a GitHub issue with its own asynchronous lifecycle — kicked off whenever an officer converts a draft, closed whenever they close the issue, on no fixed night. See [Teams](./teams.md) and [Competitions](./competitions.md) for the current models.

One constraint on `workshops` carries most of the remaining meaning: it declares `unique (id, "meetingId")` solely so attendance can declare a composite foreign key and have the database reject a row naming a workshop from another meeting.

## Where it lives

The meetings/workshops schema is `supabase/migrations/20260829040000_11_platform_events_core.sql`, amended in place for the config-as-code cutover: `meetings.countsTowardProgress` and `elEligible` merged into one `countsForCredit` flag, `meetings.surveyUrl` was added (and `configId` columns, since superseded by the authored slug), `workshops.projectId` and the `projects` table were dropped in favor of `workshops."project"` as free text. That same migration carries the competitions mirror now too -- see [Competitions](./competitions.md) for its shape. `20260829050100_16_platform_team_awards.sql` has `platform.competitionEntries` and the `memberStars` view.

The code is `apps/platform/src/server/` under `teams/`, `github/`, `config/` and `loaders/`. Scheduled passes are routes under `app/(api)/cron/`: the config reconcile (`/cron/config-reconcile`) and the nightly GitHub reconcile for teams and competitions (`/cron/github-reconcile`). `cloudflare/scheduled.ts` is the one file that maps every cron expression to its route, so read it rather than guessing a path from a schedule.

## Read next

- [Teams](./teams.md) — forming one, joining one, the two caps, the lead, and disbanding.
- [Competitions](./competitions.md) — the Competitions Project, kickoff, entries, and closing one out.
- [Attendance](./attendance.md) — the ledger and check-in.
- [Stars & streaks](./stars-and-awards.md) — what participation adds up to.
- [Events](../../infrastructure/events.md) — where meetings and workshops come from.

Scoring is off-platform (officer scores and live voting, run outside the site). The only per-competition state the platform persists is who won, and it is not a separate record at all — `platform.competitionEntries."mergedAt"` IS the answer, set the moment an officer merges the winning pull request — and the results page collapses to entrants plus that winner, if one has merged.

## Why it's like this

<details>
<summary>Why was the earlier <code>(event, track, stage)</code> shape wrong?</summary>

An earlier draft had one `sessions` table keyed `(event, track, stage)`, with `stage` being `workshop | hackathon`. It failed once the real timeline was described:

- `startsAt` and `endsAt` are meaningless on a competition row. There is nothing to check into.
- The competition star was defined as attendance on the hackathon session, which could never fire — nobody attends a week of async work.

The general shape of the error: **a table that mixes things you attend with things that merely have a duration.** Splitting them is what lets attendance key to something real, and it removed the discriminator entirely — there is no `eventStage` enum, which is the clearest sign the split was right. `competitions` went on to lose its schedule relationship to `meetings`/`workshops` ENTIRELY once the platform redesign's competitions step made it a GitHub issue mirror — see the note below.

</details>

<details>
<summary>Why did a competition stop being a week-long window a meeting opened and another judged?</summary>

Through the platform redesign's competitions step, a competition WAS a week-long window: `competitions."workshopId"` (unique — a workshop opened at most one) pointed at the meeting that announced the feature, and an authored `judgingStartsAt`/`judgingMeetingId` pair pointed at the meeting judging happened at, usually the following week's. That datetime used to be the authority for a roster lock and a star freeze too — `isLocked`, `lockState.ts`, and a five-minute cron that stamped `teams."competedAt"` once judging began.

All of it is gone. A team stopped being scoped to a competition earlier, in the teams-core step, which already made "this team's roster, locked against ONE competition's clock" unrepresentable — a team active on several competitions has no single clock to lock against. The competitions step finished the job: a competition is a GitHub issue now (see [Competitions](./competitions.md)), kicked off whenever an officer converts a draft and closed whenever they close the issue, neither pinned to a meeting. `plannedEndAt` is what is left of "when does this end" — display-only, authored on the GitHub Project's date field, never read by any lock or deadline logic — and `closedAt` (the issue's own close) is the one real clock: closing IS the only thing that ever ended a competition's entry window, roster lock or no roster lock.

</details>

<details>
<summary>Why is a workshop's project free text instead of its own table?</summary>

It used to be: `projects` was a table with a `displayName`, a `slug`, an `appId` linking it to `platform.apps` for moderation, and a `sortOrder` officers controlled. All of that was Airtable plumbing that outlived the reason it existed — the table was authored in Airtable like `meetings` and `workshops` were, and once those two moved to config-as-code the table had nothing left to justify a foreign key: a workshop names the body of work it recommends the same way an officer would say it out loud ("DogDays", "DogDays & DogPack"), and nothing else in the schema ever needed to join on it independently.

Dropping it removed a table, a foreign key, a sort column with no authoring surface (`projects."sortOrder"` had no UI that ever wrote it — see the schedule-builder rework notes for the general pattern of "a configuration point with no way to configure it"), and every `left join projects` in the loaders. A workshop's `title` still falls back to its `project` string exactly the way it used to fall back to the joined `displayName`; the fallback chain did not change, only what it is a join versus a column.

</details>
