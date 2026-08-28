---
name: Airtable Sync
description: Where meetings come from — Airtable as the CMS and Postgres as the source of truth, how record ids keep identity through edits, what one pass does, and the refusals that protect credit people already earned.
order: 5
---

# Airtable Sync

**Airtable is the CMS. Postgres is the source of truth.** Officers author meetings, workshops and competitions in a base; a pass every fifteen minutes projects them into Postgres, and everything the platform derives hangs off the Postgres rows. Read this before adding a synced field or changing `server/airtable/`; for the exported functions, see the generated [`server/airtable`](/docs/platform/reference/server/airtable) reference, and for scaffolding the base itself, the [Airtable guides](/docs/platform/guides/airtable).

The split exists because `attendance."meetingId"` needs something that keeps its identity through an edit. Airtable gives non-technical editors typed fields, linked records and forms; it cannot give referential integrity.

## What lives where

Seven tables, and the direction is **per field, never per table**:

| Table            | Officers author                                                             | The platform writes                                                        |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Meetings**     | custom name, times, location, form link, summary, kind, RSVP, cancellation  | ⚙️ Platform ID, ⚙️ Attendance, ⚙️ Sync status                              |
| **Workshops**    | Meeting _(link)_, Project _(link, optional)_, title, description            | ⚙️ Platform ID, ⚙️ Attendance, ⚙️ Sync status                              |
| **Competitions** | Branch slug, Workshop _(link)_, Judging starts, Requirements, Max team size | ⚙️ Platform ID, ⚙️ Teams, ⚙️ Sync status                                   |
| **Teams**        | Requirements met                                                            | ⚙️ Platform ID, ⚙️ Name, ⚙️ Members, ⚙️ Submission, ⚙️ Competed, ⚙️ Points |
| **Members**      | Dues paid                                                                   | ⚙️ Platform ID, UGA email, Legal name, ⚙️ Meetings attended                |
| **Projects**     | nothing — a platform-owned mirror                                           | ⚙️ Platform ID, ⚙️ Slug, Name                                              |
| **Attendance**   | the rows themselves: MyID, Workshop, Source                                 | ⚙️ Platform ID, ⚙️ Sync status                                             |

One rule governs the right-hand column: **push only fields the platform owns exclusively, and never create a field both sides write.** Two writers have no conflict-resolution story, and last-writer-wins destroys work silently. Teams is where both directions meet — the grade is an input, the points an output — and the discipline is to resist the Airtable formula between them, which would put the scoring rule in two places that drift. The `⚙️` prefix warns officers off a field; the field editing permissions set by hand enforce it.

Attendance is the one table Airtable **creates** rows in — see [Attendance](/docs/platform/guides/meetings-and-teams/attendance). Projects go the other way: an officer typing "Study Group Findr" would link a workshop to nothing.

<details>
<summary>Which surface does a given officer task belong to?</summary>

Only officers have Airtable access, so the base is the officer console for anything it can hold — an admin screen not built is a screen not maintained. The line is not "officer-only work", it is **what Airtable can key a row to**.

| Task                                                           | Where                                                |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| Create or edit a meeting or a workshop                         | Airtable                                             |
| Open a competition, by linking its workshop                    | Airtable                                             |
| Set `Judging starts`, the requirement count, the max team size | Airtable                                             |
| Grade a team's requirements met                                | Airtable                                             |
| Record dues                                                    | Airtable                                             |
| Correct an attendance row                                      | Platform — `setAttendance`                           |
| Record a team's entry when there is no PR                      | Platform — `setSubmission`                           |
| Freeze a roster early                                          | Platform — `setManualLock`                           |
| Give a team a named award                                      | Platform — `awardTeam`                               |
| Run a pass now                                                 | Either — `requestAirtableSync`, or the base's button |

Everything on the platform side needs a member or team identity that Airtable holds only as a mirror, and each is a server action gated on the same permission as roster edits — except the sync trigger, which has its own, and the `winner` award, which nobody authors at all: the election tally writes it.

</details>

## Identity survives editing

Every synced row carries `airtableRecordId` — unique on `meetings`, `workshops` and `competitions`, partially unique on `attendance`. Record ids survive renames, field edits and view re-sorts, so retitling "Sprint 2" to "Fall Sprint 2" updates a row rather than orphaning the attendance pointing at it. Matching on name or slug would break the first time somebody fixed a typo, and break in the worst way: a second row that looks right while the earned credit stays on the first. A meeting slug is likewise derived once, on insert, because it is in URLs from publication onward.

## One pass

The cron fires `*/15 * * * *` at `/airtable/sync`; `requestAirtableSync()` runs the same `runAirtableSync` for an officer holding `canTriggerSync`, and an Airtable button field reaches the route because a button can only open a URL. One implementation, because the manual path is the one reached for when something has already gone wrong.

1. **Verify the base against the registry** before anything is written: a field id that no longer exists is not an error at write time — Airtable accepts the request, the value lands nowhere, and the pass reports success. A drifted base refuses to sync, alerting Discord once.
2. **Claim the lease**, or return `already_running`; a manual run inside the cooldown returns `rate_limited`.
3. **Push Projects**, so a workshop's Project link resolves against records that exist.
4. **Pull Meetings, then Workshops, then Competitions** — a dependency order: workshops resolve meeting links, competitions resolve workshop links.
5. **Pull Attendance**, after workshops (a response names its workshop by record id) and before the pushes (so the counts include what this pass imported).
6. **Pull the grades, then push** Members, Teams and the derived counts, comparing against what Airtable holds rather than a hash.
7. **Write refusals** into each record's `⚙️ Sync status`, release the lease, and advance `lastSyncedAt` **only if the pass completed** — what a partial pass missed is indistinguishable from what it applied.

A record missing from the base is a **soft archive**: `deletedAt` is set, the row leaves the site, attendance survives. Attendance is the exception, and the only irreversible step.

## The rules that protect credit

A refusal is per **field**, not per record: fixing a project link and a max team size in one edit applies the second and complains about the first. The reason is written back where the edit was made, because otherwise a refused edit looks exactly like a sync that has not run yet.

| Refused                                                                 | Because                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A workshop's Meeting or Project, once it has attendance                 | It re-attributes credit people already earned                                      |
| `Requirements` on a finalized competition                               | It is the denominator of a score already published                                 |
| `Judging starts` at or before the opening workshop's meeting            | Every roster would lock the moment the competition was created                     |
| `Judging starts` moving once participation is frozen                    | Later reopens settled rosters; earlier locks people out of days they spent joining |
| A Summary over 240 characters, or an RSVP link off the allowlisted host | It cannot go on a public page as written                                           |

The first four protect **history**. The last is a different kind — nothing is at risk, the value simply cannot be published — so the refused field is dropped from the write rather than blanked, and whatever was already up stays up until the replacement fits.

A workshop with **no** attendance is still fully editable, and a null incoming value is never a change: officers fill fields one at a time, and a pass landing between two keystrokes must not complain about a row that will be complete shortly.

A meeting below the required shape — `startsAt`, `endsAt`, and the end after the start — is skipped rather than refused, and writes a **state** into `⚙️ Sync status` saying which field it is waiting on. A **name is not required**, and asking for one would report the ordinary case as a fault: most nights have none, because the heading is derived from the workshops and the judging, and the slug comes from the meeting's date rather than its name. That is not a complaint and is worded not to read as one; it exists because the silence was indistinguishable from a sync that had never run, which is precisely the question the column is there to answer. It clears itself on the pass after the row is whole.

Workshops and competitions have the same silent branch and deliberately keep it: an unresolvable link there usually means the linked _meeting_ was incomplete, which now carries its own message — saying it twice would point the officer at the wrong row.

## Why it's like this

<details>
<summary>Why a lease row rather than a Postgres advisory lock?</summary>

The design called for `pg_try_advisory_lock` held for the duration of a pass, and that does not survive contact with how these apps connect. Session-scoped locks bind to a backend connection, but the apps connect through Supabase's transaction-mode pooler, which hands a different backend to each transaction — so the unlock can land on a different backend, silently return false, and leak the lock until something recycles the pool. Transaction-scoped locks release correctly but only by ending the transaction, which would mean holding one open across every Airtable HTTP call in the pass; an idle-in-transaction connection for that long is what exhausts a pooler.

A lease row has neither problem. It is ordinary MVCC, so it does not care which backend serves which statement, and its correctness comes from an expiry rather than from a connection staying alive — which also covers the case an advisory lock genuinely handles better, a worker killed mid-pass. `LEASE_MINUTES` is 10.

The manual cooldown — `MANUAL_COOLDOWN_SECONDS`, one run a minute whoever asks — is deliberately **global** rather than per caller: what it protects is the Airtable call allowance, which is a shared workspace resource, and five officers each entitled to a run a minute is five times the load justified by a rule that reads as if it prevented load. The button is also the kind of thing that gets clicked four times when it appears not to work.

</details>

<details>
<summary>Why poll every fifteen minutes instead of subscribing to webhooks?</summary>

Airtable does offer webhooks, but they expire on a seven-day refresh cycle and deliver cursor-based payloads that have to be replayed in order — real complexity for a club calendar that changes a few times a week. Polling a base this small has no failure mode more exotic than "runs again in fifteen minutes", and the manual trigger covers the case where fifteen minutes is too long to wait: an officer fixing a requirement count ten minutes before judging should not have to.

One pass is seven list calls plus a schema read, and the pushes on top of whatever changed. The repository's own estimates of what that costs disagree — `cloudflare/scheduled.ts` reckons about five requests a pass and roughly 13% of the monthly call allowance, `run.ts` says roughly seven — so read the percentage as an order of magnitude rather than a measurement.

**The allowance is per workspace, not per base.** Whatever else the club keeps in Airtable — dues tracking, project management — spends the same budget, so the sync's headroom is not its own, and a base in its own workspace is what isolates it. The per-base rate limit is a separate thing and universal: it does not lift with the plan, so the client backs off exponentially on a 429 at every tier.

</details>

<details>
<summary>Where does the sync's Airtable token come from?</summary>

`AIRTABLE_SYNC_PAT`, from the environment. It was moved out of Supabase Vault — where it lived as `airtable_pat` — on 2026-08-19, which bought one storage mechanism instead of two, made the copy on the Worker visible to `env audit`, and put the token on the same Bitwarden → GitHub → Worker path as every other secret.

What that traded away is worth knowing before somebody needs it in a hurry: an officer can no longer rotate the token from the console without a deploy. Rotation is Bitwarden, then `env push`, then the next deploy's secrets file. A base the platform has no token for still does not fail a boot — the pass returns `not_configured` and touches nothing, because the platform has to run without Airtable. It is no longer _silent_, though: a **scheduled** pass in that state records `not_configured` on the state row the console reads and alerts Discord once, on the transition, exactly as a drifted base does.

That distinction only became available when the base id became a committed constant. Before it, "no token" and "nobody has configured this yet" were indistinguishable — an unset base id looked like a fresh clone — so the branch stayed quiet to avoid claiming a base had been contacted when none had. Now the token is the only thing that can be missing, and a cron finding none is a misconfiguration. Manual runs are exempt: `requestAirtableSync` returns the reason to the console on screen, and alerting there would fire on a button press.

</details>
