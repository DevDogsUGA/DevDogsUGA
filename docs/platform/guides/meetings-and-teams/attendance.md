---
name: Attendance
description: Attendance as a ledger of who was in the room rather than a score — the one row per member per meeting, how check-in reaches it through an Airtable form, and how officers correct it.
order: 3
---

# Attendance

**Attendance is a ledger, not a score.** A row says that a member was in a room at a meeting and how that was recorded; it carries no points, no total and no star. Everything scored is derived from these rows on read, which is why a correction made next week is immediately true everywhere and why a row must never be edited to say something it did not say. Read this before writing anything that inserts into `platform.attendance`; for the exported functions, see [`server/airtable`](/docs/platform/reference/server/airtable).

## The row

`platform.attendance` is one row per `(meeting, member)`, with the workshop as a dimension on it:

```sql
unique ("meetingId", "userId")
foreign key ("workshopId", "meetingId")
  references platform.workshops(id, "meetingId")
```

- **`workshopId` is nullable.** Somebody who came only for judging, or to a meeting with no workshop, is present without being in a workshop: a row, and no workshop star.
- **One row per member per meeting is true because workshops are concurrent.** You cannot be in two, so "attended twice" is unrepresentable rather than merely discouraged.
- **The composite foreign key keeps the dimension honest.** Without it a row could name a workshop belonging to another meeting, and a member would earn a star for a room they were never in.
- **`method` is `discord`, `officer` or `airtable`**, and `recordedBy` may only be set when the method is `officer` — a row naming a recorder under any other method would be lying about how the member was counted.
- **There is no `teamId`.** Teams belong to competitions, not to meetings, and a team dissolving must not erase attendance.

Clients read their own rows only; every client write is denied. Officer reads go through a server action that checks the permission, so a broad `authenticated` read never has to exist.

## Check-in

Since 2026-08-06 the capture surface is an **Airtable form**. Workshops are run with one already — poll questions get asked in the room anyway — and a co-branded event's roster pastes into the same table rather than teaching the platform to import somebody else's scheme. Beside it, `method = 'officer'` marks a row an officer added by hand, and `method = 'discord'` is reserved for a slash command that no code path writes. Every capture route ends in the same row, distinguished only by that column.

The form asks for a **MyID, not an email** — `jdoe`, not `jdoe@uga.edu` — and the importer appends the domain. Sign-in is Google restricted to `hd=uga.edu`, so an address outside that domain could never be signed into by anybody: it would hold somebody's attendance permanently out of reach. A response naming another domain is refused as `attendance_bad_myid`, with the reason written back into that record's `⚙️ Sync status`.

Most first-time attendees have no account, so the import creates one — and two rules make that safe, both asserted by tests rather than by this page.

<details>
<summary>Why the account is created unconfirmed, and what it must not write</summary>

`admin.createUser` is called with `email_confirm: false`. Measured against the local stack: that produces a user carrying an `email` identity with `email_verified: false`, and Supabase's documented safeguard is that a new identity being linked to an existing user removes any other unconfirmed identities on it — so a real Google sign-in as that address links to this row and displaces the unconfirmed one. Passing `true` would confirm the identity, the safeguard would not fire, and the behaviour would depend on a case the documentation does not cover. The consequence is that a mistyped MyID is a prunable orphan rather than a lockout for whoever really owns the address.

The import writes a profile whose `preferredName` is the MyID, and deliberately **not** `ugaEmail` or the legal-name columns. Those are durable identity from the Involvement roster and `profile_ugaEmail_key` is unique — a self-declared MyID sitting there would raise a unique violation the next time the roster import reached the real owner of that address, inside a transaction, aborting the import for the entire club. One typo, everybody's roster.

</details>

### The form asks for the meeting, and the workshop only if there was one

It used to ask **only** for the workshop, deriving the meeting from it on the argument that a form collecting both could disagree with itself. That was right about the risk and wrong about the remedy, and the events rework made the cost visible: an Interest Meeting, a Social and a dedicated judging night run no workshops, so a response about one of them had nothing to pick, arrived with an empty cell, and was dropped by the importer's completeness gate — silently, on every pass, forever. The nights the form was least able to describe were the ones with no other capture surface.

So `Meeting` is a link of its own and `Workshop` is optional beside it. Either link alone is enough: a response naming only the workshop still resolves its meeting the old way, which is why existing responses needed no backfill. The disagreement the old design avoided is now a rule rather than an impossibility — two links naming different nights are refused as `attendance_workshop_meeting_mismatch`, because only the officer knows which cell is the typo, and the composite foreign key would otherwise reject the row as a failed insert in the middle of a pull.

Nothing about the schema changed. `attendance."workshopId"` has been nullable since the table existed, for exactly the member this now records: present at the meeting, in no workshop, and no workshop star.

A member who sat in two workshops of one meeting produces two responses and one row: the second is **refused** as `attendance_meeting_already_recorded` rather than dropped, because both responses are legitimate and the schema collapses them on purpose — so the officer is told instead of left to notice.

`meetings."attendanceFormUrl"` holds the week's share link, pasted by an officer into Airtable and pulled down like any other authored field, under a check constraint that rejects anything which is not an `https://airtable.com/` URL — the value is rendered as an href on a public page. It is stored because it cannot be discovered: measured on 2026-08-06, the Meta API returns views as `{id, name, type}` and a form view's public share token is not among them. In the room, `/attendance` redirects to `tinyurl.com/devdogs<MMDDYY>` for the current Eastern date.

The platform no longer claims to know whether attendance is _open_: `checkInClosesAt` went with the check-in codes, the form's own window is the only gate, and nothing in this process can read it. `attendanceFormIsLive` answers the narrower question it can — is there a link, and is the meeting happening — and the copy around it is a pointer rather than a promise.

## Officers can edit any roster

`setAttendance(meetingId, workshopId, memberId, present)` adds or removes one member's row for a meeting, at any time, including long after the meeting. It is gated on `canEditAttendance`, and re-marking somebody present corrects the workshop rather than failing, taking `method = 'officer'` and the caller as `recordedBy` — the officer edit becomes the authority for that row. Stars reflect the change on the next read, with no backfill and nothing to recompute.

## Why it's like this

<details>
<summary>Why does deleting the Airtable record delete the row, when every other table only archives?</summary>

Everywhere else in the pull, a missing record is a soft archive: attendance is a record of who was in a room on a Tuesday, and "I deleted the wrong row" in a spreadsheet does not erase that.

The rule inverts here because it was written when the platform created attendance and Airtable mirrored it. Once Airtable is the source, the row exists only because somebody created it there, so removing it there is the source saying it did not happen — and a mirror that keeps asserting otherwise is stale rather than principled. The safety argument inverts with it: restore the record from Airtable's trash and the next pass re-imports it on the same `airtableRecordId`, and nothing outside the table references an attendance id, so the restored row is equivalent rather than merely similar.

Two things bound it. Only rows the import created are touched — `method = 'airtable'` with a record id — so an officer's correction is never removed, including one a later form response merely annotated with its record id. And an empty table really does remove everything, which is correct rather than alarming: `listRecords` throws on any non-2xx, so a failed fetch aborts the pass and cannot masquerade as "the table is empty". It is the only irreversible thing a pass does, so the sync reports **attendance removed** as its own figure rather than folding it into archived rows.

</details>

<details>
<summary>Why was <code>'code'</code> rebuilt out of the enum rather than left in place?</summary>

The rotating check-in codes existed to disambiguate concurrent rooms — a short string shown at the front of each workshop, resolving to a `(meeting, workshop)` pair, so a member never picked a room from a list. The form's Workshop link is the same disambiguation without anybody reading a screen and typing, so the codes were paying a subsystem's cost for a property something else now provides.

Dropping `'code'` from `checkInMethod` was safe only because it was verified first that both the linked project and the local database held **zero** attendance rows using it. Had there been any, the value would have stayed: a ledger row saying how somebody was counted must not be rewritten to say something else, which is the ledger framing at the top of this page doing actual work rather than decorating a migration.

</details>
