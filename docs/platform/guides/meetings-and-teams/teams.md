---
name: Teams
description: How a competition team forms — the one join path and its five checks, the size cap, invitations and join requests as one table, the lead, re-forming a roster for the next week, and the teams of one the judging pass creates by itself.
order: 2
---

# Teams

A team belongs to exactly one competition, and a member to at most one team _per_ competition. Read this before changing `server/actions/teams.ts` or `server/teams/`; for signatures alone, use the generated [`server/teams`](/docs/platform/reference/server/teams) and [Server Actions](/docs/platform/reference/server-actions) references.

## Forming one

`createTeam(competitionId, name)` inserts the team and makes its creator the **lead**. The name is slugified and unique within the competition — a second team reaching for a taken name gets `name_taken`, not a constraint error. The join code is six characters from an alphabet with no `O`, `I`, `0` or `1`: it gets read aloud in a room.

Access follows immediately, not at any later lock: `createTeam` also creates the GitHub team, grants it `push`, cuts `team/<competitionSlug>/<teamSlug>` from the competition's integration branch `comp/<competitionSlug>`, and installs the ruleset that narrows the grant to that one branch. Joining adds the member to that team. Both run **after** the transaction commits: a GitHub outage leaves somebody on the roster without push rather than rolling back a join, and the nightly `reconcileTeams` pass repairs the difference.

## One join path, five checks

`joinTeam` (with the code) and `respondToMembership` (accepting an invitation or approving a request) both go through `requireCanJoin` in `server/teams/requireCanJoin.ts`, which takes the transaction handle so the answer cannot go stale between the check and the insert:

1. Judging has not begun for the competition → `competition_closed`
2. The roster is open → `roster_locked`
3. The member has a linked GitHub identity → `github_not_linked`
4. The team is under its effective cap → `team_full`
5. The member is on no other team in this competition → `already_on_team`

**`reformTeam` is the exception.** It checks that the caller leads the source team and that the target competition's judging has not begun, then inserts that lead through `insertMembership` without the five — so only `already_on_team` can fire on that row, from the unique constraint rather than a check. Everyone it invites is checked in full when they answer.

Actions return `{ ok: false, code }` rather than throwing, because Next redacts an uncaught server-action error in production: the code every screen branches on would not survive the trip.

<details>
<summary>What enforces the cap and the one-team rule, if not checks 4 and 5?</summary>

Neither of those checks enforces anything — they produce a good error message. Both are select-then-insert with a real gap between the statements.

The cap is held by the `select … for update` on the team row at the top of `requireCanJoin`. It serializes concurrent joins for that team and no other, so a second transaction blocks, then reads the true count and fails cleanly. "At most four rows" is a count rather than a uniqueness property, so no index expresses it and nothing else would catch the race.

One-team-per-competition is the other way round: the row lock is no help at all, because two members accepting invitations from different teams lock different rows and never contend. What holds it is `unique ("userId", "competitionId")` on `teamMembers`, translated back into `already_on_team` by `insertMembership`.

</details>

## Size is configuration

The cap is `DEFAULT_MAX_TEAM_SIZE = 4` in `server/teams/limits.ts`, overridden per competition by `competitions."maxTeamSize"`. Screen and action read one constant, so a page cannot say "3 of —" while the action rejects a fourth. It is enforced on insert only: lowering the cap must never invalidate a team that already formed under the old one.

## Invitations and join requests are one table

Membership can be proposed from either side, and both are the same row with the arrow reversed: a `(team, member)` pair awaiting the other party. `platform."teamMembershipRequests"` carries a `direction`, and that is the only thing the two halves disagree about:

|                     | `invite`                                   | `request`                            |
| ------------------- | ------------------------------------------ | ------------------------------------ |
| Created by          | the team's lead                            | the member                           |
| Answered by         | the named member                           | the team's lead                      |
| Carries a `message` | no                                         | optional                             |

A partial unique index allows one _pending_ row per `(team, member)` in either direction, so an invitation and a request between the same pair cannot both be open: whichever arrives second is refused as `request_not_actionable`, and accepting the one already there is the right move. Two people reaching for each other at once is agreement, not a conflict.

Acceptance is validated when answered, never when created: in between, the team can fill up, the roster can lock, or the member can join someone else. A pending row is permission to attempt a join, not a reserved seat. **Accepting one withdraws the member's other pending rows for that competition**, both directions, as `withdrawn` — the one-team rule would reject them anyway, and leaving them open strands leads waiting on somebody unavailable.

## The lead, and the lock

`teamMembers.role` is `lead` or `member`, with a partial unique index allowing exactly one lead per team. The lead invites, answers requests and transfers the role; a transfer demotes before it promotes, because the index rejects the other order. A lead cannot leave a team that still has other members (`lead_must_transfer_first`). The lead also owns the team's sandbox environment, which a composite foreign key from `teamEnvironments` enforces.

A roster is **locked** — no new members, nothing else — when the team has a live or merged entry, when `judgingStartsAt` has passed, or when an officer set `lockedManuallyAt` through `setManualLock`. The predicate is computed, never stored, and lives once in `server/teams/lockState.ts`.

<details>
<summary>How the entry state machine drives the lock</summary>

Every team's PR ends up closed: the winner's is merged, the rest are closed unmerged once the competition is over. That is the case the design turns on, because a naive "closing the PR clears the submission" rule would wipe every losing team's star during cleanup.

So the entry answers two questions that agree during the week and diverge afterwards. `submissionState` mirrors GitHub forever — `opened`, `reopened` and `ready_for_review` → `open`, `closed` with `merged: false` → `closed`, `closed` with `merged: true` → `merged` — and carries no time logic at all. `competedAt` is frozen once, by the judging-start pass, on teams whose entry was live at that moment.

The lock reads `submissionState in ('open','merged')` or `now() >= judgingStartsAt` or `lockedManuallyAt is not null`. Closing a PR before judging therefore reopens the roster, which is the "we need one more person" affordance — close, add them, reopen — and the `judgingStartsAt` term bounds it, so there is no path to adding a ringer at the table. Because the star reads `competedAt` rather than the live state, closing a PR mid-week defers a star rather than dropping it.

Only PRs whose head is that team's `team/<competitionSlug>/<teamSlug>` branch **and** whose base is that competition's own `comp/<competitionSlug>` count as entries. A PR opened against `main` by mistake is silently not an entry, which is why `server/github/naming.ts` derives both names in one place and matches the base ref exactly rather than by prefix.

The webhook is the only writer on the happy path. `setSubmission` is the officer counterpart — the team that presented without a PR — and it writes the URL, the timestamp and the state together, because a check constraint ties the URL and the state to each other.

</details>

## Re-forming for the next week

A lead can re-form a past team into a later competition. `reformTeam` creates the new team, records `clonedFromTeamId`, adds the lead, and issues a pending **invite** to each of the source roster — never a direct insert: the one-team rule may already place someone elsewhere, and joining is a choice. It returns `{ teamId, invited, skipped }`, with a reason per skipped member. It touches GitHub not at all: the new team, its branch and its grants arrive with the nightly reconcile.

## Teams nobody formed

The judging-start pass creates rows as well as freezing them. `createSoloTeams` gives every attendee of a judged workshop who is on no team a team of one, with themselves as lead — so `platform.teams` holds teams no lead ever created, and a member who joined nothing still has one — the surprise waiting for any standings surface.

It is attribution rather than credit: a solo team is created after the freeze, with no entry and no `competedAt`, so it brings no competition star with it — the member's workshop star came from attendance anyway. Skipping anybody already on a team makes the pass a no-op to re-run.

## Why it's like this

<details>
<summary>Why one team per member per competition?</summary>

A member may be on several teams at once as long as each belongs to a different competition — different projects in the same week, or the same project in different weeks. Carrying `competitionId` redundantly onto `teamMembers` is what lets the database say that directly: without the column the rule is "no two rows whose teams share a competition", which is not expressible as a constraint at all, and would live in application code that has to remember to check.

The composite foreign key `("teamId", "competitionId") → teams(id, "competitionId")` is what keeps the denormalized column honest, and `teams` carries `unique (id, "competitionId")` only to be its target. The same denormalize-then-anchor pattern shows up on attendance.

</details>

<details>
<summary>Why a branch in the organisation rather than a fork?</summary>

Ordinary contributions keep the fork-and-PR workflow. Competition teams get a branch inside the organisation instead, for one decisive reason: **you cannot automate collaborator grants on a student's personal fork.** Adding teammates to `someone/DevDogs-Website` needs that student's own account admin, which the org's token has no reach into — the reason is recorded beside the code that provisions, at the top of `server/github/teamSync.ts`. The secondary arguments point the same way: a pull request from a fork receives none of the repository's secrets, so anything in CI needing them cannot run on it, and GitHub Teams grant access to organisation repositories only.

Organisation membership costs the member no extra step, because linking GitHub already does it — `server/auth/providers/github.ts` posts the invitation as the app, then sets the membership to `active` with the member's own token.

The layout that follows is two shapes from `server/github/naming.ts`: `comp/<competitionSlug>` per competition, cut from `main` and the base every entry is opened against, with `team/<competitionSlug>/<teamSlug>` under it per team. The competition slug carries the semester and the week, so the same project's competition next week cannot collide with this week's.

</details>

<details>
<summary>Why are writes server actions rather than <code>security definer</code> RPCs?</summary>

Moderation and feedback put every write behind an RPC because they are client-agnostic: an integrating app reaches them over PostgREST with its own Supabase client, so the rules have to live where every client necessarily passes through.

None of that applies here. Meetings, teams and attendance are consumed by the platform and nothing else, so an RPC would buy an independence no caller wants and pay for it by splitting logic that belongs together — a join is a database write and a GitHub API call, and only the first can happen in Postgres.

The trade is that Drizzle connects as the owning role and bypasses RLS, so the guard at the top of each action is the whole boundary. Two things keep that safe: the restrictive deny-all client-write policies stay, because they are what stops a browser holding an `authenticated` JWT writing these tables through PostgREST; and every invariant these pages describe stays in the database, because moving off RPCs moves _procedures_ into TypeScript, not _constraints_.

</details>
