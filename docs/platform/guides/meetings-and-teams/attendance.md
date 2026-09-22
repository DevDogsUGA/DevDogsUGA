---
name: Attendance
description: Rotating meeting check-in, authoritative attendance records, and EL reflections.
order: 3
---

# Attendance

The DevDogs Platform is authoritative for attendance. Airtable receives a
read-only projection for officer reporting; it never edits attendance rows.

## Member check-in

Every meeting has a rotating QR challenge and six-digit code derived from the
meeting UUID, a 30-second counter, and `ATTENDANCE_TOKEN_SECRET`. The QR opens
`/attendance`; the same page accepts the numeric code. Challenges contain no
member data and have no event-time gate: a valid code records attendance
whenever it is scanned or entered, including when an officer re-displays one
for a member who checked in late. There is no other correction path — a late
check-in is the rotating code shown again, not a request to an officer.

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
`qr` or `manual_code`. The check-in that creates a row is its only writer —
there is no revocation and nothing an officer records on a member's behalf.
Client roles may read their own records and cannot write them.

The Airtable Attendance table is a read-only projection of these rows. Its
linked member and meeting, method, and timestamp are all platform-owned
fields.

## EL reflections

Meeting reflections require active attendance and `EL eligible` on the
meeting. Competition reflections require membership on a team that competed
and `EL eligible` on the DevDogs competition.

Members may save drafts below the word minimum. Submission requires the global
minimum (initially 100 words) and must occur before the global window closes
(initially seven exact days after meeting end or competition judging start).
Submitted reflections are member-locked; there is no officer exception.

Every reflection mutation creates immutable revision evidence and an audit
event. Airtable receives the current reflection projection for officer review;
the university, not DevDogs, determines whether that evidence earns credit.
