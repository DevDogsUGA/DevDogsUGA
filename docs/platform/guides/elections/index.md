---
name: Elections
description: What an election is for, the two electorates that cast ballots, how a ballot is presented and validated, and where the schema and tally live.
order: 1
---

# Elections

When a competition is judged, the competing implementations are ranked in one or more **award categories** — "best looking", "most useful", and so on. Each category is its own election, scored with a Borda count, and those results supply 400 of a competition's 1000 points. Read this before touching `platform.elections`, `ballots`, `ballotRankings`, or anything under `apps/platform/src/server/elections/`. If you only need a function signature, the generated [`server/elections`](/docs/platform/reference/server/elections) reference lists every export instead.

## Scope

An election belongs to a **competition** — the week of work one workshop opened, for one project. The teams competing in it are the candidates in every one of its elections, whoever is voting. Nothing crosses projects, and nothing crosses weeks.

Each election carries its own `opensAt` and `closesAt`. The only ordering the database enforces is `elections_closesAt_after_opensAt`. That **`closesAt` should fall before the competition's `judgingStartsAt`** is a convention nothing checks: the tally runs on a five-minute cron after `closesAt` and the winner is announced at judging, so a window that closes during the meeting announces a result nothing has computed yet.

## Two electorates

| Electorate   | Ballots                | Cast by                                    |
| ------------ | ---------------------- | ------------------------------------------ |
| **Teams**    | One per competing team | The team lead — `teamMembers.role = 'lead'` |
| **Officers** | Exactly one, total     | Any officer holding `canVoteAsOfficer`     |

Officers vote collectively: they agree on an ordering however they like and one of them submits it, so a category decided by officers is decided once rather than once per officer who happens to be in the room. Officers do not compete, so the two electorates are disjoint by construction and there is no recusal problem.

Mechanically an officer election is a ranking rather than an election — Borda over a single ballot returns that ballot's order unchanged. Routing it through the same machinery is what makes it scale anyway: a team ranked _r_ of _n_ on that one ballot scores _n−r_ against a ceiling of _n−1_, so the category's points spread evenly from full marks down to zero with no special case in the tally.

Two partial unique indexes hold the counts: `ballots_one_per_team_per_election` where `"teamId"` is not null, and `ballots_one_officer_ballot_per_election` where it is null. A `purpose = 'tiebreak'` election must be an officer one — see [Ties & privacy](/docs/platform/guides/elections/ties-and-privacy).

## Casting a ballot

- **The presented order is shuffled per voter**, seeded from the election id and the user id, so it is stable across reloads. The voter's own team is pinned first; an officer ballot shuffles completely.
- **An untouched form cannot be submitted.** The voter must reorder at least once or tick the confirmation, and `validateBallot` rejects `untouched` on the server too — the form is the half that can be skipped.
- **Rankings must be complete.** A missing, duplicated, or unrecognised team is rejected outright rather than interpreted.
- **A ballot is cast once.** A second submission loses to a unique index and comes back as `already_voted`; there is no revise path.
- **A voter's own team stays on their ballot.** Removing one entry from one voter's ballot would change what every other position on it is worth.

The ballot lists the teams in the competition that have a submission (`submissionState is not null`). Everyone voting in a competition sees the same list, in a different order.

## Where it lives

Migrations `20260803000007_platform_election_permissions.sql` through `20260803000009_platform_election_results.sql`. The arithmetic is `server/elections/tally.ts` — pure functions, no database — driven by `runTally.ts`; presentation and validation are `ballotOrder.ts`; the write is `server/actions/elections.ts`; reads are `server/loaders/elections.ts` and `loaders/points.ts`. The UI is `app/(site)/vote/` and `app/(site)/competitions/[slug]/results/`. `/cron/tally-elections` runs at `*/5 * * * *`, mapped in `apps/platform/cloudflare/scheduled.ts`.

## Read next

- [Scoring](/docs/platform/guides/elections/scoring) — the 1000-point split, the Borda arithmetic, and what happens when a block is absent.
- [Ties & privacy](/docs/platform/guides/elections/ties-and-privacy) — the three-step tiebreak, who may read a ballot, and what a tiebreak discloses.
- [Meetings & teams](/docs/platform/guides/meetings-and-teams) — competitions, teams, and the awards elections feed.

## Why it's like this

<details>
<summary>Why is <code>electorate</code> copied onto every ballot when the election already has it?</summary>

The rule is "a team ballot names a team, an officer ballot does not" — but _which kind_ a ballot is lives on the election, one table away, and a check constraint cannot read another table. Written against `ballots` alone the rule has nothing to test, which is how the obvious spelling ends up being a constraint that can never fail:

```sql
check (num_nonnulls("teamId") <= 1)   -- one argument, so always true
```

Copying `electorate` onto the ballot gives the check both halves of the comparison. The composite foreign key `ballots_electionId_electorate_fkey`, into `elections(id, electorate)` — which `elections_id_electorate_key` exists solely to back — keeps the copy honest: a ballot cannot claim an electorate its election does not have. Same move as `competitionId` on `teamMembers`.

`on update cascade` is deliberate. An electorate should not change once ballots exist, but if one is corrected before voting opens the ballots should follow rather than block the correction.

A trigger, or a check inside the action that casts a ballot, was the alternative and is weaker for the usual reason: it holds only as long as every write path remembers it, and a mis-typed ballot is invisible until the tally miscounts a category without complaining.

</details>
