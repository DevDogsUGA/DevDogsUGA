---
name: Elections
description: How teams and officers rank competing implementations, how a 1000-point competition score splits 600/400 between requirements and scaled Borda scores, and how a three-step tiebreak decides the competition winner.
---

# Elections

> **Status: implemented.** The schema lives in migrations `20260803000007`
> through `20260803000009`, the tally in
> `server/elections/{tally,runTally,ballotOrder}.ts`, and the cron in
> `app/(api)/cron/tally-elections/route.ts`, scheduled `*/5 * * * *` in
> `wrangler.jsonc`. This page records the design and its reasoning.

When a competition is judged, competing implementations are ranked in one or more
**award categories** — "best looking", "most useful", and so on. Each category is
its own election, scored with a **Borda count**.

A competition is worth **1000 points**, split 600 for requirements met and 400 for
election results, and **the team with the most total points wins the competition**.

Some categories are voted on by the competing teams; others by officers.
**Officers do not compete**, so there is no recusal problem — the two electorates
are disjoint by construction.

## Scope

An election belongs to a **competition** — the week of work one workshop opened,
for one project. The teams competing in it are the candidates in every election,
whoever is voting. Nothing crosses projects, and nothing crosses weeks.

Ballot windows are **officer-authored** — `opensAt` and `closesAt` per election,
set in Airtable alongside the categories. There is no "submissions close" event
to hang them off: an entry is a PR, teams open theirs whenever they are ready,
and nothing closes them as a group.

What the schedule has to respect is one ordering, and it is worth stating because
nothing enforces it: **`closesAt` must fall before `competitions."judgingStartsAt"`.**
The tally runs on a five-minute cron after `closesAt`, and the winner is
announced at judging — so a window that closes during the meeting announces a
result that has not been computed. Officers set these by hand, so this belongs in
the base as a documented convention and in the UI as a warning, not as a
constraint.

## Two electorates

| Electorate   | Ballots                | Cast by                         |
| ------------ | ---------------------- | ------------------------------- |
| **Teams**    | One per competing team | The team lead                   |
| **Officers** | **Exactly one, total** | Any officer with the permission |

Officers vote **collectively, not individually**: they agree on an ordering
however they like and one of them submits it. That keeps officer influence
proportionate — a category decided by officers is decided once, not once per
officer who happens to be around.

It also means an officer election is, mechanically, **a ranking rather than an
election**. Borda over a single ballot returns that ballot's order unchanged, so
the implementation treats both electorates identically while the semantics differ:
teams _vote_, officers _assign_.

Scaling is what makes this worth routing through the same machinery. With one
ballot, a team ranked _r_ of _n_ scores _n−r_ against a maximum of _n−1_ — so an
officer ranking spreads its category's points evenly from full marks down to
zero, with no schedule to author and no special case in the tally.

## Borda, not STV

Each ballot ranks **every** candidate. A rank of _r_ among _n_ candidates scores
_n − r_ points, summed across all ballots. Highest total places first.

Borda is the right fit here for three reasons:

- **Self-ranking cancels.** Teams may rank themselves, and every team ranking
  itself first adds the same constant _n−1_ to everyone — leaving the ordering
  decided entirely by how teams ranked _each other_, which is the thing being
  measured. Under an elimination method the same behaviour produces a degenerate
  all-tied first round.
- **It produces a magnitude, not just an order**, which is what the 400-point
  block needs — scaling requires a score to scale. Elimination methods yield only
  a sequence, and elimination order is a poor proxy for standing anyway: a
  broadly-liked team can go out early to vote-splitting despite more teams
  preferring it to the eventual winner.
- **A team can check the result by hand.** With five ballots and five candidates,
  anyone can recompute their own score. That matters when the outcome assigns
  points that decide who wins.

**Complete rankings are required.** With only a handful of candidates it is no
burden, and it removes truncation strategy, ballot exhaustion, and any rule about
how to score unranked teams.

### The ballot must not be submittable as-presented

Requiring a complete ranking means whatever order the form opens in **is already
a valid ballot**. Left alone, that turns voter apathy into systematic bias: a
prefilled alphabetical list would quietly reward teams whose names sort early.

Two mitigations, both required:

1. **Randomize the presented order per ballot**, except the voter's own team,
   which is pinned first for teams that wish to rank themselves. Every ballot sees
   a different shuffle, so indifference contributes noise rather than a consistent
   thumb on the scale.
2. **Require an interaction before submit.** The lead must reorder at least once,
   or explicitly confirm the presented order is intentional. A ballot cast by
   pressing submit on an untouched form should be impossible.

Officer ballots get the same treatment. There is only one of them, but it carries
the weight of an entire category.

## Points

A competition is scored out of **1000**, from two independent blocks:

```
600   requirements met      600 × met / total
400   election results      sum over elections of (400 / k) × scaled Borda
─────
1000  competition total
```

The blocks measure different things on purpose. Requirements are **objective and
self-determined** — a team that does the work earns the points regardless of what
anyone else built. Elections are **comparative**, and a team can only earn them at
another team's expense. Weighting the objective block higher keeps the bulk of a
team's score in its own hands.

### 600 — requirements

Officers enter two numbers: how many hard requirements the competition had, and how
many each team met.

```
requirementPoints = round(600 × met / total)
```

Twelve requirements, eleven met, is **550**.

The scale is linear, with no threshold and no bonus. A cliff ("80% or nothing")
would make the last requirement worth more than the first ten, and rewarding
overshoot would need a notion of extra credit that the grading step does not
have.

### 400 — elections

Every points election in the competition is **weighted equally**, so with `k` of them
each is worth `400 / k`. Within an election, a team's share is its Borda score
over the largest score the election could have produced:

```
                    B                 B   = the team's Borda score
scaled  =  ─────────────────────      V   = ballots cast in this election
              V × (n − 1)             n   = competing teams

electionPoints = round( Σ over elections of (400 / k) × scaled )
```

`V × (n − 1)` is what a team ranked first on **every** ballot would score, so
`scaled` runs 0 to 1 and the block is worth exactly 400 to a team that sweeps
every category unanimously.

The two `round`s are applied to the **block totals, not per election**. Rounding
each of three elections separately would cap a perfect team at 399.

#### Normalizing against the ceiling, not the field

The alternative — min-max scaling, where the leader takes the full share and the
trailer takes zero — was rejected. It has no defined value when every team ties
(the denominator is zero), and, worse, it manufactures a decisive result from
noise: five teams within a single Borda point of each other would still be spread
across the entire 400, and last place would score zero for losing by one rank.

Normalizing against the ceiling means **margins survive**. Teams that finish
close together score close together, which is the honest reading of a close
vote.

#### Self-ranking compresses the range, and that is fine

Teams may rank themselves first, and if every team does, each collects _n−1_ from
its own ballot no matter what anyone thinks of it. With one ballot per team the
realized range narrows to `[1/n, (n−1)/n]` of the block rather than the full
`[0, 1]` — with four teams, roughly 100 to 300 points instead of 0 to 400.

This is uniform across teams, so it shifts and compresses every score identically
and **changes no ordering and no relative margin**. The block simply carries less
spread in a competition where everyone votes for themselves, which is a fair
description of what those ballots contained.

### When a block is absent

Weights renormalize so that **1000 stays the ceiling** — a team should never face
a competition it cannot max out because of how officers configured it.

| Situation                               | Result                          |
| --------------------------------------- | ------------------------------- |
| No points elections (`k = 0`)           | Requirements are worth **1000** |
| `requirementCount = 0` (none by design) | Elections are worth **1000**    |
| Both absent                             | Every team scores 0             |
| `requirementCount` is **null**          | **Finalization blocks**         |

The last row is the important one. Null means _officers have not graded yet_,
which is a data-entry gap rather than a competition without requirements — treat it
exactly like the missing tiebreak ballot below and refuse to finalize. Zero must
be entered deliberately.

Competitions with fewer than two teams skip elections entirely, so `k = 0` is a
reachable state and not a defensive branch.

### The winner is computed

The `teamAwards` row with `category = 'winner'` is **written by the tally**, not
authored by anyone. Officers still author named side awards in Airtable, because
an honourable mention is a judgement rather than a sum.

## Breaking ties

Three steps, each using genuinely different information, applied in order:

| #   | Mechanism                                   | Resolves                     |
| --- | ------------------------------------------- | ---------------------------- |
| 1   | **Total points**                            | Almost always                |
| 2   | **Copeland** over all pooled points ballots | Head-to-head preference      |
| 3   | **The officer "who did best" ranking**      | Always — it is a total order |

Scaled scores look continuous enough to make step 1 seem decisive on its own. It
is not: both blocks are **rounded to whole points**, and the requirements block is
coarse by construction — with twelve requirements it can only land on multiples of 50. Two teams that met the same count and voted similarly can collide exactly.

**Step 2 pools every ballot from every points election** — team-voted and
officer-voted alike — into one pairwise matrix, rather than running on a
dedicated ballot. Teams already stated their preferences several times over;
asking again adds fatigue without adding information. For each pair, count how
many pooled ballots rank one above the other; Copeland score is wins minus
losses.

The **tiebreak ballot is excluded** from this pool. It is step 3, and pooling it
into step 2 would leave the two steps reading the same input.

### Copeland does not guarantee a unique winner

Worth stating plainly, because the parity arithmetic invites the opposite
conclusion.

Since rankings are complete, every pooled ballot expresses a strict preference
for each pair, so a **pairwise** tie is possible exactly when the pooled ballot
count is even:

```
pooled = n × k_t + k_o        n   = competing teams
                              k_t = team-voted points elections
                              k_o = officer-voted points elections
```

Five teams, two team elections, one officer election gives 11 — odd, no pairwise
ties. Drop the officer election and it is 10, where ties become possible. **This
cannot be guaranteed at design time**, because `n` varies competition to competition and
is not yours to choose.

More importantly, **no pairwise ties does not imply a unique Copeland winner**. A
tournament in which every pair is decisive can still tie every team on score:

> A beats B, B beats C, C beats A. Every pair decisive; every team 1 win and 1
> loss; every Copeland score 0.

Any _regular_ tournament — each team winning as many head-to-heads as it loses —
does this, and regular tournaments exist for every odd team count from three up.
Odd parity makes them more available, not less.

Cycles are less likely when preferences genuinely correlate, which they usually
do when one implementation is plainly better. But "usually" is not something to
build a points system on, which is why step 3 exists and is guaranteed rather
than probable.

**Step 3 is a dedicated officer election**, created automatically for every
competition and flagged as the tiebreaker. It awards no points and exists
only to be a complete ordering of every team. Because a single ranking is a total
order, it always separates any two teams — so the chain terminates without ever
needing an in-the-moment officer decision.

> **The tiebreak ballot must exist before a competition can be finalized.** It is the
> only step guaranteed to resolve, and it is the one somebody will forget to cast
> because it usually is not needed. The tally must **block finalization with an
> explicit "officer tiebreak ballot required" state** rather than silently picking
> a winner or leaving a tie unresolved.

## Ballot privacy

Ballots are **officer-visible, not public**. A lead can see their own team's
ballot; officers with the permission can read any ballot to investigate a
dispute; nobody else sees anything but the result.

Full secrecy was considered and rejected: with a handful of ballots, a disputed
count that cannot be re-examined is a dispute that cannot be resolved.

### The officer tiebreak ballot discloses one comparison, not an ordering

The officers' tiebreak ranking is cast for every competition and used in almost none
of them. It is **never published as a ranking**. When it decides a tie, the only
thing revealed is the relation it was actually used for:

> Officers ranked **Team Lantern** above **Team Marble**.

Not the full order, not where either team sits overall, not anything about teams
that were not tied. If three teams tie, the chain among those three is disclosed
and nothing else.

**Disclose by writing, not by filtering.** The tally records the comparisons it
used into a dedicated table; the public read is of that table, never of the
ballot with a filter applied. A read-time filter is one refactor away from
leaking the whole ordering, whereas a materialized disclosure can only ever
contain what the tally deliberately put there.

```sql
platform."tiebreakDisclosures" (
  "competitionId"    uuid not null references platform.competitions(id) on delete cascade,
  "higherTeamId" uuid not null references platform.teams(id) on delete cascade,
  "lowerTeamId"  uuid not null references platform.teams(id) on delete cascade,
  primary key ("competitionId", "higherTeamId", "lowerTeamId"),
  check ("higherTeamId" <> "lowerTeamId")
);
```

> **The tiebreak election must not write `electionResults`.** Those rows are
> publicly readable once tallied, so tallying the tiebreak like any other election
> would publish the officers' complete ordering as placements — exactly what this
> rule exists to prevent. Its ranking is consumed directly by the standings
> computation, and only the used comparisons are written out.

One accepted residue: each disclosure leaks one bit about the officer ordering,
so a season of frequent ties would gradually reveal a good deal of it. At the
expected rate — most competitions never reach step 3 — that is not worth engineering
against.

Two narrow permissions:

| Column             | Grants                                           |
| ------------------ | ------------------------------------------------ |
| `canVoteAsOfficer` | Submit or revise the officers' collective ballot |
| `canAuditBallots`  | Read individual ballots and the pairwise matrix  |

Election _configuration_ needs no platform permission — it happens in Airtable,
and base access is the permission. Same reasoning that removed `canManageEvents`.

## Who does what, and where

| Action                                | Surface      | Why                                          |
| ------------------------------------- | ------------ | -------------------------------------------- |
| Create award categories               | **Airtable** | Officer-authored config                      |
| Set open/close times                  | **Airtable** | Same                                         |
| Set a competition's requirement count | **Airtable** | Officer-authored, keyed to a competition     |
| Grade requirements met, per team      | **Airtable** | Officer-authored, keyed to a team            |
| Cast a team ballot                    | **Platform** | Member-facing, keyed to a team and a lead    |
| Cast the officers' ballot             | **Platform** | Needs the same ranking UI and audit trail    |
| Run the tally                         | **Cron**     | Fires at `closesAt`; nobody presses a button |

Grading is **the one officer input the tally cannot proceed without**, and it is
keyed to a team rather than a member — so it stays inside the line Airtable can
already reach, unlike attendance.

The per-competition tiebreak election is created by the sync, not authored — every
competition gets exactly one, so it cannot be forgotten at configuration
time. (It can still be forgotten at _voting_ time, which is what the blocking
state above is for.)

## Schema

```sql
create type platform."electionElectorate" as enum ('teams', 'officers');
create type platform."electionPurpose"    as enum ('points', 'tiebreak');
create type platform."electionStatus"     as enum
  ('draft', 'open', 'closed', 'tallied');

platform.elections (
  id                 uuid primary key,
  "competitionId"        uuid not null references platform.competitions(id),
  slug               text not null,
  title              text not null,
  electorate         platform."electionElectorate" not null,
  purpose            platform."electionPurpose" not null default 'points',
  "opensAt"          timestamptz not null,
  "closesAt"         timestamptz not null,
  status             platform."electionStatus" not null default 'draft',
  "airtableRecordId" text unique,            -- null for the generated tiebreak
  unique ("competitionId", slug),
  unique (id, electorate),        -- exists only to back the composite FK below
  check ("closesAt" > "opensAt"),
  check (purpose = 'points' or electorate = 'officers')
);

-- Exactly one tiebreak election per competition.
create unique index on platform.elections ("competitionId")
  where purpose = 'tiebreak';

-- A ballot is cast either by a team (team elections) or by an officer on behalf
-- of all officers (officer elections). Never both -- and which one it is follows
-- from the election, not from the caller. See below.
platform.ballots (
  id            uuid primary key,
  "electionId"  uuid not null references platform.elections(id) on delete cascade,
  electorate    platform."electionElectorate" not null,
  "teamId"      uuid references platform.teams(id) on delete cascade,
  "castBy"      uuid not null references auth.users(id),
  "castAt"      timestamptz not null default now(),
  foreign key ("electionId", electorate)
    references platform.elections(id, electorate) on update cascade,
  check (
    (electorate = 'teams'    and "teamId" is not null) or
    (electorate = 'officers' and "teamId" is null)
  )
);

-- One ballot per team in a team election...
create unique index on platform.ballots ("electionId", "teamId")
  where "teamId" is not null;
-- ...and exactly one ballot in an officer election.
create unique index on platform.ballots ("electionId")
  where "teamId" is null;

platform."ballotRankings" (
  "ballotId"        uuid not null references platform.ballots(id) on delete cascade,
  rank              smallint not null,       -- 1 = first preference
  "candidateTeamId" uuid not null references platform.teams(id) on delete cascade,
  primary key ("ballotId", rank),
  unique ("ballotId", "candidateTeamId"),
  check (rank >= 1)
);

platform."electionResults" (
  "electionId" uuid not null references platform.elections(id) on delete cascade,
  "teamId"     uuid not null references platform.teams(id) on delete cascade,
  placement    smallint not null,       -- ties share a placement; see below
  "bordaScore" integer not null,
  scaled       numeric(10,9) not null,  -- bordaScore / (V × (n−1)), in [0,1]
  primary key ("electionId", "teamId"),
  check (scaled >= 0 and scaled <= 1)
);

-- The pairwise matrix behind step 2, kept so a disputed tiebreak can be replayed.
platform."pairwiseTallies" (
  "competitionId"  uuid not null references platform.competitions(id) on delete cascade,
  "teamA"      uuid not null,
  "teamB"      uuid not null,
  "aOverB"     integer not null,
  "bOverA"     integer not null,
  primary key ("competitionId", "teamA", "teamB")
);

platform."competitionStandings" (
  "competitionId"          uuid not null references platform.competitions(id) on delete cascade,
  "teamId"             uuid not null references platform.teams(id) on delete cascade,
  "requirementsMet"    smallint not null,   -- copied from teams at tally time
  "requirementCount"   smallint not null,   -- copied from competitions at tally time
  "requirementPoints"  integer not null,
  "electionPoints"     integer not null,
  "totalPoints"        integer generated always as
                         ("requirementPoints" + "electionPoints") stored,
  placement            smallint not null,
  "resolvedBy"         text,   -- 'points' | 'copeland' | 'officer-tiebreak'
  primary key ("competitionId", "teamId"),
  check ("requirementsMet" <= "requirementCount"),
  check ("totalPoints" between 0 and 1000)
);
```

`resolvedBy` records **which step decided each placement**. When a team asks why
it placed second, the answer should be a stored fact rather than a re-derivation.

The two `requirement*` counts are **copied here, not joined**. Standings are a
published result, and a later correction to a team's grade must not silently
rewrite the arithmetic behind a competition that already announced a winner — it
should produce a visible re-tally. Storing the inputs alongside the output is
what makes "550 out of 600" reproducible from the row itself.

### Placement ties are legitimate now

`electionResults` **has no `unique (electionId, placement)`**, which it needs to
lose: two teams can tie exactly on Borda score, and under the old schedule that
was a problem because placement determined points. It no longer does. Tied teams
share a placement, take identical `scaled` values, and earn identical points —
so the tie needs no resolution at the election level at all.

Competition **standings** are a different matter, and that is what the tiebreak chain
above is for.

### Lifetime points per member

A member's points are their teams' points. Derived, so it is a view — the same
rule that governs [stars](./meetings-and-teams.md#stars-are-derived-never-stored):

```sql
create view platform."memberPoints"
with (security_invoker = on) as
select
  tm."userId",
  sum(st."totalPoints")::bigint as "lifetimePoints",
  count(*)::integer             as "competitionsScored"
from platform."teamMembers" tm
join platform."competitionStandings" st on st."teamId" = tm."teamId"
group by tm."userId";
```

**`security_invoker = on` is load-bearing.** Views run as their owner by default,
which would make this one a hole straight through the `competitionStandings` policy
that hides standings until a competition is finalized — publishing a running total
mid-tally, and with it the shape of an unannounced result. With invoker
semantics the view sums only rows the reader may already see, so every reader
gets the same number and nobody gets an early one.

Joining on `"teamId"` alone is sufficient and cannot double-count: `teamMembers`
carries `unique ("userId", "competitionId")`, so a member holds at most one team per
competition and therefore contributes to at most one standings row per competition.

`competitionsScored` is not needed for the total. It is there because the
total's obvious complaint — that it rewards showing up often more than doing well
— is answered by a per-competition average, and that average should not require a
second view to compute.

Two things this view is deliberately not:

- **Not a ranking.** Competitions vary in team count and difficulty, and a member who
  competed five times outscores a stronger member who competed twice. It is a
  participation-weighted total, which is fine for a profile badge and wrong for
  anything that decides something.
- **Not retroactively stable.** A re-tally moves it. That is correct behaviour
  for a derived number and another reason not to attach stakes to it.

Add a covering index on `teamMembers ("userId", "teamId")`; profile renders are
the only read path and they are all keyed by user.

Requiring complete ballots means `ballotRankings` always holds exactly one row per
candidate per ballot — worth asserting at write time, since a partial ballot would
silently distort a Borda sum rather than fail.

### Why `electorate` is denormalized onto the ballot

The rule is "a team ballot has a team, an officer ballot does not" — but _which
kind_ a ballot is lives on the **election**, one table away, and a `check`
constraint cannot read another table. Written against `ballots` alone the rule has
nothing to test, which is how the obvious spelling ends up being a constraint that
can never fail:

```sql
check (num_nonnulls("teamId") <= 1)   -- ✗ one argument, so always true
```

Copying `electorate` onto the ballot gives the check both halves of the
comparison, and the composite foreign key into `elections(id, electorate)` keeps
the copy honest — a ballot cannot claim an electorate its election does not have.
Same move as `competitionId` on `teamMembers` and `ownerRole` on `teamEnvironments`:
denormalize the discriminator so a constraint can see it, then use a composite key
so the denormalized copy cannot drift.

`on update cascade` is deliberate. An electorate should not change once ballots
exist, but if one is corrected before voting opens, the ballots should follow
rather than block the correction.

A trigger, or validation in the action that casts a ballot, was the alternative
and is weaker for the usual reason: it holds only as long as every write path
remembers it, and a mis-typed ballot is invisible until the tally miscounts a
category without complaining. That argument gets **stronger**, not weaker, now
that writes are server actions rather than `security definer` functions — the
constraint is the only thing left that a forgetful caller cannot skip. See
[Writes are server actions](./meetings-and-teams.md#writes-are-server-actions-not-rpcs).

## Implementation

### Migrations

| #   | File                                     | Contents                                                                                                     |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `<ts>_platform_election_permissions.sql` | `canVoteAsOfficer`, `canAuditBallots`, policy updates                                                        |
| 2   | `<ts>_platform_elections.sql`            | Enums, `elections`, `ballots`, `ballotRankings`                                                              |
| 3   | `<ts>_platform_election_results.sql`     | `electionResults`, `pairwiseTallies`, `tiebreakDisclosures`, `competitionStandings`, the `memberPoints` view |

These land after `<ts>_platform_teams.sql`, which supplies the `teams` keys.
There is no RPC migration: casting a ballot and recording a tally are server
actions over Drizzle, for the reason given in
[Meetings & Teams](./meetings-and-teams.md#writes-are-server-actions-not-rpcs).

### RLS

| Table                  | Client access                                            |
| ---------------------- | -------------------------------------------------------- |
| `elections`            | ✅ select all                                            |
| `ballots`              | ✅ own team only; officers via `canAuditBallots`         |
| `ballotRankings`       | ✅ own team's ballot only; same officer path             |
| `electionResults`      | ✅ once `status = 'tallied'`; **never for the tiebreak** |
| `pairwiseTallies`      | ❌ officers only                                         |
| `tiebreakDisclosures`  | ✅ select all — this is the disclosure surface           |
| `competitionStandings` | ✅ select once the competition is finalized              |
| `memberPoints`         | ✅ select all — inherits the row above via invoker       |

Results gate on `status = 'tallied'` so a partial count never leaks mid-tally.

The tiebreak election is the exception that needs enforcing rather than
remembering: it writes **no** `electionResults` rows at all, so there is nothing
for a policy to have to exclude. Assert it in the tally and in a test — a rule
that depends on nobody adding the obvious `insert` later is not a rule.

### The tally is pure TypeScript

`apps/platform/src/server/elections/tally.ts` — pure functions over plain arrays,
no database access:

```ts
borda(ballots: Ballot[], candidates: TeamId[]): Score[]
copeland(ballots: Ballot[], candidates: TeamId[]): PairwiseMatrix

// 600 × met / total, or 1000 when the competition has no points elections.
requirementPoints(met: number, total: number, ceiling: number): number

// Σ (ceiling / k) × scaled, rounded once at the end.
electionPoints(results: ScaledResult[], k: number, ceiling: number): number

standings(elections: TalliedElection[], grades: Grade[],
          tiebreak: Ballot): Standing[]
```

Passing the `ceiling` in rather than hardcoding 600 and 400 is what makes the
renormalization rule testable — the absent-block cases are then just calls with
`ceiling = 1000`, not a separate code path.

The interesting cases are all degenerate — every team self-ranking, exact point
ties, Condorcet cycles, a two-team competition — and those are trivial to write as
table-driven tests against a pure function. A thin server action persists what
the functions return, inside one `db.transaction()` so a partial tally cannot be
observed.

**Purity is what makes this safe to move out of Postgres.** The tally reads its
inputs, computes, and writes — none of which needs to happen in the database to
be correct, and all of which is easier to test as functions over arrays than as
PL/pgSQL. What does stay in the database is every constraint the tally writes
against: the tiebreak's partial unique index, the `scaled` range check, and the
one-winner-per-competition index are what make a buggy tally fail loudly instead
of publishing a second winner.

**Scaling happens in TypeScript, not Postgres**, so the numbers a team sees come
from the same code the tests cover. `electionResults.scaled` is a record of what
was computed, never a generated column.

**Determinism is a tested property**, not an aspiration: every fixture is tallied
twice and the results compared.

### Application layer

| Path                              | Contents                                        |
| --------------------------------- | ----------------------------------------------- |
| `server/elections/tally.ts`       | Borda, Copeland, scoring, standings             |
| `server/elections/tally.test.ts`  | Table-driven, degenerate cases first            |
| `server/elections/runTally.ts`    | The cron entry: find closed elections, tally    |
| `server/elections/ballotOrder.ts` | The persisted per-ballot shuffle                |
| `server/actions/elections.ts`     | Cast or revise a ballot                         |
| `server/loaders/elections.ts`     | Open elections, own ballot, results             |
| `server/loaders/points.ts`        | Standings breakdown; `memberPoints`             |
| `app/(site)/vote/[slug]/page.tsx` | The ranking UI, per-ballot shuffle              |
| `server/airtable/sync.ts`         | Categories in; requirement counts and grades in |

**Ballots are revisable until `closesAt`.** Re-casting replaces the ranking and
updates `castAt`, so a lead who mis-ordered a drag-and-drop is not stuck with it.

The shuffle seed is **per ballot and persisted**, not regenerated per page load —
otherwise the order changes under a lead who reloads mid-ranking.

### The tally cron

Every 5 minutes: find elections with `status = 'open'` and `closesAt < now()`,
Borda each, write results. Then for each competition whose elections have all closed,
compute standings — points, then Copeland, then the officer tiebreak — and write
the `teamAwards` winner row.

Two requirements:

- **Idempotent.** A re-run over an already-tallied election is a no-op, not a
  second winner row.
- **Blocks on a missing tiebreak ballot** where one is needed, surfacing the
  competition as requiring attention rather than finalizing on a coin flip.
- **Blocks on an ungraded competition** — a null `competitions."requirementCount"`, or
  any competing team with a null `teams."requirementsMet"`, holds finalization in
  the same way. Both surface as an explicit state; neither is defaulted to zero,
  which would publish a wrong winner rather than a visible gap.

### Tests

- **Degenerate cases first** — every team self-ranks; exact point ties; a
  Condorcet cycle that ties every Copeland score and must fall through to step 3;
  a two-team competition; a competition where the tiebreak ballot is missing and a tie
  exists.
- **The worked example** — 11 of 12 requirements is exactly 550. Cheap to assert
  and it pins the rounding direction.
- **A perfect competition totals exactly 1000** — all requirements met, ranked first
  on every ballot of every category. Run it at `k = 1, 2, 3` so the
  round-once-per-block rule is what is being tested; rounding per election makes
  `k = 3` return 999.
- **Renormalization** — the same team scores 1000 with `k = 0` and with
  `requirementCount = 0`, and a null `requirementCount` blocks finalization
  rather than scoring 0 or 1000.
- **Margins survive scaling** — two fixtures differing by one Borda point produce
  point totals that differ by less than the block, which is the property min-max
  scaling would have destroyed.
- **Self-ranking is order-preserving** — a fixture where every team self-ranks
  first yields the same placements as one where none do, and the point _gaps_
  stay proportional.
- **Ballot completeness** — a partial ballot is rejected at write time.
- **Shuffle stability** — the presented order is identical across reloads of the
  same unsubmitted ballot.
- **Disclosure minimality** — a competition decided at step 3 writes exactly one
  `tiebreakDisclosures` row per tied pair and **zero** `electionResults` rows for
  the tiebreak election. Assert both, since this is the rule most likely to be
  broken by a well-meaning refactor.
- **Determinism** — every fixture tallied twice, compared.
- **Idempotency** — the cron pass run twice produces one winner row.
- **RLS personas** — a lead cannot read another team's ballot; an officer without
  `canAuditBallots` cannot either; results are invisible before `tallied`.

## Open questions

- **None outstanding.** The method, both electorates, the tiebreak chain, and the
  disclosure rule are settled.

## See also

- [Meetings & Teams](./meetings-and-teams.md) — competitions, teams, awards, and the
  Airtable officer surface elections are configured through.
