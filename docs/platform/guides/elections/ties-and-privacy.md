---
name: Ties & privacy
description: The three-step tiebreak that decides competition standings, who may read a ballot, and the single comparison the officer tiebreak ranking is allowed to disclose.
order: 3
---

# Ties & privacy

Two teams can land on the same total to the point. This page is how the tally separates them, and how it does that without publishing the officers' opinion of every team in the competition. Read it before touching `standings()` in `tally.ts`, the `tiebreakDisclosures` table, or any policy on an election table. If you are only after the point arithmetic, that is [Scoring](/docs/platform/guides/elections/scoring); for exported signatures, the generated [`server/elections`](/docs/platform/reference/server/elections) reference.

## Three steps

Each step uses genuinely different information, and they are applied in order to each group of teams the previous step left tied:

| #   | Mechanism                                   | Resolves                     |
| --- | ------------------------------------------- | ---------------------------- |
| 1   | **Total points**                            | Almost always                |
| 2   | **Copeland** over all pooled points ballots | Head-to-head preference      |
| 3   | **The officer tiebreak ranking**            | Always — it is a total order |

Scaled scores look continuous enough to make step 1 seem decisive on its own. It is not: both blocks are rounded to whole points, and the requirements block is coarse by construction — twelve requirements can only land on multiples of 50. Two teams that met the same count and were voted on similarly collide exactly.

**Step 2 pools every ballot from every points election** — team-voted and officer-voted alike — into one pairwise matrix rather than running on a ballot of its own. Teams have already stated their preferences several times over; asking again adds fatigue without adding information. For each pair, `copeland` counts how many pooled ballots rank one above the other, and a team's score is wins minus losses. The tiebreak ballot is **excluded** from that pool: it is step 3, and pooling it into step 2 would leave both steps reading the same input.

**Step 3 is a dedicated officer election** with `purpose = 'tiebreak'`. `elections_one_tiebreak_per_competition` allows at most one per competition and `elections_tiebreak_is_officers` forces its electorate. It awards no points and exists only to be a complete ordering of every team, so it always separates any two of them.

`competitionStandings."resolvedBy"` records which step decided each placement — `'points'`, `'copeland'`, or `'officer-tiebreak'`. When a team asks why it placed second, the answer should be a stored fact rather than a re-derivation, and the results page renders exactly that sentence.

### It blocks rather than guessing

A tie that reaches step 3 with no tiebreak ballot cast returns `{ status: "blocked", reason: "missing_tiebreak" }`, and so does one whose tiebreak ranking omits a tied team — a ranking that does not name both cannot separate them. Nothing is written for that competition; `blockedCompetitions()` surfaces it for the console alongside ungraded competitions.

This is the step somebody will forget, precisely because it usually is not needed.

## Ballot privacy

Ballots are **officer-visible, not public**. Full secrecy was considered and rejected: with a handful of ballots, a disputed count that cannot be re-examined is a dispute that cannot be resolved.

| Table                  | Client read                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `elections`            | Anyone — which elections exist and when they open is public     |
| `ballots`              | Your own team's, or any with `canAuditBallots`                  |
| `ballotRankings`       | The same, through the ballot                                    |
| `electionResults`      | Anyone, once the election's `status = 'tallied'`                |
| `pairwiseTallies`      | `canAuditBallots` only                                          |
| `tiebreakDisclosures`  | Anyone — this is the disclosure surface                         |
| `competitionStandings` | Anyone, once one of the competition's points elections tallied  |
| `memberPoints`         | A view with `security_invoker = on`, so it inherits the row above |

Every table in that list is insert/update/delete-closed to clients by restrictive policies; the tally writes them server-side. Gating results on `'tallied'` is what stops a partial count leaking mid-pass.

Two narrow permission columns carry the rest, both resolved through `platform.has_permission`:

| Column             | Grants                                          |
| ------------------ | ----------------------------------------------- |
| `canVoteAsOfficer` | Submit the officers' single collective ballot   |
| `canAuditBallots`  | Read individual ballots and the pairwise matrix |

## What a tiebreak discloses

The officers' tiebreak ranking is cast for every competition and used in almost none of them, and it is **never published as a ranking**. When it decides a tie, the only thing revealed is the relation it was actually used for:

> Officers ranked **Team Lantern** above **Team Marble**.

Not the full order, not where either team sits overall, not anything about teams that were never tied. Three tied teams disclose the chain among those three — the tally writes one row per _adjacent_ pair in the resolved order — and nothing else.

**Disclosure happens by writing, not by filtering.** `standings()` returns the comparisons it used and the tally inserts them into `tiebreakDisclosures`; the public read is of that table, never of the ballot with a filter applied. A read-time filter is one refactor away from leaking the whole ordering, whereas a materialized disclosure can only ever contain what the tally deliberately put there.

The other half of the same rule: **a tiebreak election writes no `electionResults` rows at all.** `tallyClosedElections` inserts results only when `purpose === 'points'`. Those rows are publicly readable once tallied, so tallying the tiebreak like any other election would publish the officers' complete ordering as placements — exactly what this exists to prevent. There is consequently nothing for the `electionResults` policy to have to exclude.

One accepted residue: each disclosure leaks one bit about the officer ordering, so a season of frequent ties would gradually reveal a good deal of it. At the expected rate — most competitions never reach step 3 — that is not worth engineering against.

## Why it's like this

<details>
<summary>Why doesn't Copeland guarantee a unique winner, when the ballot count is odd?</summary>

Worth stating plainly, because the parity arithmetic invites the opposite conclusion.

Since rankings are complete, every pooled ballot expresses a strict preference for each pair, so a **pairwise** tie is possible exactly when the pooled ballot count is even:

```
pooled = n × k_t + k_o        n   = competing teams
                              k_t = team-voted points elections
                              k_o = officer-voted points elections
```

Five teams, two team elections and one officer election gives 11 — odd, so no pairwise ties. Drop the officer election and it is 10, where ties become possible. This cannot be guaranteed at design time, because `n` varies competition to competition and is not yours to choose.

More importantly, **no pairwise ties does not imply a unique Copeland winner.** A tournament in which every pair is decisive can still tie every team on score: A beats B, B beats C, C beats A gives every team one win and one loss, and every Copeland score is 0. Any _regular_ tournament does this, and regular tournaments exist for every odd team count from three up — odd parity makes them more available, not less.

Cycles are less likely when preferences genuinely correlate, which they usually do when one implementation is plainly better. But "usually" is not something to build a points system on, which is why step 3 exists and is guaranteed rather than probable.

</details>

<details>
<summary>Why keep <code>pairwiseTallies</code> at all if only officers can read it?</summary>

Because a disputed tiebreak has to be replayable without re-running the tally against ballots that may since have been corrected.

The matrix says how every team ranked every other team, in aggregate — which is the ballot privacy the disclosure table exists to avoid breaking — so it is gated on `canAuditBallots` rather than published. It is written for every finalized competition whether or not a tie occurred, since the cost is a handful of rows and the alternative is not having it on the one occasion it is wanted.

</details>
