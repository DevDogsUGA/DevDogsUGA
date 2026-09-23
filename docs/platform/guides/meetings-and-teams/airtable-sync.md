---
name: Airtable Sync
description: Where members still come from — Airtable as the CMS for the one table left, Postgres as the source of truth, and the refusals that protect credit people already earned.
order: 7
---

# Airtable Sync

**Airtable is the CMS for members. Postgres is the source of truth.** Officers author dues in a base; a pass every fifteen minutes projects them into Postgres, and everything the platform derives hangs off the Postgres rows. Meetings and workshops moved off this pull to config-as-code, and competitions moved off it to a GitHub Projects mirror — read
[Config-as-code](/docs/platform/guides/meetings-and-teams/club-config) and
[Competitions](/docs/platform/guides/meetings-and-teams/competitions) for
where those come from now. This page covers what Airtable still owns.
Read it before adding a synced field or changing `server/airtable/`; for the
exported functions, see the generated
[`server/airtable`](/docs/platform/reference/server/airtable) reference, and
for scaffolding the base itself, the
[Airtable guides](/docs/platform/guides/airtable).

The split exists because `attendance."meetingId"` needs something that keeps its identity through an edit. Airtable gives non-technical editors typed fields, linked records and forms; it cannot give referential integrity.

## What lives where

Three integration tables, and the direction is **per field, never per table**:

| Table                 | Officers author                               | The platform writes                                         |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| **Members**           | Dues paid                                     | ⚙️ Platform ID, UGA email, Legal name, ⚙️ Meetings attended |
| **Attendance**        | —                                             | authoritative meeting attendance projection                 |
| **Platform Settings** | reflection word minimum and submission window | ⚙️ Platform ID, ⚙️ Sync status                              |

One rule governs the right-hand column: **push only fields the platform owns exclusively, and never create a field both sides write.** Two writers have no conflict-resolution story, and last-writer-wins destroys work silently. The `⚙️` prefix warns officers off a field; the field editing permissions set by hand enforce it.

> [!NOTE]
> There used to be a **Competitions** table here, officer-authored (branch slug, a Workshop link, Judging starts), platform-written (`⚙️ Platform ID`, `⚙️ Teams`, `⚙️ Sync status`). The platform redesign's competitions step deleted its pull (`pullCompetitions` in `server/airtable/sync.ts`) and its refusal rules (`checkCompetition`/`checkCompetitionValues` in `refusals.ts`) — a competition is a GitHub issue mirror now, see [Competitions](/docs/platform/guides/meetings-and-teams/competitions). Before it, there was a push-only **Teams** table, mirroring each team's name, member count and PR entry state, deleted by the teams-core step for the same reason a team stopped being scoped to one competition. Both tables are left in the base for an officer to remove by hand, the same by-hand cleanup the scoring fields got.

The **Meetings**, **Workshops** and **Projects** tables still exist in the base — officers should not edit them any more, and nothing reads from them. They are deleted from the base itself, along with the rest of the Airtable integration, in the final teardown step once nothing else reads or writes Airtable.

No integration table lets a form create rows anymore: Attendance is a
read-only projection, with no officer override or correction subsystem behind
it. Reflections never reach Airtable at all — they stay on the platform,
export-only. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance).

<details>
<summary>Which surface does a given officer task belong to?</summary>

Only officers have Airtable access, so the base is the officer console for anything it can hold — an admin screen not built is a screen not maintained. The line is not "officer-only work", it is **what Airtable can key a row to**.

| Task                                       | Where                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Create or edit a meeting or a workshop     | A pull request against `@devdogsuga/club-config`                                                              |
| Create a competition draft, kick it off    | GitHub (the Competitions Project) — see [Competitions](/docs/platform/guides/meetings-and-teams/competitions) |
| Record dues                                | Airtable                                                                                                      |
| Merge a competition's winning pull request | GitHub — the merge itself is the record; nothing on the platform to run                                       |
| Run a pass now                             | Either — `requestAirtableSync`, or the base's button                                                          |

There is no platform action for naming a winner any more. `awardTeam`, an
officer-run server action that inserted a `teamAwards` row with
`category = 'winner'`, was deleted by the platform redesign's
competitions-lifecycle step: merging the winning pull request is already the
fact GitHub records, and `platform.competitionEntries."mergedAt"` already
mirrors it, so a second, hand-authored record of the same outcome was one
more place for the truth to live — and could disagree with it. See
[Competitions](/docs/platform/guides/meetings-and-teams/competitions).

</details>

## Identity survives editing

Every synced row carries `airtableRecordId`, partially unique on `attendance`. `meetings` and `workshops` carry the column too, but only for the migrated rows: each kept its old Airtable record id as its **`configId`**. Record ids survive renames, field edits and view re-sorts, so fixing a member's typo'd name updates a row rather than orphaning whatever pointed at it. Matching on name would break the first time somebody fixed one, and break in the worst way: a second row that looks right while the earned credit stays on the first.

## One pass

The cron fires `*/15 * * * *` at `/airtable/sync`; `requestAirtableSync()` runs the same `runAirtableSync` for an officer holding `canTriggerSync`, and an Airtable button field reaches the route because a button can only open a URL. One implementation, because the manual path is the one reached for when something has already gone wrong.

1. **Verify the base against the registry** before anything is written: a field id that no longer exists is not an error at write time — Airtable accepts the request, the value lands nowhere, and the pass reports success. A drifted base refuses to sync, alerting Sentry once.
2. **Claim the lease**, or return `already_running`; a manual run inside the cooldown returns `rate_limited`.
3. **Ensure and pull Platform Settings**, retaining the previous policy when an
   officer enters an invalid value.
4. **Push** Members, Attendance, and derived counts.
5. **Write refusals** into each record's `⚙️ Sync status`, release the lease,
   and advance `lastSyncedAt` only if the pass completed.

Platform-authored Attendance rows are recreated by the next push if their
Airtable projections are removed. Meetings and workshops archive through the
config reconcile now, and competitions through GitHub closing the issue — see
[Config-as-code](/docs/platform/guides/meetings-and-teams/club-config) and
[Competitions](/docs/platform/guides/meetings-and-teams/competitions).

## The rules that protect credit

A refusal is per **field**, not per record: the reason is written back where the edit was made, because otherwise a refused edit looks exactly like a sync that has not run yet. There is currently one integration table with an officer-authored field at all (Platform Settings' reflection policy, validated inline rather than through a named refusal) — the rules this section used to name, `judging_before_workshop`/`judging_moved_after_freeze`/`competition_title_too_long`, left with the Competitions table and `checkCompetition`/`checkCompetitionValues` above.

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

Airtable does offer webhooks, but they expire on a seven-day refresh cycle and deliver cursor-based payloads that have to be replayed in order — real complexity for a club calendar that changes a few times a week. Polling a base this small has no failure mode more exotic than "runs again in fifteen minutes", and the manual trigger covers the case where fifteen minutes is too long to wait: an officer fixing dues ten minutes before someone needs them corrected should not have to wait.

One pass is seven list calls plus a schema read, and the pushes on top of whatever changed. The repository's own estimates of what that costs disagree — `cloudflare/scheduled.ts` reckons about five requests a pass and roughly 13% of the monthly call allowance, `run.ts` says roughly seven — so read the percentage as an order of magnitude rather than a measurement.

**The allowance is per workspace, not per base.** Whatever else the club keeps in Airtable — dues tracking, project management — spends the same budget, so the sync's headroom is not its own, and a base in its own workspace is what isolates it. The per-base rate limit is a separate thing and universal: it does not lift with the plan, so the client backs off exponentially on a 429 at every tier.

</details>

<details>
<summary>Where does the sync's Airtable token come from?</summary>

`AIRTABLE_SYNC_PAT`, from the environment. It was moved out of Supabase Vault — where it lived as `airtable_pat` — on 2026-08-19, which bought one storage mechanism instead of two, made the copy on the Worker visible to `env audit`, and put the token on the same Bitwarden → GitHub → Worker path as every other secret.

What that traded away is worth knowing before somebody needs it in a hurry: an officer can no longer rotate the token from the console without a deploy. Rotation is Bitwarden, then `env push`, then the next deploy's secrets file. A base the platform has no token for still does not fail a boot — the pass returns `not_configured` and touches nothing, because the platform has to run without Airtable. It is no longer _silent_, though: a **scheduled** pass in that state records `not_configured` on the state row the console reads and alerts Sentry once, on the transition, exactly as a drifted base does.

That distinction only became available when the base id became a committed constant. Before it, "no token" and "nobody has configured this yet" were indistinguishable — an unset base id looked like a fresh clone — so the branch stayed quiet to avoid claiming a base had been contacted when none had. Now the token is the only thing that can be missing, and a cron finding none is a misconfiguration. Manual runs are exempt: `requestAirtableSync` returns the reason to the console on screen, and alerting there would fire on a button press.

</details>
