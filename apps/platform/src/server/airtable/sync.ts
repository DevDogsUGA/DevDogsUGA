import {
  applyPull,
  competitions as competitionsSpec,
  meetings as meetingsSpec,
  projects as projectsSpec,
  workshops as workshopsSpec,
  type AirtableRecord,
} from "@devdogsuga/airtable";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { clubDateKey } from "~/lib/eventTime";
import { db } from "~/server/db";
import {
  attendance,
  competitions,
  competitionStandings,
  meetings,
  projects,
  teams,
  workshops,
} from "~/server/db/schema";
import {
  checkCompetition,
  checkMeeting,
  describeIncompleteMeeting,
  checkWorkshop,
  type Refusal,
} from "./refusals";

/**
 * The pull half of the sync: Airtable is the CMS, so this is where officer
 * edits become platform rows.
 *
 * Three properties hold throughout, and they are the reason this is longer
 * than a mapping loop would be:
 *
 *   * **Identity is the Airtable record id, never the name or slug.** Record
 *     ids survive renames, field edits, view re-sorts and moves between views.
 *     Matching on a name would break the first time somebody fixed a typo, and
 *     break in the worst way — a second row that looks right, while the credit
 *     already earned stays attached to the first.
 *
 *   * **An incomplete row is skipped, not refused.** Officers fill Airtable
 *     fields one at a time, and a pass landing between two keystrokes must not
 *     write a complaint into a row that will be complete thirty seconds later.
 *
 *   * **A missing Airtable record is an archive, never a delete.** Attendance
 *     is a record of who was in a room on a Tuesday, and no amount of "I
 *     deleted the wrong row" in a spreadsheet erases that.
 */

export interface PullCounts {
  upserted: number;
  archived: number;
  skipped: number;
}

export interface PullOutcome extends PullCounts {
  refusals: Refusal[];
  /** Airtable record id → platform uuid, for the tables downstream of this one. */
  idMap: Map<string, string>;
}

function emptyOutcome(): PullOutcome {
  return {
    upserted: 0,
    archived: 0,
    skipped: 0,
    refusals: [],
    idMap: new Map(),
  };
}

// ── Meetings ─────────────────────────────────────────────────────────────────

interface MeetingValues {
  nameOverride: string | null;
  building: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  attendanceForm: string | null;
  summary: string | null;
  kind: string | null;
  rsvpUrl: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/**
 * Slugs a meeting may not take, because a static route already answers them.
 *
 * `/events/directions` is a page, and meeting pages live at `/events/<slug>`.
 * A meeting named "Directions" would slug to `directions` and be shadowed by
 * that route forever — the URL would render the directions page, and the
 * meeting would be unreachable at the only address anybody had for it. The
 * slug is derived once on insert and never recomputed, so this is not a
 * problem that fixes itself on the next pass.
 *
 * Reserving it here makes `uniqueSlug` pick `directions-2` instead, which is
 * ugly and works, rather than pretty and gone.
 */
const RESERVED_MEETING_SLUGS = ["directions"] as const;

/**
 * Meetings have no refusal rules of the destructive kind — nothing downstream
 * of a meeting can be invalidated by renaming it or moving it an hour later,
 * because attendance hangs off the row rather than off its schedule.
 *
 * `checkMeeting` is a different class of rule and does not contradict that.
 * It refuses VALUES that cannot be published — a summary too long for the card
 * it is laid out in, an RSVP link pointing off the allowlisted host — rather
 * than edits that would destroy something already earned. See the note at the
 * top of `refusals.ts`.
 *
 * What it does have is a required shape: `name`, `startsAt`, `endsAt` and
 * `endsAt` are both NOT NULL, and `endsAt > startsAt` is a check
 * constraint. A half-filled row is skipped until it is whole — and SAYS SO in
 * `⚙️ Sync status`, which it did not used to do. Silence there meant a
 * half-filled row and a row the sync had never reached looked identical in the
 * grid: clean status, nothing on the site, no way to tell which.
 *
 * That is a state, not a refusal, and the wording carries the difference. The
 * reason for the old silence still holds — officers fill Airtable fields one
 * at a time, and a pass landing between two keystrokes must not COMPLAIN about
 * a field nobody has reached yet — but saying where the row stands is not
 * complaining, and `.status()` clears itself on the pass after the row becomes
 * whole.
 *
 * The three officer-authored copy fields are deliberately NOT part of that
 * shape. All three are optional, and their absence says nothing at all.
 */
export async function pullMeetings(
  records: AirtableRecord[],
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<MeetingValues>(meetingsSpec, records);

  const existing = await db
    .select({
      id: meetings.id,
      airtableRecordId: meetings.airtableRecordId,
      slug: meetings.slug,
    })
    .from(meetings);

  const byRecordId = new Map(
    existing
      .filter((m) => m.airtableRecordId !== null)
      .map((m) => [m.airtableRecordId!, m]),
  );
  const usedSlugs = new Set([
    ...existing.map((m) => m.slug),
    ...RESERVED_MEETING_SLUGS,
  ]);

  // `checkMeeting` needs the RAW cell alongside the parsed value, because the
  // parser returns null both for "the officer wrote nothing" and for "the
  // officer wrote something unpublishable" — and only the second is a refusal.
  // Keyed by record id rather than zipped by index, so the correspondence is
  // stated rather than inherited from `applyPull` happening to use `.map()`.
  const rawByRecordId = new Map(records.map((r) => [r.id, r.fields]));

  for (const record of parsed) {
    const v = record.values;

    // Before the completeness gate on purpose. These rules are about the VALUE
    // that arrived, not about the state of the row: a summary too long to
    // publish is just as unpublishable on a half-made meeting, and the officer
    // who just typed it is the person best placed to fix it now.
    const raw = rawByRecordId.get(record.airtableRecordId) ?? {};
    const rules = checkMeeting({
      airtableRecordId: record.airtableRecordId,
      rawSummary: raw[meetingsSpec.fields.summary.id],
      summary: v.summary,
      rawRsvpUrl: raw[meetingsSpec.fields.rsvpUrl.id],
      rsvpUrl: v.rsvpUrl,
    });
    out.refusals.push(...rules.refusals);

    // `nameOverride` is deliberately NOT required, unlike every other field
    // that used to gate a meeting. Most nights have no name: a sprint Monday
    // derives its heading from its workshops and its judging, so demanding one
    // would refuse the ordinary case. The slug no longer depends on it either
    // — see below.
    const complete =
      v.startsAt !== null &&
      v.endsAt !== null &&
      new Date(v.endsAt) > new Date(v.startsAt);

    const current = byRecordId.get(record.airtableRecordId);

    if (!complete) {
      out.skipped += 1;
      if (current) out.idMap.set(record.airtableRecordId, current.id);
      // Skipped, and now SAID SO. This was silent, which meant a half-filled
      // row looked identical in the grid to one the sync had never reached:
      // clean status, nothing on the site, no way to tell which. The field
      // already exists on this table and is already written a few lines up for
      // the value refusals, so this is wiring rather than machinery.
      out.refusals.push({
        table: "meetings",
        airtableRecordId: record.airtableRecordId,
        code: "meeting_incomplete",
        message: describeIncompleteMeeting(
          {
            startsAt: v.startsAt,
            endsAt: v.endsAt,
          },
          current !== undefined,
        ),
      });
      continue;
    }

    const values: {
      nameOverride: string | null;
      building?: string | null;
      location: string | null;
      startsAt: Date;
      endsAt: Date;
      attendanceFormUrl: string | null;
      summary?: string | null;
      kind?: string | null;
      rsvpUrl?: string | null;
      cancelledAt?: Date | null;
      cancellationReason?: string | null;
    } = {
      nameOverride: v.nameOverride,
      // Not part of `complete`, like the three below it: a meeting whose
      // officer has not picked a building yet is a meeting, and a pass landing
      // between two of their keystrokes must not refuse the whole row.
      building: v.building,
      location: v.location,
      startsAt: new Date(v.startsAt!),
      endsAt: new Date(v.endsAt!),
      // Null is a legitimate state, not an incomplete one: a meeting with no
      // workshop has no form, and one whose officer has not made this week's
      // yet is a meeting that exists. So it is written through rather than
      // gating `complete`.
      attendanceFormUrl: v.attendanceForm,
      // Same reasoning, three more times. Null clears, because an officer
      // deleting a summary means the page should stop showing it.
      summary: v.summary,
      kind: v.kind,
      rsvpUrl: v.rsvpUrl,
      // Cancellation is written through the same way, and un-cancelling is the
      // reason it must be: an officer clearing the Airtable date has to clear
      // the column too, or the page keeps a night struck through after the
      // club decided it was on again.
      cancelledAt: v.cancelledAt === null ? null : new Date(v.cancelledAt),
      cancellationReason: v.cancellationReason,
    };

    // A refused field is DROPPED from the write rather than written as null.
    // The message says the value has not been published; blanking a summary
    // that was already published, because the replacement is too long, would
    // punish the edit twice. The old text stays up until the new one fits.
    if (rules.rejectedFields.has("summary")) delete values.summary;
    if (rules.rejectedFields.has("rsvpUrl")) delete values.rsvpUrl;

    if (current) {
      await db.update(meetings).set(values).where(eq(meetings.id, current.id));
      out.idMap.set(record.airtableRecordId, current.id);
      out.upserted += 1;
      continue;
    }

    // New in Airtable. The slug is derived once, on insert, and never
    // recomputed: it is in URLs the moment the meeting is published, and
    // regenerating it on every rename would break every link anyone shared.
    //
    // Derived from the meeting's DATE rather than its name, because the name
    // is now nullable and most nights have none. The date is the one thing
    // every meeting has — `startsAt` is `not null` and `complete` above
    // guarantees it here — and it makes a better URL besides: `/events/
    // 2026-09-21` is legible, sortable, and stable under a rename that a
    // name-derived slug would strand.
    //
    // `clubDateKey`, never `toISOString()`. The UTC date rolls at 20:00
    // Eastern under EDT and 19:00 under EST, so the naive version is right for
    // the club's 18:00 slot and files a 20:00 social under the following day —
    // permanently, since this runs once.
    const slug = uniqueSlug(clubDateKey(new Date(v.startsAt!)), usedSlugs);
    usedSlugs.add(slug);

    const [inserted] = await db
      .insert(meetings)
      .values({
        ...values,
        slug,
        airtableRecordId: record.airtableRecordId,
      })
      .returning({ id: meetings.id });

    if (inserted) {
      out.idMap.set(record.airtableRecordId, inserted.id);
      out.upserted += 1;
    }
  }

  out.archived = await archiveMissing(
    meetings,
    parsed.map((p) => p.airtableRecordId),
  );

  return out;
}

// ── Workshops ────────────────────────────────────────────────────────────────

interface WorkshopValues {
  meeting: string | null;
  project: string | null;
  title: string | null;
  description: string | null;
}

/**
 * Workshops carry the first two refusal rules.
 *
 * The link fields arrive as arrays of Airtable record ids, so both have to be
 * resolved through the maps the earlier passes built. An unresolvable link is
 * a skip rather than a refusal — it usually means the linked meeting was
 * itself incomplete this pass.
 */
export async function pullWorkshops(
  records: AirtableRecord[],
  meetingIds: Map<string, string>,
  projectIds: Map<string, string>,
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<WorkshopValues>(workshopsSpec, records);

  const existing = await db
    .select({
      id: workshops.id,
      airtableRecordId: workshops.airtableRecordId,
      meetingId: workshops.meetingId,
      projectId: workshops.projectId,
      attendanceCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.workshopId} = ${workshops.id}
      )`,
    })
    .from(workshops);

  const byRecordId = new Map(
    existing
      .filter((w) => w.airtableRecordId !== null)
      .map((w) => [w.airtableRecordId!, w]),
  );

  for (const record of parsed) {
    const meetingId = record.values.meeting
      ? (meetingIds.get(record.values.meeting) ?? null)
      : null;
    const projectId = record.values.project
      ? (projectIds.get(record.values.project) ?? null)
      : null;

    const current = byRecordId.get(record.airtableRecordId);

    if (current) {
      const rules = checkWorkshop(
        {
          airtableRecordId: record.airtableRecordId,
          attendanceCount: current.attendanceCount,
          currentMeetingId: current.meetingId,
          currentProjectId: current.projectId,
        },
        { meetingId, projectId },
      );
      out.refusals.push(...rules.refusals);

      const values: {
        meetingId?: string;
        projectId?: string | null;
        title?: string | null;
        description?: string | null;
      } = {
        // Written through unconditionally, unlike the two links: clearing the
        // Airtable cell has to clear the column, or the page keeps printing a
        // title an officer deleted.
        title: record.values.title,
        description: record.values.description,
      };
      if (meetingId !== null && !rules.rejectedFields.has("meetingId")) {
        values.meetingId = meetingId;
      }
      // `projectId` may now legitimately go to null: unlinking the project
      // from a session that turned out to teach a skill rather than a codebase
      // is a real edit, and the refusal rules still guard the case where
      // attendance already hangs off the old one.
      if (!rules.rejectedFields.has("projectId")) {
        values.projectId = projectId;
      }

      out.idMap.set(record.airtableRecordId, current.id);

      if (Object.keys(values).length === 0) {
        out.skipped += 1;
        continue;
      }

      await db
        .update(workshops)
        .set(values)
        .where(eq(workshops.id, current.id));
      out.upserted += 1;
      continue;
    }

    // Only the MEETING link is still required. `projectId` became nullable
    // with the events rework, so a career-readiness session -- which belongs to
    // no codebase and never will -- can be created with its project cell empty
    // rather than sitting in Airtable being skipped every pass with no
    // explanation.
    if (meetingId === null) {
      out.skipped += 1;
      continue;
    }

    const [inserted] = await db
      .insert(workshops)
      .values({
        meetingId,
        projectId,
        title: record.values.title,
        description: record.values.description,
        airtableRecordId: record.airtableRecordId,
      })
      .returning({ id: workshops.id });

    if (inserted) {
      out.idMap.set(record.airtableRecordId, inserted.id);
      out.upserted += 1;
    }
  }

  out.archived = await archiveMissing(
    workshops,
    parsed.map((p) => p.airtableRecordId),
  );

  return out;
}

// ── Competitions ─────────────────────────────────────────────────────────────

interface CompetitionValues {
  slug: string | null;
  workshop: string | null;
  judgingStartsAt: string | null;
  requirementCount: number | null;
  maxTeamSize: number | null;
}

export async function pullCompetitions(
  records: AirtableRecord[],
  workshopIds: Map<string, string>,
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<CompetitionValues>(competitionsSpec, records);

  const existing = await db
    .select({
      id: competitions.id,
      airtableRecordId: competitions.airtableRecordId,
      requirementCount: competitions.requirementCount,
      judgingStartsAt: competitions.judgingStartsAt,
      workshopMeetingStartsAt: meetings.startsAt,
      // Standings exist only once the tally has run, which is precisely the
      // moment the arithmetic becomes published.
      isFinalized: sql<boolean>`exists (
        select 1 from ${competitionStandings}
        where ${competitionStandings.competitionId} = ${competitions.id}
      )`,
      // Any frozen team means judging has happened for this competition.
      participationFrozen: sql<boolean>`exists (
        select 1 from ${teams}
        where ${teams.competitionId} = ${competitions.id}
          and ${teams.competedAt} is not null
      )`,
    })
    .from(competitions)
    .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
    .innerJoin(meetings, eq(meetings.id, workshops.meetingId));

  const byRecordId = new Map(
    existing
      .filter((c) => c.airtableRecordId !== null)
      .map((c) => [c.airtableRecordId!, c]),
  );

  for (const record of parsed) {
    const v = record.values;
    const workshopId = v.workshop
      ? (workshopIds.get(v.workshop) ?? null)
      : null;
    const judgingStartsAt = v.judgingStartsAt
      ? new Date(v.judgingStartsAt)
      : null;
    const current = byRecordId.get(record.airtableRecordId);

    if (current) {
      const rules = checkCompetition(
        {
          airtableRecordId: record.airtableRecordId,
          isFinalized: current.isFinalized,
          participationFrozen: current.participationFrozen,
          currentRequirementCount: current.requirementCount,
          currentJudgingStartsAt: current.judgingStartsAt,
          workshopMeetingStartsAt: current.workshopMeetingStartsAt,
        },
        { requirementCount: v.requirementCount, judgingStartsAt },
      );
      out.refusals.push(...rules.refusals);

      const values: Record<string, unknown> = {};
      if (v.slug !== null) values.slug = v.slug;
      if (v.maxTeamSize !== null) values.maxTeamSize = v.maxTeamSize;
      if (
        v.requirementCount !== null &&
        !rules.rejectedFields.has("requirementCount")
      ) {
        values.requirementCount = v.requirementCount;
      }
      if (
        judgingStartsAt !== null &&
        !rules.rejectedFields.has("judgingStartsAt")
      ) {
        values.judgingStartsAt = judgingStartsAt;
      }

      out.idMap.set(record.airtableRecordId, current.id);

      if (Object.keys(values).length === 0) {
        out.skipped += 1;
        continue;
      }

      await db
        .update(competitions)
        .set(values)
        .where(eq(competitions.id, current.id));
      out.upserted += 1;
      continue;
    }

    if (workshopId === null || v.slug === null) {
      out.skipped += 1;
      continue;
    }

    // A brand-new competition gets `judgingStartsAt` unvalidated against the
    // workshop meeting on purpose: the rule guards against MOVING it, and on
    // creation the officer may not have linked the workshop and set the time
    // in the same edit. The next pass sees it as a change and applies the rule
    // then, when both halves are present.
    const [inserted] = await db
      .insert(competitions)
      .values({
        slug: v.slug,
        workshopId,
        judgingStartsAt,
        requirementCount: v.requirementCount,
        maxTeamSize: v.maxTeamSize,
        airtableRecordId: record.airtableRecordId,
      })
      .returning({ id: competitions.id });

    if (inserted) {
      out.idMap.set(record.airtableRecordId, inserted.id);
      out.upserted += 1;
    }
  }

  out.archived = await archiveMissing(
    competitions,
    parsed.map((p) => p.airtableRecordId),
  );

  return out;
}

// ── Projects ─────────────────────────────────────────────────────────────────

/**
 * Projects are platform-authored, so this resolves rather than writes.
 *
 * The push step mirrors them into Airtable; all this needs is the record id
 * each one landed on, so workshop links can be resolved back to a project.
 */
export async function projectIdMap(
  records: AirtableRecord[],
): Promise<Map<string, string>> {
  const parsed = applyPull(projectsSpec, records);
  const known = await db.select({ id: projects.id }).from(projects);
  const ids = new Set(known.map((p) => p.id));

  const map = new Map<string, string>();
  for (const record of parsed) {
    if (record.platformId && ids.has(record.platformId)) {
      map.set(record.airtableRecordId, record.platformId);
    }
  }
  return map;
}

// ── Archival ─────────────────────────────────────────────────────────────────

type ArchivableTable = typeof meetings | typeof workshops | typeof competitions;

/**
 * Deletion in Airtable is a soft archive here, never a hard delete.
 *
 * Scoped to rows that HAVE an `airtableRecordId`: a row created inside the
 * platform has never been in Airtable, so its absence from the fetch says
 * nothing at all. Without that guard the first pass would archive everything
 * the platform authored.
 */
async function archiveMissing(
  table: ArchivableTable,
  presentRecordIds: string[],
): Promise<number> {
  const live = and(
    isNull(table.deletedAt),
    sql`${table.airtableRecordId} is not null`,
  );

  const rows = await db
    .update(table)
    .set({ deletedAt: sql`now()` })
    .where(
      presentRecordIds.length === 0
        ? live
        : and(live, notInArray(table.airtableRecordId, presentRecordIds)),
    )
    .returning({ id: table.id });

  return rows.length;
}

// ── Slugs ────────────────────────────────────────────────────────────────────

function uniqueSlug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "meeting";

  if (!taken.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
