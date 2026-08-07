import { field, table } from "./field.js";

/**
 * The field registry: one declaration read by the push builder, the pull
 * parser and the verifier.
 *
 * Adding a field to the sync is one line here and nothing else. The batching,
 * change detection and `⚙️` prefix conventions are properties of the engine,
 * so a new field inherits them.
 *
 * ## The IDs below are real, and are the wire format
 *
 * Written by `pnpm airtable:pull-ids` from the live base. Every read and write
 * goes over the wire with these rather than with field NAMES, which is what
 * lets an officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a `todo("slug")` id, run
 * `pnpm airtable:scaffold` to create it, then `pnpm airtable:pull-ids` to fill
 * the real id in. `verify.ts` FAILS on any remaining placeholder rather than
 * warning, because a placeholder that reaches a live sync writes into nothing
 * and reports success.
 */

/**
 * Marks an ID as not-yet-discovered. See `isPlaceholder`.
 *
 * Exported, and stays exported after the base is scaffolded, because adding a
 * field later uses the same two-step: declare it with a `todo()` id, run
 * `pnpm airtable:scaffold` to create it, then `pnpm airtable:pull-ids` to
 * replace this call with the real one.
 */
export function todo(slug: string): string {
  return `fldTODO_${slug}`;
}

export function todoTable(slug: string): string {
  return `tblTODO_${slug}`;
}

export function isPlaceholder(id: string): boolean {
  return id.startsWith("fldTODO_") || id.startsWith("tblTODO_");
}

// ── Row shapes the platform maps onto ────────────────────────────────────────
//
// Deliberately not the Drizzle row types. The registry is the boundary, and
// naming exactly what it needs is what stops "just pass the profile" from
// quietly widening what leaves Postgres.

export interface MemberRow {
  userId: string;
  ugaEmail: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  meetingCount: number;
}

export interface ProjectRow {
  id: string;
  slug: string;
  displayName: string;
}

export interface MeetingRow {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  attendanceFormUrl: string | null;
  attendanceCount: number;
}

export interface WorkshopRow {
  id: string;
  meetingAirtableId: string | null;
  projectAirtableId: string | null;
  attendanceCount: number;
}

export interface CompetitionRow {
  id: string;
  slug: string;
  workshopAirtableId: string | null;
  judgingStartsAt: string | null;
  teamCount: number;
}

/**
 * An imported attendance row, as the platform reports it back.
 *
 * Only the id: everything else about the row came FROM Airtable, and pushing
 * any of it back would make the platform a second writer of a field the form
 * owns — the exact thing `.push()`/`.pull()` exclusivity exists to prevent.
 */
export interface AttendanceRow {
  id: string;
}

export interface TeamRow {
  id: string;
  name: string;
  competitionAirtableId: string | null;
  memberCount: number;
  submissionUrl: string | null;
  competed: boolean;
  totalPoints: number | null;
}

// ── Tables ───────────────────────────────────────────────────────────────────
//
// The `⚙️` prefix marks a field the platform writes. It is a naming convention
// for officers rather than anything the API understands: it says "editing this
// will be overwritten on the next pass". Field editing permissions are what
// actually prevent that, and they are configured by hand — see the runbook.

/**
 * Members.
 *
 * Push-only apart from dues. The match key is `⚙️ Platform ID` and NOT the UGA
 * email, for two reasons that happen to agree: a MyID can change with a legal
 * name change, and `email`-typed fields are not eligible in `fieldsToMergeOn`
 * at all. The second makes it a requirement rather than a preference.
 */
export const members = table("Members", "tblLTJtir40NrL87x", {
  platformId: field
    .text("fldXg9IE8LgkjhfKy", "⚙️ Platform ID")
    .matchKey()
    .push((m: MemberRow) => m.userId),

  ugaEmail: field
    .email("fldrFt40qy37Ftn9z", "UGA email")
    .push((m: MemberRow) => m.ugaEmail),

  legalName: field
    .text("fldeFEIojm0OmH0hL", "Legal name")
    .push(
      (m: MemberRow) =>
        [m.legalFirstName, m.legalLastName].filter(Boolean).join(" ") || null,
    ),

  meetingsAttended: field
    .number("fld67SQSbL40XU6aa", "⚙️ Meetings attended")
    .push((m: MemberRow) => m.meetingCount),

  duesPaidAt: field
    .date("fld3p7eengCBxHjjj", "Dues paid")
    .pull((value) => (typeof value === "string" ? value : null)),

  notes: field.longText("fldmpCcukx7kkNMZs", "Notes").ignore(),
});

export const projects = table("Projects", "tblqcG8xDrOMuBTvF", {
  platformId: field
    .text("fldniryZw7v0j7MuD", "⚙️ Platform ID")
    .matchKey()
    .push((p: ProjectRow) => p.id),
  slug: field
    .text("fldqQiRT2jDhlsrWC", "⚙️ Slug")
    .push((p: ProjectRow) => p.slug),
  displayName: field
    .text("fldaDoMwYJlhoxODU", "Name")
    .push((p: ProjectRow) => p.displayName),
});

/**
 * Meetings — officer-authored, so most fields are PULLED.
 *
 * The platform pushes only its own id and the derived attendance count. The
 * schedule itself belongs to whoever is running the semester.
 */
export const meetings = table("Meetings", "tblYhJZWMnBrZ4ylM", {
  platformId: field
    .text("fldIBjOSNweMYXAaj", "⚙️ Platform ID")
    .matchKey()
    .push((m: MeetingRow) => m.id),
  name: field
    .text("fldc0NfTHVxHk8Za0", "Name")
    .pull((v) => (typeof v === "string" ? v : null)),
  location: field
    .text("fld3MRTF42aS6c3PX", "Location")
    .pull((v) => (typeof v === "string" ? v : null)),
  startsAt: field
    .dateTime("fld0iXyGZpgW7zJWF", "Starts at")
    .pull((v) => (typeof v === "string" ? v : null)),
  endsAt: field
    .dateTime("fldEjZPZGVJG3qZEl", "Ends at")
    .pull((v) => (typeof v === "string" ? v : null)),
  // The week's attendance form, pasted by an officer.
  //
  // Not discoverable: the Meta API returns views as {id, name, type} and a
  // form's public share token is not among them, so there is no path from
  // "this meeting" to "this form" that does not go through somebody pasting
  // it. Measured 2026-08-06.
  attendanceForm: field
    .url("fldZT0taFyXVb7Bls", "Attendance form")
    .pull((v) => (typeof v === "string" ? v : null)),
  attendanceCount: field
    .number("fld9RRuEB6SpnqPLP", "⚙️ Attendance")
    .push((m: MeetingRow) => m.attendanceCount),
  syncStatus: field.longText("fldyPrtUDL9iuhLA1", "⚙️ Sync status").status(),
});

export const workshops = table("Workshops", "tblSYPbmIagwyTFq1", {
  platformId: field
    .text("fldVVc4st1vNgVzVP", "⚙️ Platform ID")
    .matchKey()
    .push((w: WorkshopRow) => w.id),
  meeting: field
    .link("fldqxlHThMKBmhsiq", "Meeting", "meetings")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  project: field
    .link("fldhUjEo0dq5BRZez", "Project", "projects")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  attendanceCount: field
    .number("fldxdsZmSNmR30O2J", "⚙️ Attendance")
    .push((w: WorkshopRow) => w.attendanceCount),
  syncStatus: field.longText("flddrtCx3b88sFsHl", "⚙️ Sync status").status(),
});

export const competitions = table("Competitions", "tbltrW1Xum127cNwy", {
  platformId: field
    .text("fld1w9dzXBszwMI0M", "⚙️ Platform ID")
    .matchKey()
    .push((c: CompetitionRow) => c.id),
  slug: field
    .text("flduPP0rsaJ7Sjl1J", "Branch slug")
    .pull((v) => (typeof v === "string" ? v : null)),
  workshop: field
    .link("fldge0I3DNLH0b7BN", "Workshop", "workshops")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  judgingStartsAt: field
    .dateTime("fld9p3FVXCuFWJF7b", "Judging starts")
    .pull((v) => (typeof v === "string" ? v : null)),
  requirementCount: field
    .number("fldu17YKeE2FYBkOc", "Requirements")
    .pull((v) => (typeof v === "number" ? v : null)),
  maxTeamSize: field
    .number("fldGij8ChmqGklbwh", "Max team size")
    .pull((v) => (typeof v === "number" ? v : null)),
  teamCount: field
    .number("fldss0bnDwAM2YXii", "⚙️ Teams")
    .push((c: CompetitionRow) => c.teamCount),
  syncStatus: field.longText("fldxx0qkfiSXGhWiD", "⚙️ Sync status").status(),
});

export const teamsTable = table("Teams", "tblfXjgqCZiJnnD4x", {
  platformId: field
    .text("fldZ7a84yBHOt1x3i", "⚙️ Platform ID")
    .matchKey()
    .push((t: TeamRow) => t.id),
  name: field.text("fldkwm2qtSjZdbzPY", "⚙️ Name").push((t: TeamRow) => t.name),
  memberCount: field
    .number("fldu6uDYUQq0ga4qH", "⚙️ Members")
    .push((t: TeamRow) => t.memberCount),
  submissionUrl: field
    .url("fldt81SN59PbB0Wa5", "⚙️ Submission")
    .push((t: TeamRow) => t.submissionUrl),
  competed: field
    .checkbox("fldDuEeRPzyaRxqIo", "⚙️ Competed")
    .push((t: TeamRow) => t.competed),
  totalPoints: field
    .number("fldvrkhNok0u2C7zn", "⚙️ Points")
    .push((t: TeamRow) => t.totalPoints),
  requirementsMet: field
    .number("fldos8CCiyx6FwIdi", "Requirements met")
    .pull((v) => (typeof v === "number" ? v : null)),
});

/**
 * Attendance — the one table Airtable CREATES rows in.
 *
 * Every other table here is either platform-owned and pushed, or
 * officer-authored and pulled field by field. This one is different in kind: a
 * row appears because somebody filled in a form in a workshop, or because a
 * co-branded event's roster was pasted in from whatever the other club uses.
 * The platform never writes a record here, only reads them and reports back.
 *
 * ## Why a MyID and not an email field
 *
 * `MyID` is the local part alone — `jdoe`, not `jdoe@uga.edu`. Two reasons,
 * and the second is the load-bearing one:
 *
 *   * It is what somebody standing in a workshop can type without thinking,
 *     which matters when the alternative is a wrong address.
 *   * An `email`-typed field cannot be a `.matchKey()` — `fieldsToMergeOn`
 *     rejects the type outright — and more importantly, accepting a free-text
 *     address would let a response name `someone@gmail.com`. Sign-in is Google
 *     restricted to `hd=uga.edu`, so an address outside that domain can never
 *     be claimed by anybody and would create an account nobody can reach.
 *     Taking the local part and appending the domain ourselves makes that
 *     unrepresentable rather than merely unlikely.
 *
 * ## What the platform writes back
 *
 * Only `⚙️ Platform ID` and `⚙️ Sync status`. The first is the imported row's
 * uuid, which makes a re-import idempotent and shows an officer that a response
 * landed. The second carries the refusal when it did not — an unknown MyID, or
 * a workshop link the platform cannot resolve.
 */
export const attendanceTable = table("Attendance", "tblVgyeo1q9vk0ddD", {
  platformId: field
    .text("fldg06bTtZFYVcErp", "⚙️ Platform ID")
    .matchKey()
    .push((a: AttendanceRow) => a.id),

  // The form's own field. Pulled, lowercased and trimmed by the importer --
  // MyIDs are handed out in one case and typed in another.
  myId: field
    .text("fldmscaBQzdP4qhMP", "MyID")
    .pull((v) => (typeof v === "string" ? v.trim().toLowerCase() : null)),

  // Which room. The meeting is derived from the workshop rather than asked
  // for: `attendance` is keyed on the meeting, and a form that collected both
  // could disagree with itself.
  workshop: field
    .link("fldbZHdOlT5G0rAPP", "Workshop", "workshops")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),

  // How the row got here, for the officer's benefit rather than the
  // platform's. A co-branded import and a form response are both 'airtable' as
  // far as `checkInMethod` is concerned; this says which, in the grid.
  source: field
    .singleSelect("fldXEVVndageXQXHy", "Source")
    .pull((v) => (typeof v === "string" ? v : null)),

  syncStatus: field.longText("fldKo5gUpLqg72pKx", "⚙️ Sync status").status(),
});

export const registry = {
  members,
  projects,
  meetings,
  workshops,
  competitions,
  teams: teamsTable,
  attendance: attendanceTable,
} as const;

export type RegistryTable = keyof typeof registry;
