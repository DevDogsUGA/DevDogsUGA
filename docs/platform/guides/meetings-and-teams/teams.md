---
name: Teams
description: How a git-native team forms — GitHub-first membership grants, the two caps and the advisory locks that hold them, invitations and join requests as one table, the lead, and disbanding.
order: 2
section: guides
---

# Teams

A team is a **persistent project team**, not tied to any competition: it is a git branch, `team/<slug>` off `main`, and membership is push access to that branch. GitHub is the source of truth; `platform."teams"`/`"teamMembers"` is a mirror of it. Read this before changing `server/actions/teams.ts` or `server/teams/`; for signatures alone, read `server/teams/` and `server/actions/teams.ts` directly.

## Forming one

`createTeam(name)` provisions GitHub first — creates the GitHub team, grants it `push`, cuts `team/<slug>` from `main`, and installs the ruleset that narrows the grant to that one branch (`server/github/rulesets.ts`) — adds the creator to it, and only THEN inserts the `teams` row and the creator's `teamMembers` row as **lead**, inside the same transaction. The name is slugified and globally unique — a second team reaching for a taken name gets `name_taken`. The join code is six characters from an alphabet with no `O`, `I`, `0` or `1`: it gets read aloud in a room.

**GitHub-first, mirror second, same transaction.** If a GitHub call fails, the function throws and the transaction rolls back — the mirror never claims an access grant GitHub refused. This is a deliberate reversal from the pattern member-facing writes elsewhere in the app use (write the mirror, let GitHub catch up async): here GitHub genuinely cannot be caught up after the fact, because a mirror row with no matching push grant is a member who was told they are on a team and cannot push to it. The nightly `reconcileTeams` pass is the backstop for the other direction — a GitHub call that succeeded but whose mirror write then failed to commit — not for this one.

## One join path, under a lock

`joinTeam` (with the code) and the accept half of `respondToMembership` both go through `requireCanJoin` in `server/teams/requireCanJoin.ts`, which takes the transaction handle and takes two transaction-scoped advisory locks — one keyed by the joining user, one by the team, always in that order — before checking anything, so the answer cannot go stale between the check and the write:

1. The team exists.
2. The member has a linked GitHub identity → `github_not_linked`.
3. The member is not already active on this exact team → `already_on_team`.
4. The member is under `MAX_CONCURRENT_TEAMS_PER_USER` active teams → `too_many_teams`.
5. The team is under `MAX_TEAM_SIZE` active members → `team_full`.

Actions return `{ ok: false, code }` rather than throwing, because Next redacts an uncaught server-action error in production: the code every screen branches on would not survive the trip.

<details>
<summary>What the advisory locks are for, if the checks above are plain counts</summary>

Checks 4 and 5 are select-then-insert with a real gap between the statements, and neither is a uniqueness property an index could express — "at most two active rows for this user" and "at most four active rows for this team" are both counts. Nothing but a lock closes the gap.

`pg_advisory_xact_lock(1, hashtext(userId))` and `pg_advisory_xact_lock(2, hashtext(teamId))`, transaction-scoped so each releases itself on commit or rollback. Two concurrent joins racing for the same team's last seat both take the team lock; the second blocks until the first commits, then re-reads the true count and gets `team_full` cleanly rather than the two of them landing together. The user lock does the same job for the concurrent-team cap when the SAME user races two different teams. The fixed lock order — user, then team, everywhere — is what keeps two joins from deadlocking on each other's lock.

`insertMembership`'s partial unique index, `teamMembers_one_active_per_team_user`, is the actual backstop if a lock were ever skipped; the locks are what make the common case fast and correct instead of relying on that index to turn a race into a 500.

</details>

## The two caps are constants

`MAX_TEAM_SIZE = 4` and `MAX_CONCURRENT_TEAMS_PER_USER = 2`, both in `server/teams/limits.ts`, both global. There is no per-competition override — the old `competitions."maxTeamSize"` column existed for exactly that and nothing ever set it, so the platform redesign's teams-core step dropped it along with the concept it was overriding. `hasRoomOnTeam` and `underConcurrentTeamCap` are the pure predicates `requireCanJoin` reads, so the boundary condition has one definition and one test rather than a `>=` reimplemented at every call site.

## Invitations and join requests are one table

Membership can be proposed from either side, and both are the same row with the arrow reversed: a `(team, member)` pair awaiting the other party. `platform."teamMembershipRequests"` carries a `direction`, and that is the only thing the two halves disagree about. This table is the one thing GitHub cannot hold — there is no "pending" state on a GitHub team membership — so it stays in Postgres even though membership itself does not.

|                     | `invite`         | `request`       |
| ------------------- | ---------------- | --------------- |
| Created by          | the team's lead  | the member      |
| Answered by         | the named member | the team's lead |
| Carries a `message` | no               | optional        |

A partial unique index allows one _pending_ row per `(team, member)` in either direction, so an invitation and a request between the same pair cannot both be open: whichever arrives second is refused as `request_not_actionable`, and accepting the one already there is the right move.

Acceptance is validated when answered, never when created: in between, the team can fill up, or the member can reach the concurrent-team cap. A pending row is permission to attempt a join, not a reserved seat. Unlike the old one-team-per-competition model, accepting one invitation does **not** withdraw the member's other pending approaches — a contributor can be active on up to `MAX_CONCURRENT_TEAMS_PER_USER` teams, so a second acceptance is not automatically moot. Applying to a few and joining whichever answers first is still the intended use; if the second acceptance would push someone over the cap, `requireCanJoin` refuses it on its own turn and the row stays pending for them to decline.

## The lead

`teamMembers.role` is `lead` or `member`, with a partial unique index allowing exactly one ACTIVE lead per team (`teamMembers_one_lead_per_team`, filtered on `"leftAt" is null` — a lead who left does not block the team from ever having one again). The lead invites, answers requests, transfers the role, and disbands the team. A transfer demotes before it promotes, because the index rejects the other order. A lead cannot leave a team that still has other active members (`lead_must_transfer_first`).

## Membership is history, not a row that disappears

Leaving sets `teamMembers."leftAt"` rather than deleting the row — GitHub-first, same as joining: `removeMember` runs first, and only on success does the mirror record the departure. "Active" means `"leftAt" is null`, and that predicate is what every roster read, cap count and lead check in this file filters on. A member who leaves and later rejoins gets a **second** row, a new stint, not a revived first one — `teamMembers_one_active_per_team_user` is a partial unique index over active rows specifically so a rejoin does not collide with the row the first stint left behind.

The reason to keep the history at all: `platform.memberStars`' competition branch derives competition stars from who was on a team at some past moment (collaborator on a team-branch that entered before the competition's issue closed), and that question needs the record of when someone was actually active, not just who is on the roster today. See [Stars & streaks](./stars-and-awards.md).

## Disbanding

Only the lead can disband a team, and it is GitHub-first in the other direction from a join: `disbandTeam` (`server/github/teamSync.ts`) deletes the GitHub team, THEN the per-team ruleset — deliberately in that order, so a crash between the two steps leaves the branch governed by a ruleset whose bypass actor no longer resolves to anybody, which is the safe failure (nobody can push) rather than the unsafe one (every other team's repository-wide grant reaches an unruled branch). Only once GitHub confirms does the action delete the `teams` row, which cascades `teamMembers` and any pending `teamMembershipRequests`.

Disbanding does **not** delete the branch or its pull-request history — that is the record of what the team did, and a member should still be able to point at it after the team that made it no longer exists.

## The live mirror

GitHub-first writes only cover change caused BY the platform. Two more paths keep the mirror honest against everything else: a change made directly on GitHub (a login added by hand, a branch or ruleset deleted from the UI), and a GitHub call that succeeded while its mirror write, for whatever reason, did not.

**The webhook** (`POST /github/webhook`, `server/github/webhookEvents.ts`) is the near-real-time half. The App delivers four event types here: `membership` (added/removed on a team's GitHub team), `team` (deleted, or renamed), and `create`/`delete` (a `team/<slug>` branch appearing or vanishing) — see [The DevDogs GitHub App](../../../toolkit/infrastructure/github-app.md) for exactly which events and permissions. Every handler reads only its payload, never calls GitHub back, and is idempotent against redelivery. A team or branch this platform never provisioned is ignored, not refused.

**The nightly reconcile** (`reconcileTeams`, `server/github/teamSync.ts`, run by `/cron/github-reconcile`) is the backstop for what the webhook cannot reach: an undelivered event, or drift nobody's action or webhook ever saw. It reads GitHub's actual state for every mirrored team and repairs the mirror TOWARD it — a GitHub login with no active mirror row gets one, an active row with no matching login gets closed, a missing branch or ruleset gets recreated like `provisionTeam` always has. **It never removes anyone from GitHub.** A member or team over cap because someone was added directly on GitHub is reported to Sentry, not enforced — the caps live on the platform's own join path, not as a promise about what GitHub itself allows.

Both take `db` as a parameter, and the reconcile pass takes its GitHub client the same way (`ReconcileGithubClient`, defaulting to a real Octokit implementation), so both are db-tested against a real database without touching the network.

**`teams.githubSyncedAt`** is when the mirror was last confirmed against GitHub, set by every GitHub-touching action, webhook event and reconcile pass. The team dashboard and the attendance passport show a muted staleness note when it is old or null — see `server/teams/mirrorFreshness.ts`.

## Why it's like this

<details>
<summary>Why a branch in the organisation rather than a fork?</summary>

Ordinary contributions keep the fork-and-PR workflow. Teams get a branch inside the organisation instead, for one decisive reason: **you cannot automate collaborator grants on a student's personal fork.** Adding teammates to `someone/DevDogsUGA` needs that student's own account admin, which the org's token has no reach into — the reason is recorded beside the code that provisions, at the top of `server/github/teamSync.ts`. The secondary arguments point the same way: a pull request from a fork receives none of the repository's secrets, so anything in CI needing them cannot run on it, and GitHub Teams grant access to organisation repositories only.

Organisation membership costs the member no extra step, because linking GitHub already does it — `server/auth/providers/github.ts` posts the invitation as the app, then sets the membership to `active` with the member's own token.

The layout is one shape from `server/github/naming.ts`: `team/<slug>` per team, cut straight from `main`. There is no shared integration branch to cut from any more — the old `comp/<competitionSlug>` branch existed because a team belonged to exactly one competition; a persistent, competition-independent team has nowhere it makes sense to branch from except the branch its eventual pull request will target.

</details>

<details>
<summary>Why is repository-wide `push` narrowed by a ruleset instead of a narrower grant?</summary>

GitHub team permissions have **no branch dimension** — the grant is repository-wide or it does not exist. So every team holds `push` on every other team's branch by construction, and the per-team ruleset in `server/github/rulesets.ts` is the only mechanism that narrows an `update`/`deletion` restriction down to one exact ref, with that one team as the only bypass actor. See that file's own header for the constraints this puts on ruleset math: bypass actors are ruleset-scoped, rules aggregate across rulesets, and the repository has a 75-ruleset ceiling. A team's ruleset is created when the team is and deleted when it is disbanded, so the count tracks how many teams concurrently exist rather than growing forever.

</details>

<details>
<summary>Why are writes server actions rather than <code>security definer</code> RPCs?</summary>

Moderation puts every write behind an RPC because it is client-agnostic: an integrating app reaches it over PostgREST with its own Supabase client, so the rules have to live where every client necessarily passes through.

None of that applies here. Meetings, teams and attendance are consumed by the platform and nothing else, so an RPC would buy an independence no caller wants and pay for it by splitting logic that belongs together — a join is a database write and a GitHub API call, and only the first can happen in Postgres.

The trade is that Drizzle connects as the owning role and bypasses RLS, so the guard at the top of each action is the whole boundary. Two things keep that safe: the restrictive deny-all client-write policies stay, because they are what stops a browser holding an `authenticated` JWT writing these tables through PostgREST; and every invariant these pages describe stays in the database, because moving off RPCs moves _procedures_ into TypeScript, not _constraints_.

</details>
