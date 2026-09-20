import { field, table, type AirtableValue } from "./field.js";

/**
 * The field registry: one declaration read by the push builder, the pull
 * parser and the verifier.
 *
 * Adding a field to the sync is one line here and nothing else. Batching,
 * change detection and the `⚙️` prefix convention belong to the engine, so a
 * new field inherits them.
 *
 * ## The IDs below are real, and are the wire format
 *
 * Written by `pnpm devtools airtable apply` from the live base. Every read and
 * write goes over the wire with these rather than with field NAMES, which is
 * what lets an officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a `todo("slug")` id and run
 * `pnpm devtools airtable apply`, which creates it in the base and fills the
 * real id in here. `verify.ts` FAILS on any remaining placeholder rather than
 * warning, because a placeholder that reaches a live sync writes into nothing
 * and reports success.
 */

/**
 * Marks an ID as not-yet-discovered. See `isPlaceholder`.
 *
 * Stays exported after the base is scaffolded, because adding a field later
 * takes the same route: declare it with a `todo()` id, then run
 * `pnpm devtools airtable apply`, which creates it in the base and replaces
 * this call with the real one.
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

/**
 * The officers' base, committed like every `tbl` and `fld` id below it.
 *
 * It was an `environment`-scoped variable routed through Bitwarden to a GitHub
 * environment VARIABLE in all four environments, plus a `narrowed` opt-in to
 * reach `preflight`. That was machinery for a value with exactly one possible
 * setting: there is one base, and staging deliberately shares it.
 *
 * The argument that settles it is one file down. Every field id in this
 * registry belongs to THIS base, so a second base would need a second
 * registry, and parameterising the base id alone never bought the portability
 * it looked like it was buying. Committing it puts the base's identity in one
 * place instead of three, and retires the failure mode that bit us on
 * 2026-08-17: a hand-set repository variable silently shadowed by an
 * environment one, invisible until somebody deletes the environment copy.
 *
 * Public rather than secret. It is in every Airtable dashboard URL, and it
 * identifies without authorising; every capability belongs to the token.
 * `AIRTABLE_BASE_ID` survives as an override for anyone pointing the tooling
 * at a scratch base. Unset, which is now the ordinary case, this is the value.
 */
export const BASE_ID = "appt422RNi98uAqwX";

// ── Row shapes the platform maps onto ────────────────────────────────────────
//
// Deliberately not the Drizzle row types. The registry is the boundary, and
// naming exactly what it needs is what stops "just pass the profile" from
// quietly widening what leaves Postgres.

export interface MemberRow {
  userId: string;
  preferredName: string;
  ugaEmail: string | null;
  legalFirstName: string | null;
  legalLastName: string | null;
  meetingCount: number;
}

export interface MeetingRow {
  id: string;
  slug: string;
  /**
   * A name for this night, when it has one worth reading. Null is the ordinary
   * case: a sprint Monday derives its heading from its workshops and its
   * judging, and an officer retyping that every week was the duplication the
   * rename removed.
   */
  nameOverride: string | null;
  /** When this night was called off. Null is the ordinary case. */
  cancelledAt: string | null;
  /** Why, in a few words. Null even when cancelled. */
  cancellationReason: string | null;
  building: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  attendanceCount: number;
}

export interface WorkshopRow {
  id: string;
  /** Whatever the officers call this session; null falls back to its project. */
  title: string | null;
  /** What it teaches. Null renders nothing. */
  description: string | null;
  meetingAirtableId: string | null;
  projectAirtableId: string | null;
}

export interface CompetitionRow {
  id: string;
  slug: string;
  workshopAirtableId: string | null;
  judgingStartsAt: string | null;
  teamCount: number;
}

export interface AttendanceRow {
  id: string;
  memberAirtableId: string;
  meetingAirtableId: string;
  method: "qr" | "manual_code" | "officer";
  recordedAt: string;
  revoked: boolean;
  revocationReason: string | null;
}

export interface OfficerChangeRow {
  formResponseRecordId: string;
  status: "Pending" | "Applied" | "Rejected" | "Retryable";
  processedAt: string | null;
  auditEventId: string | null;
  error: string | null;
}

export interface ReflectionRow {
  id: string;
  memberAirtableId: string;
  meetingAirtableId: string | null;
  competitionAirtableId: string | null;
  content: string;
  state: "Draft" | "Submitted";
  submittedAt: string | null;
}

export interface PlatformSettingsRow {
  id: "reflection-policy";
  minimumWordCount: number;
  submissionWindowDays: number;
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

// ── Officer-authored meeting copy ────────────────────────────────────────────
//
// The three fields below are what let an officer say what a night is ABOUT,
// rather than leaving the events page to infer it from the night's structure.
// Their parsers live here, next to the declarations, because the pull, the
// verifier and the app's refusal rules all need one definition of
// "acceptable". A second copy of that definition is how a value gets published
// that the database then rejects.
//
// ## Every parser here returns null instead of throwing
//
// `applyPull` runs each parser inside a bare `.map()` over the fetched
// records, so an exception does not skip one row: it escapes the map, escapes
// the pull, and fails the entire sync pass for every table. `new URL()` throws
// on anything it cannot parse, which is precisely what an officer pasting the
// wrong thing produces, so it is wrapped rather than trusted.

/**
 * How long a meeting summary may be, measured after normalization.
 *
 * The events card is sized for one or two sentences. Longer than this is not
 * a card, it is an article, and the layout has nowhere to put it.
 */
export const MEETING_SUMMARY_MAX_LENGTH = 240;

/**
 * Matches `meetings_nameOverride_length`. A schedule row and a dialog title
 * are both one line, so a name that outgrows this is found by a member looking
 * at a broken page rather than by the officer who wrote it.
 *
 * A parser looser than its constraint is a violation inside the pull, which
 * takes down the whole pass rather than refusing one field.
 */
export const MEETING_NAME_OVERRIDE_MAX_LENGTH = 80;

/**
 * Shorter than a summary because it renders inline beside a struck-through row
 * rather than in a paragraph of its own. Must stay at or below the
 * `meetings_cancellationReason_length` constraint. A parser looser than its
 * constraint is a violation inside the pull, which takes down the whole pass.
 */
export const MEETING_CANCELLATION_REASON_MAX_LENGTH = 160;

/**
 * Matches `projects_displayName_length`.
 *
 * The column had no cap while the platform wrote it, because a value the
 * platform authored could not surprise it. It is officer-typed now, printed as
 * a chip on the schedule and as a star's label, so it needs the same guard
 * every other authored string here has.
 */
export const PROJECT_NAME_MAX_LENGTH = 80;

/** Matches `workshops_title_length`. A row label, so it is short by design. */
export const WORKSHOP_TITLE_MAX_LENGTH = 80;

/** Matches `workshops_description_length`. Two sentences in the dialog. */
export const WORKSHOP_DESCRIPTION_MAX_LENGTH = 280;

/**
 * Trims and collapses a summary, or null when the officer has written nothing.
 *
 * Exported because the refusal rule needs the same normalized text this
 * produces. It reports the length that was measured, and a message quoting a
 * different number than the rule applied is worse than no message.
 */
export function normalizeMeetingSummary(value: AirtableValue): string | null {
  if (typeof value !== "string") return null;
  // Long text arrives with whatever line breaks the officer typed. Collapsing
  // them is what makes the character count mean the same thing as the count
  // the card will lay out.
  const collapsed = value.trim().replace(/\s+/g, " ");
  return collapsed === "" ? null : collapsed;
}

/**
 * The closed list of meeting kinds.
 *
 * Short on purpose, because `Kind` is an OVERRIDE and not a label for every
 * night. A meeting that runs workshops already derives as a workshop night
 * from its own structure, and one that judges a competition derives as
 * judging; naming those here would create two sources for one fact. What is
 * left is the nights whose structure cannot describe them. Nothing in the
 * schema distinguishes a social from an empty calendar entry.
 */
export const MEETING_KIND_CHOICES = [
  "Build Session",
  "Study Session",
  "Interest Meeting",
  "Social",
] as const;

export type MeetingKind = (typeof MEETING_KIND_CHOICES)[number];

// Derived from the tuple rather than retyped, so the Airtable dropdown, the
// parser and the database constraint cannot drift apart.
const MEETING_KINDS: ReadonlySet<string> = new Set(MEETING_KIND_CHOICES);

/** The value if it is one of `MEETING_KIND_CHOICES`, else null. */
export function parseMeetingKind(value: AirtableValue): MeetingKind | null {
  if (typeof value !== "string") return null;
  return MEETING_KINDS.has(value) ? (value as MeetingKind) : null;
}

/**
 * The buildings a meeting can be held in.
 *
 * A closed list, unlike the free text it sits beside, because this value has a
 * job beyond being printed: the directions dialog highlights the building on a
 * campus map, and a highlight needs a footprint. Every key here has one, drawn
 * from OpenStreetMap by `scripts/generate-campus-map.ts` in the app, which is
 * where the real list lives. This is a copy, because this package is upstream
 * of the app and importing downward would invert the dependency.
 *
 * `buildings.test.ts` in the app holds the two together, rather than anyone
 * remembering, since the failure mode is quiet: a building the map cannot draw
 * produces a dialog with a pin over nothing, and nobody finds out until a
 * meeting is scheduled there.
 *
 * `Other` is not a building, it is the absence of one, the escape hatch for a
 * room the map does not cover. It stores fine and draws nothing; the free-text
 * Location beside it carries the detail.
 */
export const MEETING_BUILDING_CHOICES = [
  "DLW",
  "Driftmier",
  "Plant Sciences",
  "Boyd",
  "MLC",
  "Science Learning Center",
  "Science Library",
  "Poultry Science",
  "Main Library",
  "Tate",
  "Other",
] as const;

export type MeetingBuilding = (typeof MEETING_BUILDING_CHOICES)[number];

// Derived from the tuple rather than retyped, so the Airtable dropdown, the
// parser and the database constraint cannot drift apart.
const MEETING_BUILDINGS: ReadonlySet<string> = new Set(
  MEETING_BUILDING_CHOICES,
);

/** The value if it is one of `MEETING_BUILDING_CHOICES`, else null. */
export function parseMeetingBuilding(
  value: AirtableValue,
): MeetingBuilding | null {
  if (typeof value !== "string") return null;
  return MEETING_BUILDINGS.has(value) ? (value as MeetingBuilding) : null;
}

/**
 * Hosts an RSVP link may point at.
 *
 * Seeded with the UGA Involvement Network, where the club's events already
 * live. Same origin as `INVOLVEMENT_NETWORK_URL` in
 * `apps/platform/src/config/nav.ts`, retyped rather than imported because this
 * package is upstream of the app and importing downward would invert the
 * dependency. Keep the two in step by hand if the Involvement Network moves.
 *
 * An allowlist rather than a scheme check, because the value is rendered as an
 * href on a public page under the club's name. "https and well-formed" still
 * lets one mispaste point every member somewhere else entirely.
 */
export const RSVP_URL_ALLOWED_HOSTS: readonly string[] = ["uga.campuslabs.com"];

/**
 * The shape an accepted RSVP link must have, character for character.
 *
 * The host allowlist alone is not enough, because `new URL()` accepts a great
 * deal this must not store: `https://someone@uga.campuslabs.com/x` has the
 * allowed hostname and is still a credential-carrying URL. This is also the
 * JavaScript twin of the `meetings_rsvpUrl_host` check constraint. The parser
 * has to be at least as strict as the database, or a value it accepts becomes
 * an insert the constraint rejects, which takes down the whole sync pass.
 *
 * Tested against the CANONICALIZED url rather than the officer's text, so the
 * string this approves is exactly the string that gets stored.
 */
const RSVP_URL_SHAPE = /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9/_?=&.%#:~-]*)?$/;

/**
 * An RSVP link in canonical form, or null if it is not one this may publish.
 *
 * `https:` only and an allowlisted host. Anything else is null: `http:`, a
 * `javascript:` URI, a link to somebody's Google Form, a half-typed address.
 * The app's refusal rule turns that null into a message in the officer's grid,
 * so the rejection is visible where the paste happened.
 *
 * ## It returns `url.toString()`, not the officer's text, and that matters
 *
 * A host comparison is case-insensitive and a regex is not, so
 * `https://UGA.CampusLabs.com/engage` passes the allowlist and fails the
 * `meetings_rsvpUrl_host` constraint. The parser would accept a value the
 * insert then rejects, and a constraint violation inside the pull takes down
 * the whole sync pass rather than refusing one field. Storing what `URL`
 * canonicalized (lowercased host, default port dropped) closes that gap by
 * construction: the string tested is the string stored.
 */
export function parseRsvpUrl(value: AirtableValue): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // `new URL` throws on garbage, and garbage is exactly what a mispaste
    // produces. Throwing here would fail the pass for every table.
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!RSVP_URL_ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) return null;

  const canonical = url.toString();
  if (!RSVP_URL_SHAPE.test(canonical)) return null;

  return canonical;
}

/**
 * An Airtable datetime string, or null when it is not a date at all.
 *
 * Airtable returns ISO-8601 for a date cell, so the guard looks redundant, and
 * for `startsAt` and `endsAt` it very nearly was: `new Date(x) > new Date(y)`
 * is false when either side is Invalid Date, so the completeness gate happened
 * to catch it. `cancelledAt` has no such comparison, so an unparseable value
 * reached drizzle's timestamp mapper, which calls `.toISOString()` on it and
 * throws `RangeError` mid-pull.
 *
 * Relying on a neighbouring comparison to reject bad input is the kind of
 * accident that holds until someone adds a third date. This states it.
 */
export function parseAirtableDateTime(value: AirtableValue): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed;
}

// ── Tables ───────────────────────────────────────────────────────────────────
//
// The `⚙️` prefix marks a field the platform writes. It is a naming convention
// for officers rather than anything the API understands: it says "editing this
// will be overwritten on the next pass". Field editing permissions are what
// prevent that, and they are configured by hand. See the runbook.

/**
 * Members.
 *
 * Push-only apart from dues. The match key is `⚙️ Platform ID` and NOT the UGA
 * email, for two reasons that agree: a MyID can change with a legal name
 * change, and `email`-typed fields are not eligible in `fieldsToMergeOn` at
 * all. The second makes it a requirement rather than a preference.
 */
export const members = table("Members", "tblLTJtir40NrL87x", {
  platformId: field
    .text("fldXg9IE8LgkjhfKy", "⚙️ Platform ID")
    .matchKey()
    .push((m: MemberRow) => m.userId),

  // The human-readable field an officer sets as the Members primary in Airtable,
  // so a Member chip on any linked record reads as a person, not a UUID.
  // `preferredName` is NOT NULL on the profile, so this is never blank; the
  // legal-name fallback is belt-and-suspenders for a row that somehow arrives
  // without one. Kept after `platformId` so the scaffolder still makes Platform
  // ID the primary on a fresh base, matching every other table — the live
  // primary is a dashboard choice the sync does not depend on.
  name: field
    .text("flddUp1hUoD2W79Qa", "Name")
    .push(
      (m: MemberRow) =>
        m.preferredName ||
        [m.legalFirstName, m.legalLastName].filter(Boolean).join(" ") ||
        null,
    ),

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

/**
 * Projects, officer-authored.
 *
 * ⚠️ This table used to move the OTHER WAY, and the flip is the fix for a bug
 * rather than a preference.
 *
 * It was the one officer-facing table that was pushed: the platform owned the
 * rows and Airtable held a read-only mirror. Nothing in the platform could
 * create one. There was no console page, no server action and no seed, RLS
 * denies every client write, and the only inserts anywhere in the repo were
 * test fixtures — while `pullWorkshops` refused to create a workshop whose
 * Project link did not resolve. An officer doing the obvious thing, typing a
 * project name into Airtable's link picker, produced a Projects row with no
 * `⚙️ Platform ID`; `projectIdMap` accepted only rows carrying one, so the
 * link was unresolvable, and it stayed unresolvable on every pass forever
 * because no amount of waiting issues an id to a row the platform never made.
 * Their workshop simply never appeared.
 *
 * Pulling it removes the failure instead of reporting it. The Project link now
 * resolves through the pull's idMap exactly like the Meeting link beside it,
 * and `pushProjects` and `projectIdMap` are both gone.
 *
 * `⚙️ Slug` is gone with them. The slug is derived once on insert from the
 * name and never recomputed — the rule `meetings.slug` follows, and sharper
 * here, because `stars.csv` is keyed on it across semesters and regenerating
 * it on a rename would rewrite an export somebody already has. A column
 * showing officers a value they cannot edit and must not rely on was worth
 * less than the confusion it invited.
 *
 * `⚙️ Platform ID` stays, pushed and the match key, because `applyPull` reads
 * one on every table. It is written by nothing now, which is exactly the state
 * `meetings` is in: identity here is the Airtable record id.
 */
export const projects = table("Projects", "tblqcG8xDrOMuBTvF", {
  platformId: field
    .text("fldniryZw7v0j7MuD", "⚙️ Platform ID")
    .matchKey()
    .push((p: { id: string }) => p.id),

  // What the officers call it: "Platform", "Optimal Schedule Builder".
  //
  // Refused past the cap rather than truncated, like every other authored
  // string here. Half a project name under a workshop chip is worse than the
  // previous name staying up while somebody shortens it.
  displayName: field.text("fldaDoMwYJlhoxODU", "Name").pull((v) => {
    const text = normalizeMeetingSummary(v);
    if (text === null) return null;
    return text.length > PROJECT_NAME_MAX_LENGTH ? null : text;
  }),

  // Where it sits among the other projects, which decides the order workshops
  // are listed in on a meeting. Officer-facing on purpose: the ordering is an
  // editorial call about which project leads the night, and it was a column
  // only the platform could change.
  //
  // Non-integers are fine and the type is `double precision` for that reason:
  // 1.5 slots a project between two others without renumbering the rest.
  sortOrder: field
    .number("fldxSJc7VLT9Msruq", "Order")
    .pull((v) => (typeof v === "number" && Number.isFinite(v) ? v : null)),

  syncStatus: field.longText("fldVGonACJHsZpQif", "⚙️ Sync status").status(),
});

/**
 * Meetings, officer-authored, so most fields are PULLED.
 *
 * The platform pushes only its own id and the derived attendance count. The
 * schedule itself belongs to whoever is running the semester.
 */
export const meetings = table("Meetings", "tblYhJZWMnBrZ4ylM", {
  platformId: field
    .text("fldIBjOSNweMYXAaj", "⚙️ Platform ID")
    .matchKey()
    .push((m: MeetingRow) => m.id),
  // The label stays "Name" on purpose, even though the column and this key are
  // now `nameOverride`. This string is cosmetic: `verify` matches live fields
  // by field ID (a rename is invisible to it, by design), and reads/writes go
  // over the wire by field ID too. The only thing that consumes the name is the
  // scaffolder, which is create-only and uses it just to name a field it is
  // creating for the first time — so editing it here does nothing to an
  // existing base and will not rename a live column. Keep it aligned with the
  // Airtable label anyway, as documentation of what the column is.
  nameOverride: field
    .text("fldc0NfTHVxHk8Za0", "Name")
    // Capped, not just trimmed. `meetings_nameOverride_length` is a check
    // constraint, so an 81st character used to be a rejected INSERT in the
    // middle of the pull rather than a refused field: one keystroke taking
    // down every table in the pass. Refused rather than truncated, for the
    // same reason the summary is. Half a name under an officer's heading is
    // worse than the fallback the schedule already knows how to render.
    .pull((v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (trimmed === "") return null;
      return trimmed.length > MEETING_NAME_OVERRIDE_MAX_LENGTH ? null : trimmed;
    }),
  // Which building, from a list the campus map can draw.
  //
  // Null is ordinary and means two different things that do not need telling
  // apart here: nobody has picked one yet, or the officer picked a value this
  // side does not know. Either way the dialog falls back to the free-text
  // Location below and offers no map, which is the honest answer.
  building: field
    .singleSelect("fldZoHoKMT4JE2R1C", "Building", MEETING_BUILDING_CHOICES)
    .pull((v) => parseMeetingBuilding(v)),

  // Where inside the building: "124", "Room 148", "the second-floor lounge".
  //
  // Still free text and still called Location, on purpose. Rooms are not a
  // list anyone wants to maintain, and the pair reads as one address in the
  // officer's grid. It is no longer the whole answer, though. Anything that
  // needs to KNOW where a meeting is reads `building` instead: the map
  // highlight, the floor plan, the "not the usual room" flag. Sniffing a
  // building's name out of typed text is a guess and this is not.
  location: field
    .text("fld3MRTF42aS6c3PX", "Location")
    .pull((v) => (typeof v === "string" ? v : null)),
  startsAt: field
    .dateTime("fld0iXyGZpgW7zJWF", "Starts at")
    .pull((v) => parseAirtableDateTime(v)),
  endsAt: field
    .dateTime("fldEjZPZGVJG3qZEl", "Ends at")
    .pull((v) => parseAirtableDateTime(v)),
  // What the night is about, in an officer's own words.
  //
  // Null is the ordinary state, not an error: the events page derives an
  // agenda from the meeting's workshops when there is no summary, so most
  // weeks need nothing written here at all. `parse` returns null for a summary
  // that is too long as well, see `MEETING_SUMMARY_MAX_LENGTH`. It never
  // TRUNCATES, because publishing the first 240 characters puts half a
  // sentence under an officer's name on a public page with no way for them to
  // know it happened. `checkMeeting` in the app turns that null into a message
  // in this row's `⚙️ Sync status` instead.
  summary: field.longText("fld2t0yGBtegiryKy", "Summary").pull((v) => {
    const text = normalizeMeetingSummary(v);
    if (text === null) return null;
    return text.length > MEETING_SUMMARY_MAX_LENGTH ? null : text;
  }),

  // An override for a night whose STRUCTURE cannot describe it.
  //
  // Not a label for every meeting: a night with workshops already derives as a
  // workshop night, and giving it a Kind as well would be two answers to one
  // question. See `MEETING_KIND_CHOICES` for why the list is four values long.
  kind: field
    .singleSelect("fldsGXvpFlZenWEPq", "Kind", MEETING_KIND_CHOICES)
    .pull((v) => parseMeetingKind(v)),

  // Per-meeting RSVP link, normally an Involvement Network event page.
  //
  // Host-allowlisted rather than merely well-formed, because this is rendered
  // as an href on a public page under the club's name.
  rsvpUrl: field.url("fldjHxkT7AqSFxm1o", "RSVP").pull((v) => parseRsvpUrl(v)),

  // When the night was called off. Emphatically not a way to DELETE a meeting:
  // deleting the Airtable row soft-archives it and the page forgets it ever
  // existed, which is exactly what leaves somebody walking to a building for a
  // meeting that is not happening. Setting this keeps the row on the schedule,
  // struck through.
  cancelledAt: field
    .dateTime("fld5JjWXM1om14UHs", "Cancelled")
    .pull((v) => parseAirtableDateTime(v)),

  // Why. Null even when `cancelledAt` is set: the fact and the explanation
  // arrive in separate keystrokes, and the page states the fact without it.
  //
  // Capped at the same 160 characters as the check constraint, and refused
  // rather than truncated for the reason the summary is: publishing half a
  // sentence under an officer's name with no signal anywhere is worse than
  // putting a message in the cell they typed it into.
  cancellationReason: field
    .text("fldJLfFhWGD3elJjg", "Cancellation reason")
    .pull((v) => {
      const text = normalizeMeetingSummary(v);
      if (text === null) return null;
      return text.length > MEETING_CANCELLATION_REASON_MAX_LENGTH ? null : text;
    }),

  countsTowardProgress: field
    .checkbox("fldeFR8rpFsxtrn0o", "Counts toward progress")
    .pull((v) => v === true),
  elEligible: field
    .checkbox("fldQ3kznHDThetBK8", "EL eligible")
    .pull((v) => v === true),

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
  // Optional now. A workshop that teaches a SKILL rather than a codebase,
  // career-fair readiness say, belongs to no project, and inventing one would
  // put that session on the public Projects page as a body of work the club
  // does not have.
  project: field
    .link("fldhUjEo0dq5BRZez", "Project", "projects")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),

  // What the officers call this session: "Supabase", "Career Fair Readiness".
  // The published schedule has always named workshops by topic while the
  // schema named them by project, so the page printed "Platform" where the
  // officers wrote "Next.js". This is the officers' word winning.
  //
  // Null falls back to the project's name, so every workshop authored before
  // this field existed keeps rendering exactly as it did.
  title: field.text("fldaY1lWS1qBJsqrp", "Title").pull((v) => {
    const text = normalizeMeetingSummary(v);
    if (text === null) return null;
    return text.length > WORKSHOP_TITLE_MAX_LENGTH ? null : text;
  }),

  // What it teaches, for the meeting's detail dialog. Worth writing even when
  // the title is self-explanatory: workshops are self-contained and assume no
  // prior work, and that is the single most useful thing a prospective member
  // can learn before deciding whether they are qualified to turn up.
  description: field.longText("fldEBAaKW0mjaiS8Q", "Description").pull((v) => {
    const text = normalizeMeetingSummary(v);
    if (text === null) return null;
    return text.length > WORKSHOP_DESCRIPTION_MAX_LENGTH ? null : text;
  }),

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
    .link("fldu9sZHLPg0TTGpX", "Workshop", "workshops")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  judgingStartsAt: field
    .dateTime("fld9p3FVXCuFWJF7b", "Judging starts")
    .pull((v) => parseAirtableDateTime(v)),
  // Both numbers are bounded here because both are check constraints:
  // `competitions_requirementCount_nonneg` and
  // `competitions_maxTeamSize_positive`. Typing 0 into Max team size is an
  // ordinary slip and used to be a rejected insert mid-pull, which ends the
  // pass for every table rather than refusing one cell.
  //
  // Non-integers are rejected too. Airtable's number field has a precision
  // setting an officer can change, and 2.5 people is not a team size.
  requirementCount: field
    .number("fldu17YKeE2FYBkOc", "Requirements")
    .pull((v) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null,
    ),
  maxTeamSize: field
    .number("fldGij8ChmqGklbwh", "Max team size")
    .pull((v) =>
      typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null,
    ),
  countsTowardProgress: field
    .checkbox("fldyTWr0jPHLMd3FO", "Counts toward progress")
    .pull((v) => v === true),
  elEligible: field
    .checkbox("fldWcPMV3MWkjrH9t", "EL eligible")
    .pull((v) => v === true),
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
 * A read-only projection of authoritative platform attendance.
 *
 * Officers no longer create or edit these rows directly. Corrections arrive
 * as commands through the separate Officer Changes form, are validated and
 * audited in Postgres, and then appear here on the next push. Deleting a row
 * is harmless: upsert recreates it from the attendance UUID.
 */
export const attendanceTable = table("Attendance", "tblVgyeo1q9vk0ddD", {
  platformId: field
    .text("fldg06bTtZFYVcErp", "⚙️ Platform ID")
    .matchKey()
    .push((a: AttendanceRow) => a.id),

  member: field
    .link("fldwJxi1Jm0gzykDW", "⚙️ Member", "members")
    .push((a: AttendanceRow) => [a.memberAirtableId]),
  meeting: field
    .link("fldFehEX3HmzKW2yv", "Meeting", "meetings")
    .push((a: AttendanceRow) => [a.meetingAirtableId]),
  method: field
    .singleSelect("fld4CosVKlvMZpO91", "⚙️ Method", [
      "QR",
      "Manual code",
      "Officer",
    ] as const)
    .push((a: AttendanceRow) =>
      a.method === "manual_code"
        ? "Manual code"
        : a.method === "officer"
          ? "Officer"
          : "QR",
    ),
  recordedAt: field
    .dateTime("fldy2KTztwZvrt7sZ", "⚙️ Recorded at")
    .push((a: AttendanceRow) => a.recordedAt),
  revoked: field
    .checkbox("fldc2EI4R9TiRsb20", "⚙️ Revoked")
    .push((a: AttendanceRow) => a.revoked),
  revocationReason: field
    .longText("fldeg3snMYlWedD25", "⚙️ Revocation reason")
    .pushClearable((a: AttendanceRow) => a.revocationReason),
});

/**
 * Append-only form responses requesting changes to authoritative state.
 * Input fields are deliberately ignored by projection writes; the scheduled
 * or manual sync snapshots one response, validates it, and writes only the
 * processing fields below. Officers never edit Attendance projections.
 */
export const officerChangesTable = table(
  "Officer Changes",
  "tblxVnlGBq5mbR1u5",
  {
    targetId: field.text("fld0kB2uIYOqovM5p", "Target platform ID").ignore(),
    formResponseRecordId: field
      .text("fldtsfXM7cflE1ecY", "⚙️ Form response ID")
      .matchKey()
      .push((row: OfficerChangeRow) => row.formResponseRecordId),
    command: field
      .singleSelect("fldLQGEgssJr29bAz", "Command", [
        "Add attendance",
        "Revoke attendance",
        "Restore attendance",
        "Grant competition participation",
        "Revoke competition participation",
        "Clear competition participation override",
        "Edit reflection",
      ] as const)
      .ignore(),
    member: field.text("fldpjrEDvWElsjtq8", "Member MyID").ignore(),
    meetingId: field.text("fld1AGug56uC8kqug", "Meeting platform ID").ignore(),
    reason: field.longText("fld5pq8yZxG3WLVtM", "Correction reason").ignore(),
    createdBy: field.createdBy("fldBhPNuG7fGPSeij", "Created by").ignore(),
    reflectionContent: field
      .longText("fldywB2BObff6aROE", "Reflection content")
      .ignore(),
    clearReflectionContent: field
      .checkbox("fld2ZgpC34p4NVBFO", "Clear reflection content")
      .ignore(),
    reflectionState: field
      .singleSelect("fldi4rqSZbsGdNew3", "Reflection state", [
        "Draft",
        "Submitted",
      ] as const)
      .ignore(),
    newMember: field.text("fld9Q2kYWwy5Ta2Ap", "New member MyID").ignore(),
    newMeetingId: field
      .text("fld4Gp3IPgTDiO6wa", "New meeting platform ID")
      .ignore(),
    newCompetitionId: field
      .text("fldEdlPrMkXwh3nQg", "New competition platform ID")
      .ignore(),
    status: field
      .singleSelect("fldjYkqzAiy4HR9hT", "⚙️ Processing status", [
        "Pending",
        "Applied",
        "Rejected",
        "Retryable",
      ] as const)
      .push((row: OfficerChangeRow) => row.status),
    processedAt: field
      .dateTime("fld564oqKGXjCp9C9", "⚙️ Processed at")
      .pushClearable((row: OfficerChangeRow) => row.processedAt),
    auditEventId: field
      .text("fldMrPvim5CHD4BaB", "⚙️ Audit event ID")
      .pushClearable((row: OfficerChangeRow) => row.auditEventId),
    error: field
      .longText("fldu8HfCb95aXdGdf", "⚙️ Validation error")
      .pushClearable((row: OfficerChangeRow) => row.error),
  },
);

/** Platform-owned EL evidence. Officer corrections go through Officer Changes. */
export const elReflectionsTable = table("EL Reflections", "tblU6bJTxyY14SyK1", {
  platformId: field
    .text("fldAAdfehG54Cwk6Z", "⚙️ Platform ID")
    .matchKey()
    .push((row: ReflectionRow) => row.id),
  member: field
    .link("fldjtuJGCQPLrsSBz", "⚙️ Member", "members")
    .push((row: ReflectionRow) => [row.memberAirtableId]),
  meeting: field
    .link("fld3m7QttXHmISBb9", "⚙️ Meeting", "meetings")
    .pushClearable((row: ReflectionRow) =>
      row.meetingAirtableId ? [row.meetingAirtableId] : null,
    ),
  competition: field
    .link("fld3PX7K6E6ftUln3", "⚙️ Competition", "competitions")
    .pushClearable((row: ReflectionRow) =>
      row.competitionAirtableId ? [row.competitionAirtableId] : null,
    ),
  content: field
    .longText("fldPdvrIG9nKd1bF4", "⚙️ Reflection")
    .push((row: ReflectionRow) => row.content),
  state: field
    .singleSelect("fldBtR3plntD3TRuF", "⚙️ State", [
      "Draft",
      "Submitted",
    ] as const)
    .push((row: ReflectionRow) => row.state),
  submittedAt: field
    .dateTime("fld6hVB5ZKxFs7BhH", "⚙️ Submitted at")
    .pushClearable((row: ReflectionRow) => row.submittedAt),
});

/** Singleton officer-authored policy, globally applied to every reflection. */
export const platformSettingsTable = table(
  "Platform Settings",
  "tblHfmgt55SIiugdS",
  {
    platformId: field
      .text("fldvvZtnRXFdyQVyw", "⚙️ Platform ID")
      .matchKey()
      .push((row: PlatformSettingsRow) => row.id),
    minimumWordCount: field
      .number("fldS8m3OleODDu5eD", "Minimum words")
      .pull((value) =>
        typeof value === "number" && Number.isInteger(value) && value > 0
          ? value
          : null,
      ),
    submissionWindowDays: field
      .number("fldqWX2nwV7wj9jSk", "Submission window days")
      .pull((value) =>
        typeof value === "number" && Number.isInteger(value) && value > 0
          ? value
          : null,
      ),
    syncStatus: field.longText("fldBRBkoKqgP5CSng", "⚙️ Sync status").status(),
  },
);

export const registry = {
  members,
  projects,
  meetings,
  workshops,
  competitions,
  teams: teamsTable,
  attendance: attendanceTable,
  officerChanges: officerChangesTable,
  elReflections: elReflectionsTable,
  platformSettings: platformSettingsTable,
} as const;

export type RegistryTable = keyof typeof registry;
