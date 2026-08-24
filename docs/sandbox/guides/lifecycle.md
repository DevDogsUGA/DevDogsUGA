---
name: Lifecycle
description: Where a sandbox environment comes from, who owns it, how it frees the owner's project slot, and the three ways it ends.
order: 1
---

# Lifecycle

A sandbox environment is a real Supabase project on somebody's free plan: one
shared backend per team, because testing the study group finder's messaging
takes two people on two real devices. It outlives the event it was made for.
This page is for a **team lead about to provision one**, and for anyone
maintaining the provisioning code: where the project comes from, why it belongs
to a person rather than a team, and the three ways it ends. If you only want to
_use_ an existing environment, read [Access](/docs/sandbox/guides/access)
instead.

## Where the instance comes from

Each environment is a **free Supabase project owned by the team lead**, created
by the platform through Supabase OAuth. The lead connects once; both grant
tokens go to Vault, and `platform."supabaseConnections"` keeps their secret ids
beside the org slug, the requested scopes, and the expiry a nightly refresh
reads.

`provisionEnvironment` does the rest in one ordered pass: create the project,
poll to `ACTIVE_HEALTHY` (about ten seconds — a poll, not a sleep), retrieve the
keys, store the secret key in Vault, insert the `sandboxEnvironments` row, apply
every migration, attach the team. Nothing is written platform-side until the
project is healthy, so a failure partway through leaves no orphan row.

<details>
<summary>Which Supabase OAuth scopes does the platform ask for?</summary>

`REQUIRED_SCOPES`, in `apps/platform/src/server/supabase/oauth.ts`:
`projects:read`, `projects:write`, `secrets:read`, `database:read`,
`database:write`, `auth:read`, `auth:write`, `organizations:read`.

Nothing in that set writes organization membership, and that is the shape of the
whole design: the platform manages **credentials, not collaborators**. Teammates
never join the lead's Supabase organization — they get tokens.

The token response carries no `scope` field, so what was granted cannot be read
back. `supabaseConnections.scopes` records what was _requested_; the only real
check is calling an endpoint and seeing whether it succeeds.

</details>

## Environments are separate from teams

An environment has an owner, not a team, and teams attach to it:
`sandboxEnvironments` holds the project, `teamEnvironments` is a thin join from a
team to the environment it uses. That buys a returning team the environment it
used last time, and lets teams whose events overlap share one.

The hostname belongs to the environment, so re-attaching keeps the same URL:
existing `.env.local` files and installed builds keep working.

## The owner is the lead, and the database enforces it

> The environment's owner is the lead of every team attached to it.

So two teams sharing an environment have the same lead: sharing is one person
reusing their own project. Three constraints enforce it, no triggers.

The consequence to tell leads plainly: **transferring team lead requires
detaching the environment first.** Postgres refuses the demotion while the
environment is attached. Not a modelling artifact — the project lives in the
original owner's Supabase organization and no API can move it, so a new lead
gets a new environment and the old one keeps its project.

<details>
<summary>How do the constraints enforce it?</summary>

In `supabase/migrations/20260805000001_platform_sandbox_environments.sql`,
`teamEnvironments` carries a denormalized `ownerUserId` and `ownerRole` plus:

- `check ("ownerRole" = 'lead')`, pinning the role so an ordinary membership
  cannot satisfy the next constraint;
- a composite foreign key on `("environmentId", "ownerUserId")` into
  `sandboxEnvironments(id, "ownerUserId")`, tying the row to the environment's
  real owner;
- a composite foreign key on `("teamId", "ownerUserId", "ownerRole")` into
  `teamMembers("teamId", "userId", "role")`, declared
  `on update restrict on delete restrict`.

`on update restrict` does as much work as `on delete restrict`: demoting the lead
would orphan the referencing row, so the update is rejected outright. A partial
unique index cannot be a foreign-key target, which is why `role` is carried into
the key rather than filtered on.

</details>

## Capacity, and pausing to free a slot

The free plan grants **two projects counted across every organization where the
member is an owner or admin** — not two per organization. A lead at two cannot
provision a third: `provisionEnvironment` fails with `at_capacity` rather than
quietly choosing another owner, which would put a project and a billing
relationship into an account without its owner choosing it.

Three remedies, all the team's decision — attach an existing environment, pause
one of the lead's own projects, or transfer team lead while nothing is attached.

Pausing is on that list only because it is reversible, and worth saying plainly:
a paused project stops counting against the cap immediately and restores in
minutes. "Pause my project" does not sound like that. `pauseOwnedProject` does
not wait for it to land: it calls pause, writes `status: "paused"` and returns,
while the project takes about eighty seconds to settle — so a create retried
immediately can still meet `at_capacity`.

<details>
<summary>What should the pause picker show?</summary>

The candidate list comes from `GET /v1/projects` under the lead's own token, so
it includes projects with nothing to do with DevDogs. This is the one place the
platform acts on infrastructure outside its own domain, and it should feel like
an explicit, singular choice every time:

- **Label which are DevDogs environments** by matching
  `sandboxEnvironments.projectRef`. Everything unmatched is the member's own
  project and should look visually distinct.
- **Never pre-select anything, and pause one per confirmation.**

`pauseOwnedProject` enforces the refusal that matters rather than warning about
it: a DevDogs environment with any team still attached cannot be paused here,
because offering it would let one lead break another team's event.

</details>

## Three ways it ends

| State        | Meaning                                                | How it happens                         |
| ------------ | ------------------------------------------------------ | -------------------------------------- |
| **detached** | No team attached; project still exists and is reusable | `detachEnvironment` drops the join row |
| **revoked**  | Deliberately torn down; terminal                       | `tearDownEnvironment(id, 'revoked')`   |
| **orphaned** | The upstream project no longer exists; terminal        | `reconcilePass`, or 90-day expiry      |

**Detached is not teardown.** A detached environment keeps its project, hostname,
Vault secrets and member credentials, and simply auto-pauses. Deleting any of it
would make "attach the environment I used last month" mean re-provisioning — the
friction this feature exists to remove.

**Hostnames are retired, never recycled.** A stale `.env` or an installed build
still points at the old hostname; if that name were ever reassigned, the build
would read and write somebody else's database with no error at all.

**Orphaning is a nightly decision, never a live one.** `reconcilePass` needs a
definite 404 from `GET /v1/projects/{ref}`, or a `REMOVED` status; one transient
upstream error must not tear down a healthy environment. `expirePausedPass`
reaches the same state on the 90-day rule. The blast radius is small: migrations
live in git, so re-provisioning restores the schema and only test data is lost.

<details>
<summary>In what order is an environment dismantled?</summary>

`tearDownEnvironment` revokes every credential first, then deletes the Vault
secrets (`secretKeySecretId` and `jwtSecretId`), then detaches any remaining
teams and sets the terminal status. Deleting the secrets first would leave live
credentials resolving against a half-dismantled environment, which fails in
stranger ways than a clean rejection.

The row itself is never deleted: revoked and orphaned rows survive precisely
because the unique constraint on `proxyHostname` is what keeps the name reserved.
Re-provisioning creates a **new** environment with a **new** hostname, never a
resurrection of the old one.

A project paused past Supabase's 90-day restore window is effectively deleted, so
`expirePausedPass` marks it orphaned pre-emptively rather than letting a team
discover it at wake time.

</details>

## Paused instances are normal

Free projects pause after a week of inactivity, so a team returning from a week
off meets a paused instance — the standard cold path, not an edge case.
`pnpm sb status --team <slug>` reports and wakes in one command; a restore takes
about 196 seconds, which is why it says "about four minutes" rather than
spinning.

Two `not null default true` columns on `sandboxEnvironments` gate the two
background passes: `prewarmEnabled` lets pre-warm restore an environment,
`autoPauseEnabled` lets auto-pause stop one once its last attached competition
is over, returning the owner's slot immediately rather than a week later.
Nothing writes either column, so every environment has both.

Both passes read one query — environments attached to a team whose competition
has not finished judging (`competitions."judgingStartsAt"` null or still in the
future) — so they cannot disagree. Pre-warm runs every five minutes and restores
every one of those that is paused, with no lead-time window: a competition three
weeks out is woken on the next tick. Reconcile, expiry and auto-pause run
nightly, in that order.

## Why it's like this

<details>
<summary>Why not Supabase branching?</summary>

A branch per team, seeded from `supabase/migrations` and destroyed after judging,
is the obvious answer and the one to revisit if the budget ever allows. It is a
paid-plan feature on every instance involved, and the club is optimizing for
zero.

The design keeps it reachable rather than ruling it out: `platform."envKind"` is
`enum ('owned', 'branch')`, so switching later changes the provisioning step and
nothing else.

</details>

<details>
<summary>Why does <code>envStatus</code> not just mirror Supabase's project status?</summary>

Supabase publishes roughly fifteen project statuses; `platform."envStatus"` has
seven, and three of those — `detached`, `revoked`, `orphaned` — describe the
platform's relationship to a project rather than the project's health, so nothing
upstream ever maps onto them.

`mapProjectStatus` in `apps/platform/src/server/supabase/status.ts` is a total
function over strings, because the input comes from somebody else's API and can
grow a value at any time. Anything unrecognized maps to `provisioning`, which
reads as "not ready yet". Mapping the unknown to `active` instead would have
pre-warm declare victory on a project that is not serving, and members would meet
a broken instance rather than a wait. Erring toward not-ready costs a retry;
erring toward ready costs an event.

</details>
