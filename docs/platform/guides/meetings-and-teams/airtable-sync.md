---
name: Airtable Sync
description: Where competitions and members come from — Airtable as the CMS for what is left, Postgres as the source of truth, how record ids keep identity through edits, and the refusals that protect credit people already earned.
order: 6
---

# Airtable Sync

**Airtable is the CMS for competitions and members. Postgres is the source of truth.** Officers author competitions in a base; a pass every fifteen minutes projects them into Postgres, and everything the platform derives hangs off the Postgres rows. Meetings and workshops moved off this pull — read
[Config-as-code](/docs/platform/guides/meetings-and-teams/club-config) for
where those two come from now. This page covers what Airtable still owns.
Read it before adding a synced field or changing `server/airtable/`; for the
exported functions, see the generated
[`server/airtable`](/docs/platform/reference/server/airtable) reference, and
for scaffolding the base itself, the
[Airtable guides](/docs/platform/guides/airtable).

The split exists because `attendance."meetingId"` needs something that keeps its identity through an edit. Airtable gives non-technical editors typed fields, linked records and forms; it cannot give referential integrity.

## What lives where

Four integration tables, and the direction is **per field, never per table**:

| Table                 | Officers author                                                                          | The platform writes                                         |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Competitions**      | Branch slug, Workshop _(link, by the workshop's old Airtable record id)_, Judging starts | ⚙️ Platform ID, ⚙️ Teams, ⚙️ Sync status                    |
| **Members**           | Dues paid                                                                                | ⚙️ Platform ID, UGA email, Legal name, ⚙️ Meetings attended |
| **Attendance**        | —                                                                                        | authoritative meeting attendance projection                 |
| **Platform Settings** | reflection word minimum and submission window                                            | ⚙️ Platform ID, ⚙️ Sync status                              |

One rule governs the right-hand column: **push only fields the platform owns exclusively, and never create a field both sides write.** Two writers have no conflict-resolution story, and last-writer-wins destroys work silently. The `⚙️` prefix warns officers off a field; the field editing permissions set by hand enforce it.

> [!NOTE]
> There used to be a fifth table here, **Teams**, push-only, mirroring each team's name, member count and PR entry state. The platform redesign's teams-core step made teams persistent and competition-independent, so a team no longer has the one `competitionId` this table's rows were keyed on, and `⚙️ Teams` (the count on the Competitions row above) is a stub reading 0 until the competitions step gives it a new source. The Teams table itself, and its registry entry (`pushTeams` in `server/airtable/push.ts`), were deleted; the Airtable table is left for an officer to remove from the base by hand, the same by-hand cleanup the scoring fields got.

The **Meetings**, **Workshops** and **Projects** tables still exist in the base — officers should not edit them any more, and nothing reads from them. They are deleted from the base itself, along with the rest of the Airtable integration, in the final teardown step once nothing else reads or writes Airtable.

No integration table lets a form create rows anymore: Attendance is a
read-only projection, with no officer override or correction subsystem behind
it. Reflections never reach Airtable at all — they stay on the platform,
export-only. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance).

<details>
<summary>Which surface does a given officer task belong to?</summary>

Only officers have Airtable access, so the base is the officer console for anything it can hold — an admin screen not built is a screen not maintained. The line is not "officer-only work", it is **what Airtable can key a row to**.

| Task                                            | Where                                                |
| ----------------------------------------------- | ---------------------------------------------------- |
| Create or edit a meeting or a workshop          | A pull request against `@devdogsuga/club-config`     |
| Open a competition, by linking its workshop     | Airtable                                             |
| Set `Judging starts`                            | Airtable                                             |
| Record dues                                     | Airtable                                             |
| Give a team a named award, including the winner | Platform — `awardTeam`                               |
| Run a pass now                                  | Either — `requestAirtableSync`, or the base's button |

`awardTeam` needs a competition and a team identity that Airtable holds only as a mirror on the competition side (teams themselves are git-native now — see [Teams](/docs/platform/guides/meetings-and-teams/teams) — and are not in this base at all), and is a server action gated on the same permission as roster edits, except the sync trigger, which has its own. Scoring is off-platform, so there is no tally to write the `winner` award: an officer records it through `awardTeam`, the same action that gives any other named award.

</details>

## Identity survives editing

Every synced row carries `airtableRecordId` — unique on `competitions`, partially unique on `attendance`. `meetings` and `workshops` carry the column too, but only for the migrated rows: each kept its old Airtable record id as its **`configId`**, so a competition's `Workshop` link (still an Airtable record id) resolves to the right platform row without a pull of its own — `pullCompetitions` looks it up by `configId`, not by a fresh `airtableRecordId` match. Record ids survive renames, field edits and view re-sorts, so retitling a competition updates a row rather than orphaning the teams pointing at it. Matching on name or slug would break the first time somebody fixed a typo, and break in the worst way: a second row that looks right while the earned credit stays on the first.

## One pass

The cron fires `*/15 * * * *` at `/airtable/sync`; `requestAirtableSync()` runs the same `runAirtableSync` for an officer holding `canTriggerSync`, and an Airtable button field reaches the route because a button can only open a URL. One implementation, because the manual path is the one reached for when something has already gone wrong.

1. **Verify the base against the registry** before anything is written: a field id that no longer exists is not an error at write time — Airtable accepts the request, the value lands nowhere, and the pass reports success. A drifted base refuses to sync, alerting Sentry once.
2. **Claim the lease**, or return `already_running`; a manual run inside the cooldown returns `rate_limited`.
3. **Ensure and pull Platform Settings**, retaining the previous policy when an
   officer enters an invalid value.
4. **Pull Competitions**, resolving each `Workshop` link against `workshops.configId`.
5. **Push** Members, Attendance, and derived counts.
6. **Write refusals** into each record's `⚙️ Sync status`, release the lease,
   and advance `lastSyncedAt` only if the pass completed.

A missing officer-authored competition is a **soft archive**: `deletedAt` is
set, the row leaves the site, and attendance survives. Platform-authored
Attendance rows are recreated by the next push if their Airtable projections
are removed. Meetings and workshops archive the same
way, but through the config reconcile now — see
[Config-as-code](/docs/platform/guides/meetings-and-teams/club-config).

## The rules that protect credit

A refusal is per **field**, not per record: fixing a title and moving `Judging starts` in one edit applies the one and complains about the other. The reason is written back where the edit was made, because otherwise a refused edit looks exactly like a sync that has not run yet.

| Refused                                                      | Because                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `Judging starts` at or before the opening workshop's meeting | It cannot precede the session that announces the competition |
| A competition Title over 80 characters                       | It cannot go on a public page as written                     |

> [!NOTE]
> A third rule, `judging_moved_after_freeze`, still exists in `refusals.ts` and still has a code and a message, but it never fires: the fact it reads (`participationFrozen`, "has any team's entry been frozen") was computed from `teams."competedAt"`, which the platform redesign's teams-core step dropped along with the rest of the old per-competition team model. `Judging starts` can move freely, even after judging, until the competitions step reintroduces a freeze signal from the git-native competition-entry mirror.

`Judging starts` protects **history** (or would, once the freeze signal the note above describes returns). The title length is a different kind — nothing is at risk, the value simply cannot be published — so the refused field is dropped from the write rather than blanked, and whatever was already up stays up until the replacement fits.

If a write is rejected for a reason no rule here anticipates, that **one row** is skipped and says so in its own `⚙️ Sync status`; the rest of the pass runs normally. Refusals gathered before any failure are still written back — the status write happens outside the pass's error boundary, so a pass that dies partway still reports what it learned.

The equivalent rules for meetings and workshops — summary/title/description lengths, the RSVP-host allowlist, cancellation reason↔date pairing — are not refusals any more. They moved to `@devdogsuga/club-config`'s validator, which runs at CI time instead of on a schedule; see
[Config-as-code](/docs/platform/guides/meetings-and-teams/club-config).

## Why it's like this

<details>
<summary>Why a lease row rather than a Postgres advisory lock?</summary>

The design called for `pg_try_advisory_lock` held for the duration of a pass, and that does not survive contact with how these apps connect. Session-scoped locks bind to a backend connection, but the apps connect through Supabase's transaction-mode pooler, which hands a different backend to each transaction — so the unlock can land on a different backend, silently return false, and leak the lock until something recycles the pool. Transaction-scoped locks release correctly but only by ending the transaction, which would mean holding one open across every Airtable HTTP call in the pass; an idle-in-transaction connection for that long is what exhausts a pooler.

A lease row has neither problem. It is ordinary MVCC, so it does not care which backend serves which statement, and its correctness comes from an expiry rather than from a connection staying alive — which also covers the case an advisory lock genuinely handles better, a worker killed mid-pass. `LEASE_MINUTES` is 10.

The manual cooldown — `MANUAL_COOLDOWN_SECONDS`, one run a minute whoever asks — is deliberately **global** rather than per caller: what it protects is the Airtable call allowance, which is a shared workspace resource, and five officers each entitled to a run a minute is five times the load justified by a rule that reads as if it prevented load. The button is also the kind of thing that gets clicked four times when it appears not to work.

</details>

<details>
<summary>Why poll every fifteen minutes instead of subscribing to webhooks?</summary>

Airtable does offer webhooks, but they expire on a seven-day refresh cycle and deliver cursor-based payloads that have to be replayed in order — real complexity for a club calendar that changes a few times a week. Polling a base this small has no failure mode more exotic than "runs again in fifteen minutes", and the manual trigger covers the case where fifteen minutes is too long to wait: an officer fixing a Judging starts time ten minutes before it matters should not have to.

One pass is seven list calls plus a schema read, and the pushes on top of whatever changed. The repository's own estimates of what that costs disagree — `cloudflare/scheduled.ts` reckons about five requests a pass and roughly 13% of the monthly call allowance, `run.ts` says roughly seven — so read the percentage as an order of magnitude rather than a measurement.

**The allowance is per workspace, not per base.** Whatever else the club keeps in Airtable — dues tracking, project management — spends the same budget, so the sync's headroom is not its own, and a base in its own workspace is what isolates it. The per-base rate limit is a separate thing and universal: it does not lift with the plan, so the client backs off exponentially on a 429 at every tier.

</details>

<details>
<summary>Where does the sync's Airtable token come from?</summary>

`AIRTABLE_SYNC_PAT`, from the environment. It was moved out of Supabase Vault — where it lived as `airtable_pat` — on 2026-08-19, which bought one storage mechanism instead of two, made the copy on the Worker visible to `env audit`, and put the token on the same Bitwarden → GitHub → Worker path as every other secret.

What that traded away is worth knowing before somebody needs it in a hurry: an officer can no longer rotate the token from the console without a deploy. Rotation is Bitwarden, then `env push`, then the next deploy's secrets file. A base the platform has no token for still does not fail a boot — the pass returns `not_configured` and touches nothing, because the platform has to run without Airtable. It is no longer _silent_, though: a **scheduled** pass in that state records `not_configured` on the state row the console reads and alerts Sentry once, on the transition, exactly as a drifted base does.

That distinction only became available when the base id became a committed constant. Before it, "no token" and "nobody has configured this yet" were indistinguishable — an unset base id looked like a fresh clone — so the branch stayed quiet to avoid claiming a base had been contacted when none had. Now the token is the only thing that can be missing, and a cron finding none is a misconfiguration. Manual runs are exempt: `requestAirtableSync` returns the reason to the console on screen, and alerting there would fire on a button press.

</details>
