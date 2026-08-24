---
name: Stars & Awards
description: How participation becomes stars — two rules over a view that is never stored, at most two stars per meeting, and the awards table whose winner row is computed by the tally.
order: 4
---

# Stars & Awards

Stars are the club's participation display, following Advent of Code: a workshop that opened a competition is worth two, a supplementary workshop is worth one. There is no `stars` column anywhere — they are a view, recomputed on every read. Read this before changing `memberStars`, the star loaders, or anything that writes `teamAwards`. For the exported reader functions, see the generated [`server/export`](/docs/platform/reference/server/export) reference.

## The two rules

`platform."memberStars"` (migration `20260803000004_platform_team_awards.sql`) folds participation facts down per `(user, workshop)`:

| Star            | Earned when                                                                             |
| --------------- | --------------------------------------------------------------------------------------- |
| **Workshop**    | an attendance row for that workshop, **or** the competition star below                   |
| **Competition** | on a team whose `competedAt` is set — it had a live entry when judging began              |

Three things fall out, and all three are requirements rather than accidents:

- **Competing earns both stars.** Somebody who misses the workshop but builds and submits is not penalised; attending is never a prerequisite for competing.
- **A supplementary workshop can only ever yield one star**, because it has no competition row, so the second rule can never fire.
- **The competition star reads `competedAt`, not attendance.** There is nothing to attend in a week of async work, and joining a team then disappearing is not participation.

The last of those has a consequence worth stating plainly: **the competition star is a team-level outcome, awarded to every member of the roster.** A team that competed earns it for everybody, including someone who contributed little; a team that did not earns it for nobody, including someone who worked hard alone. Distinguishing further would mean judging individual contribution, which the platform should not attempt.

Deriving rather than storing is what makes officer corrections work: an added attendance row changes the stars on the next read, with no backfill job, no counter to repair, and no way for two copies to disagree. The view is `security_invoker = on`, which is load-bearing rather than boilerplate — without it the view runs as its owner and hands every caller the whole attendance ledger, straight past the own-rows-only policy underneath.

## A meeting is not worth a fixed two stars

Within one meeting only one workshop is attendable — they run concurrently — so a meeting yields at most two stars per member, and the second only when that member's workshop opened a competition they went on to compete in. A member who attends two meetings and competes once has three stars across those weeks.

Reads go through `server/loaders/stars.ts` — see [`server/loaders`](/docs/platform/reference/server/loaders) — and the display cannot assume a fixed pair per row. Group by meeting, render one cluster per workshop the member attended, and let the cluster size follow from whether that workshop opened a competition. **Winning is a state of the competition star, not a third star** — the visual grammar is built on stars being identical units, and a distinct fill says "this team won" without adding a column.

## Awards

`platform."teamAwards"` records what a team was given: a `category`, an optional one-line `citation` saying why, and `mergedPrUrl`. A partial unique index allows exactly one `winner` per competition while leaving side awards unconstrained — several teams can share an honourable mention. Named awards are authored through `awardTeam`, which stamps the caller into `awardedBy` and is gated on the same permission as roster edits.

- **The `winner` row is computed, not authored.** The election tally writes it for the team that finished first on the 1000-point total, so `awardedBy` is nullable and null means "computed". Every other candidate value would have been a lie: a sentinel user, the team's own id, or whichever officer happened to trigger the cron. See [Elections](/docs/platform/guides/elections).
- **`category` is text rather than an enum**, precisely because the set changes — an enum would make inventing "best design" a migration.
- **`mergedPrUrl` is not `teams."submissionUrl"`.** The submission is the team's PR against the competition's integration branch; `mergedPrUrl` is the PR that merged the winner up to `main`. Two URLs, kept apart so a display can link the entry or the merge without guessing which it has.

Because a competition is already `(meeting, project)` through its workshop, the winner row _is_ the answer to "which team built which feature" — a better artifact than a points column.

## The export

`stars.csv` is one row per `(member, workshop)` across every semester, streamed rather than buffered from `/export/stars`. It survived when the per-meeting attendance export was cut, because stars are derived: pushing them into Airtable would mean re-pushing the whole participation matrix every time an officer fixed one attendance row, and their value is cross-meeting, which is the shape Airtable is worst at.

The column order is the contract and is **append-only** — new fields go at the end, existing ones are never reordered or renamed, and the failure mode of getting that wrong is not an error but a spreadsheet whose every value is in the wrong column. Fields are quoted only when RFC 4180 requires it, lines end `\r\n`, and timestamps are ISO 8601 rather than bare local times. `STARS_COLUMNS` in [`server/export`](/docs/platform/reference/server/export) is the list itself.

The file carries every member's email, so it is gated on `canExportStars` — deliberately separate from `canEditAttendance` — and each download is audited **before** the stream starts, since a download that fails halfway still put rows in front of somebody.

## Why it's like this

<details>
<summary>Why does the view never read <code>submissionState</code>?</summary>

Because it would otherwise have to know that a closed PR after judging still counts and a closed PR before judging does not — a rule with no business being restated in SQL. `competedAt` carries that answer already: it is frozen once, by the judging-start pass, on teams whose entry was live at that moment, and never cleared.

That is the general rule the whole model follows. **Derive what is a question about now; store what is a question about a moment that has passed.** The lock is a question about the present, so it is computed from the PR state and the clock. "Did this team have a live entry when judging began" stops being answerable the instant the losing PRs are closed, so it is stored. Getting the two the wrong way round is the bug this split exists to prevent — a single `submittedAt` used for both would erase every losing team's star during the cleanup after judging.

One thing the same pass does afterwards is worth knowing here: it gives every attendee who joined no team a [team of one](/docs/platform/guides/meetings-and-teams/teams). Those are created after the freeze, so they carry no `competedAt` and earn no competition star — they exist so a surface keyed by team has somewhere to put a solo participant.

</details>

<details>
<summary>Why did this replace the GitHub-issue leaderboard?</summary>

The old leaderboard scored closed issues and was keyed on `leaderboardProfiles.githubId`. Attendance is keyed on `auth.users.id`, so every read would have had to resolve through `auth.identities`, and members who had not linked GitHub would silently score nothing. The new tables key on `auth.users.id` directly and the join disappears.

`syncLeaderboard` was removed in 2026-08, and the Discord `/leaderboard` command that read its points sits commented out in `server/discord/commands/leaderboard.ts`. The `leaderboardProfiles` row is still written when somebody links GitHub, because the identity mapping — which GitHub account belongs to which member — is only knowable at link time and whatever comes next will need it. Linking GitHub remains a hard requirement for competing, but for organisation access and PR attribution rather than for scoring.

</details>
