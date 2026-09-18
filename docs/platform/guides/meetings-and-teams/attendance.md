---
name: Attendance
description: Rotating meeting check-in, authoritative attendance records, Airtable correction commands, and EL reflections.
order: 3
---

# Attendance

The DevDogs Platform is authoritative for attendance. Airtable is the officer
reporting and correction surface; it never directly edits attendance rows.

## Member check-in

Every meeting has a rotating QR challenge and six-digit code derived from the
meeting UUID, a 30-second counter, and `ATTENDANCE_TOKEN_SECRET`. The QR opens
`/attendance`; the same page accepts the numeric code. Challenges contain no
member data and have no event-time gate: a valid code records attendance
whenever it is scanned or entered, including when officers re-display one for
testing or a late correction.

The page lists all meetings, with ongoing meetings first. Its deterministic
default is earliest start, then earliest end, then platform UUID. A QR embeds
the meeting explicitly. Public pages show the attendance CTA while a meeting
is ongoing, and the officer display shows both formats full-screen.

Unauthenticated members enter the Google flow without losing the pending
claim. Google is restricted to `uga.edu`; a successful first sign-in creates
the account and resumes the same attendance claim. `(meetingId, userId)` is
unique, so retries and duplicate scans return the existing receipt.

## Authoritative row

`platform.attendance` stores one row per member and meeting. `method` records
`qr`, `manual_code`, or `officer`. Corrections are non-destructive:
`revokedAt`, `revokedBy`, and `revocationReason` preserve the row and explain
why it no longer counts. Client roles may read their own records and cannot
write them.

The Airtable Attendance table is a projection of these rows. Its linked member
and meeting, method, timestamp, revocation state, and reason are all
platform-owned fields.

## Officer corrections

Officers submit the restricted Officer Changes form. Its automation sends only
the Airtable response record ID to `/airtable/officer-changes`, authenticated
with `AIRTABLE_AUTOMATION_SECRET`. The platform then:

1. fetches the response from Airtable;
2. attributes it through Airtable's immutable `Created by` collaborator;
3. verifies that collaborator's platform account holds the correction
   permission;
4. normalizes and hashes the command;
5. applies it in a transaction and appends an audit event;
6. records an idempotency receipt; and
7. writes the result back to the response.

Retries cannot apply a command twice. Editing a delivered response changes its
digest and is rejected. Scheduled sync reconciles status fields if the command
committed but the final Airtable write failed. See [Attendance dashboard
setup](/docs/platform/guides/airtable/attendance-dashboard-setup) for the
deferred form, automation, and field-permission work.

## EL reflections

Meeting reflections require active attendance and `EL eligible` on the
meeting. Competition reflections require membership on a participating team
and `EL eligible` on the DevDogs competition. Participation normally means the
team had a submitted entry when judging began; an officer can explicitly grant
or revoke it.

Members may save drafts below the word minimum. Submission requires the global
minimum (initially 100 words) and must occur before the global window closes
(initially seven exact days after meeting end or competition judging start).
Submitted reflections are member-locked; officer exceptions use the same
correction-command flow.

Every reflection mutation creates immutable revision evidence and an audit
event. Airtable receives the current reflection projection for officer review;
the university, not DevDogs, determines whether that evidence earns credit.
