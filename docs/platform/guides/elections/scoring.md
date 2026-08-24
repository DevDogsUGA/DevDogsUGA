---
name: Scoring
description: The Borda count, the 1000-point split between requirements met and scaled election results, what happens when a block is absent, and how the winner row is written.
order: 2
---

# Scoring

A competition is worth **1000 points**, split 600 for requirements met and 400 for election results, and the team with the most total points wins. This page is the arithmetic: how a ballot becomes a Borda score, how that score becomes points, and what the tally does when officers configure a competition with only one of the two blocks. Read it before changing `tally.ts` or anything that renders a standings row. If you only want the exported signatures, use the generated [`server/elections`](/docs/platform/reference/server/elections) reference.

## Borda

Each ballot ranks **every** candidate. A rank of _r_ among _n_ candidates scores _n − r_ points, summed across every ballot in the election. Highest total places first, and `assignPlacements` is dense-then-skip: two teams tied at 2 puts the next at 4.

Candidates are **every team in the competition**, while the ballot only offers teams that submitted. A team that never entered is therefore a candidate scoring zero, placed last, and still counted in the ceiling below.

Placement ties at the election level need no resolution. `electionResults` deliberately has no `unique ("electionId", placement)` — tied teams share a placement, take identical `scaled` values, and earn identical points. Competition standings are a different matter; that is what [the tiebreak chain](/docs/platform/guides/elections/ties-and-privacy) is for.

## The two blocks

```
600   requirements met      600 × met / total
400   election results      sum over elections of (400 / k) × scaled
─────
1000  competition total
```

The blocks measure different things on purpose. Requirements are **objective and self-determined** — a team that does the work earns them regardless of what anyone else built. Elections are **comparative**, earnable only at another team's expense. Weighting the objective block higher keeps the bulk of a team's score in its own hands.

The ceilings are `REQUIREMENT_CEILING`, `ELECTION_CEILING` and `TOTAL_CEILING` in `tally.ts`, passed in as arguments rather than hardcoded inside the two point functions — which is what makes the renormalization below a call with a different number instead of a separate code path.

### 600 — requirements

Officers enter two numbers: how many hard requirements the competition had (`competitions."requirementCount"`, pulled from Airtable) and how many each team met (`teams."requirementsMet"`, likewise).

```
requirementPoints = round(600 × met / total)
```

Twelve requirements with eleven met is **550**. The scale is linear, with no threshold and no bonus. A total of zero or less scores zero rather than dividing.

### 400 — elections

Every points election in the competition is weighted equally, so with `k` of them each is worth `400 / k`. Within an election a team's share is its Borda score over the largest score the election could have produced:

```
                    B                 B   = the team's Borda score
scaled  =  ─────────────────────      V   = ballots cast in this election
              V × (n − 1)             n   = candidate teams

electionPoints = round( Σ over elections of (400 / k) × scaled )
```

`V × (n − 1)` is what a team ranked first on **every** ballot would score, so `scaled` runs 0 to 1 and the block is worth exactly 400 to a team that sweeps every category unanimously. A ceiling of zero — one team, or an election nobody voted in — yields `scaled = 0` rather than a division by zero.

Both `round`s apply to the **block totals, not per election**. Rounding three elections separately would cap a perfect team at 399. `scaled` is stored as `numeric(10,9)` with a `check (scaled >= 0 and scaled <= 1)`, computed in TypeScript rather than as a generated column, so the numbers a team sees come from the code the tests cover.

## When a block is absent

Weights renormalize so **1000 stays the ceiling** — a team should never face a competition it cannot max out because of how officers configured it.

| Situation                                | Result                          |
| ---------------------------------------- | ------------------------------- |
| No points elections (`k = 0`)            | Requirements are worth **1000** |
| `requirementCount = 0` (none by design)  | Elections are worth **1000**    |
| Both absent                              | Every team scores 0             |
| `requirementCount` is **null**           | Finalization **blocks**         |
| Any team's `requirementsMet` is **null** | Finalization **blocks**         |

The last two rows are the important ones. Null means _officers have not graded yet_, which is a data-entry gap rather than a competition without requirements — so `standings` returns `{ status: "blocked", reason: "ungraded" }` instead of scoring it. Zero has to be entered deliberately. `blockedCompetitions()` surfaces both this and a missing tiebreak ballot for the console, so neither is left in a cron log.

## The winner is computed

The tally pass runs in two halves. First, every election with `status = 'open'` and `closesAt` in the past is counted — Borda for a points election, nothing written for a tiebreak — and flipped to `'tallied'`; that status is the guard that makes a re-run a no-op. Then every competition whose elections have all been tallied is finalized inside one `db.transaction()`, so a partial tally cannot be observed — and an existing `competitionStandings` row is the guard against a second pass writing a second winner.

Finalizing writes `competitionStandings`, `pairwiseTallies`, any `tiebreakDisclosures`, and the `teamAwards` row with `category = 'winner'` and a **null `awardedBy`**: this row is arithmetic, and there is no officer to name. Officers still author named side awards themselves, because an honourable mention is a judgement rather than a sum.

`competitionStandings` **copies** `requirementsMet` and `requirementCount` rather than joining them, so a later correction to a grade produces a visible re-tally instead of silently rewriting the arithmetic behind an announced winner. `totalPoints` is a stored generated column with `check ("totalPoints" between 0 and 1000)`.

## Why it's like this

<details>
<summary>Why Borda and not STV or another elimination method?</summary>

Three reasons, and the second is the load-bearing one.

**Self-ranking cancels.** Teams may rank themselves, and every team ranking itself first adds the same constant _n−1_ to everyone — leaving the ordering decided entirely by how teams ranked _each other_, which is the thing being measured. Under an elimination method the same behaviour produces a degenerate all-tied first round.

**It produces a magnitude, not just an order**, which is what the 400-point block needs: scaling requires a score to scale. Elimination methods yield only a sequence, and elimination order is a poor proxy for standing anyway — a broadly-liked team can go out early to vote-splitting despite more teams preferring it to the eventual winner.

**A team can check the result by hand.** With five ballots and five candidates, anyone can recompute their own score. That matters when the outcome assigns points that decide who wins.

Complete rankings are required for the same kind of reason. With a handful of candidates it is no burden, and it removes truncation strategy, ballot exhaustion, and any rule about how to score unranked teams.

</details>

<details>
<summary>Why normalize against the ceiling rather than against the field?</summary>

Min-max scaling — the leader takes the full share, the trailer takes zero — was rejected on two counts.

It has **no defined value when every team ties**, because the denominator is zero. And, worse, it **manufactures a decisive result from noise**: five teams within a single Borda point of each other would still be spread across the entire 400, and last place would score zero for losing by one rank.

Normalizing against what a unanimous first place would have scored means **margins survive**. Teams that finish close together score close together, which is the honest reading of a close vote.

</details>

<details>
<summary>Doesn't every team self-ranking first compress the range?</summary>

It does, and that is fine.

With one ballot per team, each team collects _n−1_ from its own ballot no matter what anyone thinks of it, so the realized range narrows to `[1/n, (n−1)/n]` of the block rather than the full `[0, 1]` — with four teams, roughly 100 to 300 points instead of 0 to 400.

That shift is uniform across teams, so it compresses every score identically and **changes no ordering and no relative margin**. The block simply carries less spread in a competition where everyone voted for themselves, which is a fair description of what those ballots contained.

The voter's own team is pinned first in the presented order for the same reason it is not filtered out: keeping it out of the way makes the deliberate act of demoting yourself visible rather than accidental.

</details>
