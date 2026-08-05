import { field, table } from "./field.js";

/**
 * The field registry: one declaration read by the push builder, the pull
 * parser and the verifier.
 *
 * Adding a field to the sync is one line here and nothing else. The batching,
 * change detection and `⚙️` prefix conventions are properties of the engine,
 * so a new field inherits them.
 *
 * ## Field IDs are placeholders until the base exists
 *
 * Every `id` below is a PLACEHOLDER. The base has not been scaffolded yet, and
 * the bootstrapping order is deliberately circular-looking:
 *
 *   1. `scaffold.ts` reads the shape below — table names, field names, types —
 *      and creates what is missing through the Meta API.
 *   2. It reads the schema back and prints the real field IDs.
 *   3. `pull-ids.ts` writes them in here, and the result is committed.
 *
 * After that first run the IDs are source. `verify.ts` FAILS on any remaining
 * placeholder rather than warning, because a placeholder that reaches a live
 * sync writes into nothing and reports success.
 */

/** Marks an ID as not-yet-discovered. See `isPlaceholder`. */
function todo(slug: string): string {
  return `fldTODO_${slug}`;
}

export function isPlaceholder(id: string): boolean {
  return id.startsWith("fldTODO_") || id.startsWith("tblTODO_");
}

function todoTable(slug: string): string {
  return `tblTODO_${slug}`;
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
  checkInClosesAt: string;
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
export const members = table("Members", todoTable("members"), {
  platformId: field
    .text(todo("members_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((m: MemberRow) => m.userId),

  ugaEmail: field
    .email(todo("members_uga_email"), "UGA email")
    .push((m: MemberRow) => m.ugaEmail),

  legalName: field
    .text(todo("members_legal_name"), "Legal name")
    .push(
      (m: MemberRow) =>
        [m.legalFirstName, m.legalLastName].filter(Boolean).join(" ") || null,
    ),

  meetingsAttended: field
    .number(todo("members_meetings_attended"), "⚙️ Meetings attended")
    .push((m: MemberRow) => m.meetingCount),

  duesPaidAt: field
    .date(todo("members_dues_paid"), "Dues paid")
    .pull((value) => (typeof value === "string" ? value : null)),

  notes: field.longText(todo("members_notes"), "Notes").ignore(),
});

export const projects = table("Projects", todoTable("projects"), {
  platformId: field
    .text(todo("projects_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((p: ProjectRow) => p.id),
  slug: field
    .text(todo("projects_slug"), "⚙️ Slug")
    .push((p: ProjectRow) => p.slug),
  displayName: field
    .text(todo("projects_name"), "Name")
    .push((p: ProjectRow) => p.displayName),
});

/**
 * Meetings — officer-authored, so most fields are PULLED.
 *
 * The platform pushes only its own id and the derived attendance count. The
 * schedule itself belongs to whoever is running the semester.
 */
export const meetings = table("Meetings", todoTable("meetings"), {
  platformId: field
    .text(todo("meetings_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((m: MeetingRow) => m.id),
  name: field
    .text(todo("meetings_name"), "Name")
    .pull((v) => (typeof v === "string" ? v : null)),
  location: field
    .text(todo("meetings_location"), "Location")
    .pull((v) => (typeof v === "string" ? v : null)),
  startsAt: field
    .dateTime(todo("meetings_starts_at"), "Starts at")
    .pull((v) => (typeof v === "string" ? v : null)),
  endsAt: field
    .dateTime(todo("meetings_ends_at"), "Ends at")
    .pull((v) => (typeof v === "string" ? v : null)),
  checkInClosesAt: field
    .dateTime(todo("meetings_check_in_closes"), "Check-in closes")
    .pull((v) => (typeof v === "string" ? v : null)),
  attendanceCount: field
    .number(todo("meetings_attendance"), "⚙️ Attendance")
    .push((m: MeetingRow) => m.attendanceCount),
  syncStatus: field
    .longText(todo("meetings_sync_status"), "⚙️ Sync status")
    .push(() => null),
});

export const workshops = table("Workshops", todoTable("workshops"), {
  platformId: field
    .text(todo("workshops_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((w: WorkshopRow) => w.id),
  meeting: field
    .link(todo("workshops_meeting"), "Meeting")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  project: field
    .link(todo("workshops_project"), "Project")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  attendanceCount: field
    .number(todo("workshops_attendance"), "⚙️ Attendance")
    .push((w: WorkshopRow) => w.attendanceCount),
});

export const competitions = table("Competitions", todoTable("competitions"), {
  platformId: field
    .text(todo("competitions_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((c: CompetitionRow) => c.id),
  slug: field
    .text(todo("competitions_slug"), "Branch slug")
    .pull((v) => (typeof v === "string" ? v : null)),
  workshop: field
    .link(todo("competitions_workshop"), "Workshop")
    .pull((v) => (Array.isArray(v) ? (v[0] ?? null) : null)),
  judgingStartsAt: field
    .dateTime(todo("competitions_judging_starts"), "Judging starts")
    .pull((v) => (typeof v === "string" ? v : null)),
  requirementCount: field
    .number(todo("competitions_requirements"), "Requirements")
    .pull((v) => (typeof v === "number" ? v : null)),
  maxTeamSize: field
    .number(todo("competitions_max_team_size"), "Max team size")
    .pull((v) => (typeof v === "number" ? v : null)),
  teamCount: field
    .number(todo("competitions_team_count"), "⚙️ Teams")
    .push((c: CompetitionRow) => c.teamCount),
});

export const teamsTable = table("Teams", todoTable("teams"), {
  platformId: field
    .text(todo("teams_platform_id"), "⚙️ Platform ID")
    .matchKey()
    .push((t: TeamRow) => t.id),
  name: field.text(todo("teams_name"), "⚙️ Name").push((t: TeamRow) => t.name),
  memberCount: field
    .number(todo("teams_members"), "⚙️ Members")
    .push((t: TeamRow) => t.memberCount),
  submissionUrl: field
    .url(todo("teams_submission"), "⚙️ Submission")
    .push((t: TeamRow) => t.submissionUrl),
  competed: field
    .checkbox(todo("teams_competed"), "⚙️ Competed")
    .push((t: TeamRow) => t.competed),
  totalPoints: field
    .number(todo("teams_points"), "⚙️ Points")
    .push((t: TeamRow) => t.totalPoints),
  requirementsMet: field
    .number(todo("teams_requirements_met"), "Requirements met")
    .pull((v) => (typeof v === "number" ? v : null)),
});

export const registry = {
  members,
  projects,
  meetings,
  workshops,
  competitions,
  teams: teamsTable,
} as const;

export type RegistryTable = keyof typeof registry;
