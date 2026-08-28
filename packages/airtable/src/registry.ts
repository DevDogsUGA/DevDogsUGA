import { field, table, type AirtableValue } from "./field.js";

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
 * Written by `pnpm devtools airtable pull-ids` from the live base. Every read and write
 * goes over the wire with these rather than with field NAMES, which is what
 * lets an officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a `todo("slug")` id, run
 * `pnpm devtools airtable scaffold` to create it, then `pnpm devtools airtable pull-ids` to fill
 * the real id in. `verify.ts` FAILS on any remaining placeholder rather than
 * warning, because a placeholder that reaches a live sync writes into nothing
 * and reports success.
 */

/**
 * Marks an ID as not-yet-discovered. See `isPlaceholder`.
 *
 * Exported, and stays exported after the base is scaffolded, because adding a
 * field later uses the same two-step: declare it with a `todo()` id, run
 * `pnpm devtools airtable scaffold` to create it, then `pnpm devtools airtable pull-ids` to
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

/**
 * The officers' base, committed like every `tbl` and `fld` id below it.
 *
 * It was an `environment`-scoped variable routed through Bitwarden to a GitHub
 * environment VARIABLE in all four environments, plus a `narrowed` opt-in to
 * reach `preflight`. That was machinery for a value that has exactly one
 * possible setting: there is one base, and staging deliberately shares it.
 *
 * The argument that settles it is one file down. Every field id in this
 * registry belongs to THIS base, so a second base would need a second
 * registry — parameterising the base id alone never bought the portability it
 * looked like it was buying. Committing it puts the base's identity in one
 * place instead of three, and retires the failure mode that bit us on
 * 2026-08-17: a hand-set repository variable silently shadowed by an
 * environment one, invisible until somebody deletes the environment copy.
 *
 * Public rather than secret — it is in every Airtable dashboard URL, and it
 * identifies without authorising. Every capability belongs to the token.
 * `AIRTABLE_BASE_ID` survives as an override for anyone pointing the tooling
 * at a scratch base; unset, which is now the ordinary case, this is the value.
 */
export const BASE_ID = "appt422RNi98uAqwX";

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
  /**
   * A name for this night, when it has one worth reading. Null is the ordinary
   * case — a sprint Monday derives its heading from its workshops and its
   * judging, and an officer retyping that in prose every week was the
   * duplication the rename removed.
   */
  nameOverride: string | null;
  building: string | null;
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

// ── Officer-authored meeting copy ────────────────────────────────────────────
//
// The three fields below are what let an officer say what a night is ABOUT,
// rather than leaving the events page to infer it from the night's structure.
// Their parsers live here, next to the declarations, because the pull, the
// verifier and the app's refusal rules all need to agree on exactly one
// definition of "acceptable" — and a second copy of that definition is how a
// value gets published that the database then rejects.
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
 * Trims and collapses a summary, or null when the officer has written nothing.
 *
 * Exported because the refusal rule needs the same normalized text this
 * produces — it reports the length that was measured, and a message quoting a
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
 * Deliberately short, because `Kind` is an OVERRIDE and not a label for every
 * night. A meeting that runs workshops already derives as a workshop night
 * from its own structure, and a meeting that judges a competition derives as
 * judging — naming those here would create two sources for one fact. What is
 * left is the set of nights whose structure cannot describe them: there is
 * nothing in the schema that distinguishes a social from an empty calendar
 * entry.
 */
export const MEETING_KIND_CHOICES = [
  "Build session",
  "Study session",
  "Interest meeting",
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
 * from OpenStreetMap by `scripts/generate-campus-map.ts` in the app — which is
 * where the real list lives. This is a copy, because this package is upstream
 * of the app and importing downward would invert the dependency.
 *
 * The two are held together by `buildings.test.ts` in the app rather than by
 * anyone remembering, since the failure mode is quiet: a building the map
 * cannot draw produces a dialog with a pin over nothing, and nobody finds out
 * until a meeting is actually scheduled there.
 *
 * `Other` is not a building, it is the absence of one — the escape hatch for a
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
 * Seeded with the UGA Involvement Network, which is where the club's events
 * already live — the same origin as `INVOLVEMENT_NETWORK_URL` in
 * `apps/platform/src/config/nav.ts`. It is retyped rather than imported
 * because this package is upstream of the app and importing downward would
 * invert the dependency; keep the two in step by hand if the Involvement
 * Network ever moves.
 *
 * An allowlist rather than a scheme check, because the value is rendered as an
 * href on a public page under the club's name. "https and well-formed" still
 * lets one mispaste point every member at somewhere else entirely.
 */
export const RSVP_URL_ALLOWED_HOSTS: readonly string[] = ["uga.campuslabs.com"];

/**
 * The shape an accepted RSVP link must have, character for character.
 *
 * The host allowlist alone is not enough, because `new URL()` accepts a great
 * deal this must not store: `https://someone@uga.campuslabs.com/x` has the
 * allowed hostname and is still a credential-carrying URL. This is also the
 * JavaScript twin of the `meetings_rsvpUrl_host` check constraint — the parser
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
 * `https:` only and an allowlisted host. Anything else — `http:`, a
 * `javascript:` URI, a link to somebody's Google Form, a half-typed address —
 * is null, and the app's refusal rule turns that null into a message in the
 * officer's grid so the rejection is visible where the paste happened.
 *
 * ## It returns `url.toString()`, not the officer's text, and that matters
 *
 * A host comparison is case-insensitive and a regex is not, so
 * `https://UGA.CampusLabs.com/engage` passes the allowlist and fails the
 * `meetings_rsvpUrl_host` constraint — the parser would accept a value the
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
  // The label stays "Name" on purpose, even though the column and this key are
  // now `nameOverride`. `verify` matches the live base by field NAME, so
  // changing this string without renaming the field in the Airtable UI first
  // would fail verification against every existing base. The two move
  // together: relabel it to "Custom name — irregular events only" there, then
  // here, in the same change. The scaffolder will not do it — it is
  // create-only and does not rename.
  nameOverride: field
    .text("fldc0NfTHVxHk8Za0", "Name")
    .pull((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)),
  // Which building, from a list the campus map can actually draw.
  //
  // Null is ordinary and means two different things that do not need telling
  // apart here: nobody has picked one yet, or the officer picked a value this
  // side does not know. Either way the dialog falls back to the free-text
  // Location below and offers no map, which is the honest answer.
  building: field
    .singleSelect("fldZoHoKMT4JE2R1C", "Building", MEETING_BUILDING_CHOICES)
    .pull((v) => parseMeetingBuilding(v)),

  // Where inside the building — "124", "Room 148", "the second-floor lounge".
  //
  // Deliberately still free text and deliberately still called Location: rooms
  // are not a list anyone wants to maintain, and the pair reads as one address
  // in the officer's grid. It is no longer the whole answer, though. Anything
  // that needs to KNOW where a meeting is — the map highlight, the floor plan,
  // the "not the usual room" flag — reads `building`, because sniffing a
  // building's name out of typed text is a guess and this is not.
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
  // What the night is about, in an officer's own words.
  //
  // Null is the ordinary state, not an error: the events page derives an
  // agenda from the meeting's workshops when there is no summary, so most
  // weeks need nothing written here at all. `parse` returns null for a summary
  // that is too long as well — see `MEETING_SUMMARY_MAX_LENGTH`. It never
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
