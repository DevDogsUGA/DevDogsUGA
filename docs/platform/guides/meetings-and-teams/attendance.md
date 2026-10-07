---
name: Attendance
description: Rotating meeting check-in, authoritative attendance records, and EL reflections.
order: 4
section: guides
---

# Attendance

The DevDogs Platform is authoritative for attendance. There is no downstream
CMS receiving a projection of it any more — officers read it straight from the
console, or a CSV export from the officer CLI (see [Exports](#exports) below).

## Member check-in

Every meeting has a rotating QR challenge and six-digit code derived from the
meeting UUID, a 30-second counter, and `ATTENDANCE_TOKEN_SECRET`. The QR opens
`/attendance`; the same page accepts the numeric code. Challenges contain no
member data and have no event-time gate: a valid code records attendance
whenever it is scanned or entered, including when an officer re-displays one
for a member who checked in late. There is no other correction path — a late
check-in is the rotating code shown again, not a request to an officer.

Every meeting records check-ins, including ones whose `countsForCredit` is
off, such as build sessions. That flag decides stars, streaks and EL
eligibility, which each filter on it; it doesn't decide whether a member was
in the room, so those meetings still get the receipt (saying they don't
count) and the survey.

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
`qr` or `manual_code` for a member's own check-in, or `import` for a row an
officer added with the CLI. Check-in is the only writer from the platform. The
one other writer is `backstage import attendance --meeting <date> --file
<csv>`, which an officer runs from a sign-in form or sheet for a meeting where
members could not check in. Imported rows carry method `import`, stamped with
the meeting's start, so they stay distinguishable: re-running the import with
`--replace` makes a corrected sheet the meeting's whole imported set. An import
never overwrites or removes a member's own check-in, and imported rows count
for stars like any other. There is no revocation, and the
platform has no officer-facing way to add or change a row. Client roles may read
their own records and cannot write them.

## EL reflections

Meeting reflections require active attendance and `countsForCredit` on the
meeting — the single flag that governs both star credit and EL eligibility;
see [Stars & streaks](./stars-and-awards.md).
Competition reflections require the member's team to have entered
the competition -- an active membership at the moment the entry (a pull
request linking the issue) opened, the same rule
[Stars & streaks](./stars-and-awards.md)
uses for the competition star -- and the competition's issue to have closed;
a still-open competition has nothing to reflect on yet.

Members may save drafts below the word minimum. Submission requires the global
minimum (initially 100 words) and must occur before the global window closes
(initially seven exact days after meeting end or the competition's issue
closing).
Submitted reflections are member-locked; there is no officer exception.

Every reflection mutation creates immutable revision evidence and an audit
event. There is no officer review surface — the platform has no review,
approval, or status page for reflection content, and nothing outside the
platform ever receives it. Reflections are export-only, and the university,
not DevDogs, determines whether that evidence earns credit.

## Check-in survey

After a check-in that stands, `/attendance` asks the meeting's survey: every
member question the person hasn't answered, then the meeting's own questions,
with their saved member answers folded away underneath to edit. Questions
are config, authored in `@devdogsuga/events` (see
[Events](../../infrastructure/events.md#survey-questions)). Nothing in
the survey affects attendance or credit.

Meeting questions take answers until the meeting's reflection window closes;
member answers never close. Every save writes only what changed, each change
as an append-only row in `surveyAnswerRevisions` (null when an answer is
cleared), under one `survey.saved` audit event. That history is what lets an
export show a member answer as it stood at a past meeting.

## Exports

Officers download a CSV snapshot of stars, attendance, or reflections with the
officer CLI, not from the platform:

```sh
backstage export stars --from 2026-08-17 --to 2026-12-12
backstage export attendance --meeting 2026-09-09
backstage export reflections --from 2026-08-17
```

Each takes `--from`/`--to`; `attendance` also takes `--meeting <date>` to
export a single meeting. Survey answers export the same way as `responses`:
one row per answer, or for one meeting its answers and its attendees' member
answers as they stood when it ended, and the Bevy attendee file carries a
column for each question mapped to one of Bevy's. Run at a terminal, each export asks where to save
its file, with path completion.

For one meeting, attendance can also be written in the shapes DevDogs reports
attendance in elsewhere: a Bevy attendee import for the GDG event page
(`bevy`) and an Involvement Network list, one MyID email per line
(`involvement`). Pick several at once; each file is audited separately:

```sh
backstage export attendance --meeting 2026-09-09 --format platform,bevy,involvement
```

`--from`/`--to` are Eastern days (`--to` inclusive) and filter stars and
attendance on the meeting's start and reflections on when the reflection was
created. Each export is still recorded in the export audit log (an
`exportAudit` row, attributed to the platform account linked to the officer's
`gh` login) before any rows are written, so a download that fails partway is
still on record. One row per attendance record or per reflection --
the reflection export carries only the current text and a revision count, not
the revision history itself, which stays behind `canViewAuditLog`.
