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
  checkCompetitionValues,
  checkMeeting,
  checkProject,
  describeIncompleteMeeting,
  describeUnbuiltWorkshop,
  checkWorkshop,
  checkWorkshopValues,
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
 *     break in the worst way: a second row that looks right, while the credit
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

/**
 * One row's write, contained.
 *
 * Every rule in `refusals.ts` exists to stop a bad cell reaching Postgres, and
 * each one is a rule somebody had to think of first. This is the answer for
 * the ones nobody has thought of yet.
 *
 * The pull had no `try` anywhere in it, so a constraint violation on a single
 * row unwound out of the loop, past the tables that had not run yet, and into
 * the one whole-pass catch in `run.ts`, which also skipped `writeSyncStatus`.
 * One officer typing one wrong character therefore stopped meetings,
 * workshops, competitions, attendance and both pushes, and reported NOTHING:
 * no refusal for any table reached Airtable, `syncedAt` stayed null, and the
 * grid looked clean. The failure was invisible from the only place anyone
 * would look.
 *
 * Containing it here makes the blast radius one row. The other rows in the
 * pass apply, the tables downstream still run, and the row that failed says so
 * in its own status cell, which is where the officer who edited it is already
 * looking.
 *
 * Deliberately NOT a substitute for a rule. A refusal explains what to change;
 * this can only say that the write was rejected. When this fires for a case
 * that turns out to be ordinary officer work, the fix is a rule in
 * `refusals.ts` that names it, not a better message here.
 */
async function tryWrite<T>(
  out: PullOutcome,
  table: Refusal["table"],
  airtableRecordId: string,
  write: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await write() };
  } catch (error) {
    out.skipped += 1;
    out.refusals.push({
      table,
      airtableRecordId,
      code: "row_write_failed",
      message:
        "This row could not be saved, so nothing on it has changed on the " +
        "site. The rest of the sync ran normally. Check the values in this " +
        "row - a date, a number or a length is the usual cause - and if it " +
        "still fails after an edit, an officer needs to look at the logs. " +
        `The database said: ${describeWriteError(error)}`,
    });
    return { ok: false };
  }
}

/** The database's own words, trimmed to something an officer can read. */
function describeWriteError(error: unknown): string {
  // Narrowed rather than `String(error)`: a thrown object stringifies to
  // "[object Object]", which would put that in an officer's status cell as
  // though it were the database's explanation.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 199)}…` : oneLine;
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
 * that route forever: the URL would render the directions page, and the
 * meeting would be unreachable at the only address anybody had for it. The
 * slug is derived once on insert and never recomputed, so this is not a
 * problem that fixes itself on the next pass.
 *
 * Reserving it here makes `uniqueSlug` pick `directions-2` instead, which is
 * ugly and works, rather than pretty and gone.
 */
const RESERVED_MEETING_SLUGS = ["directions"] as const;

/**
 * Meetings have no refusal rules of the destructive kind: nothing downstream
 * of a meeting can be invalidated by renaming it or moving it an hour later,
 * because attendance hangs off the row rather than off its schedule.
 *
 * `checkMeeting` is a different class of rule and does not contradict that.
 * It refuses VALUES that cannot be published, a summary too long for the card
 * it is laid out in or an RSVP link pointing off the allowlisted host, rather
 * than edits that would destroy something already earned. See the note at the
 * top of `refusals.ts`.
 *
 * What it does have is a required shape: `startsAt` and `endsAt` are both NOT
 * NULL, and `endsAt > startsAt` is a check constraint. A half-filled row is
 * skipped until it is whole, and SAYS SO in `⚙️ Sync status`, which it did not
 * used to do. Silence there meant a half-filled row and a row the sync had
 * never reached looked identical in the grid: clean status, nothing on the
 * site, no way to tell which.
 *
 * That is a state, not a refusal, and the wording carries the difference. The
 * reason for the old silence still holds, since officers fill Airtable fields
 * one at a time and a pass landing between two keystrokes must not COMPLAIN
 * about a field nobody has reached yet. But saying where the row stands is not
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
  // officer wrote something unpublishable", and only the second is a refusal.
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
      cancelledAt: v.cancelledAt,
      rawCancellationReason: raw[meetingsSpec.fields.cancellationReason.id],
      cancellationReason: v.cancellationReason,
      rawNameOverride: raw[meetingsSpec.fields.nameOverride.id],
      nameOverride: v.nameOverride,
      rawAttendanceForm: raw[meetingsSpec.fields.attendanceForm.id],
      attendanceForm: v.attendanceForm,
    });
    out.refusals.push(...rules.refusals);

    // `nameOverride` is deliberately NOT required, unlike every other field
    // that used to gate a meeting. Most nights have no name: a sprint Monday
    // derives its heading from its workshops and its judging, so demanding one
    // would refuse the ordinary case. The slug no longer depends on it either;
    // see below.
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
      nameOverride?: string | null;
      building?: string | null;
      location: string | null;
      startsAt: Date;
      endsAt: Date;
      attendanceFormUrl?: string | null;
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
      // The reason is PAIRED to that date rather than written through beside
      // it. `meetings_cancellationReason_needs_cancellation` rejects a reason
      // with no cancellation, and both orderings that produce one are ordinary
      // officer work: typing the explanation before setting the date, and
      // un-cancelling by clearing the date and leaving the words behind. Either
      // would throw mid-loop and take down the pull for every table until
      // somebody noticed the cell. So the date decides, and `checkMeeting`
      // tells the officer when their words went unpublished.
      cancellationReason: v.cancelledAt === null ? null : v.cancellationReason,
    };

    // A refused field is DROPPED from the write rather than written as null.
    // The message says the value has not been published; blanking a summary
    // that was already published, because the replacement is too long, would
    // punish the edit twice. The old text stays up until the new one fits.
    if (rules.rejectedFields.has("summary")) delete values.summary;
    if (rules.rejectedFields.has("rsvpUrl")) delete values.rsvpUrl;
    // Both of these guard a check constraint rather than a layout, so the
    // consequence of writing them anyway was not a bad card but a rejected
    // INSERT mid-pull, which ends the pass for every table after this one.
    // The parser refuses the value and this drops it, so the row keeps the
    // name and the form it already had while the officer fixes the cell.
    if (rules.rejectedFields.has("nameOverride")) delete values.nameOverride;
    if (rules.rejectedFields.has("attendanceFormUrl"))
      delete values.attendanceFormUrl;
    // Only reachable while the night IS cancelled; the unpaired case clears
    // the column instead, and says so above. Here the old reason stays up, for
    // the same reason the old summary does.
    if (rules.rejectedFields.has("cancellationReason"))
      delete values.cancellationReason;

    if (current) {
      const written = await tryWrite(
        out,
        "meetings",
        record.airtableRecordId,
        () =>
          db.update(meetings).set(values).where(eq(meetings.id, current.id)),
      );
      // Mapped even when the write failed: the row exists, and the tables
      // downstream still need to resolve links to it. A failed edit is not a
      // missing meeting.
      out.idMap.set(record.airtableRecordId, current.id);
      if (written.ok) out.upserted += 1;
      continue;
    }

    // New in Airtable. The slug is derived once, on insert, and never
    // recomputed: it is in URLs the moment the meeting is published, and
    // regenerating it on every rename would break every link anyone shared.
    //
    // Derived from the meeting's DATE rather than its name, because the name
    // is now nullable and most nights have none. The date is the one thing
    // every meeting has: `startsAt` is `not null` and `complete` above
    // guarantees it here. It makes a better URL besides. `/events/2026-09-21`
    // is legible, sortable, and stable under a rename that a name-derived slug
    // would strand.
    //
    // `clubDateKey`, never `toISOString()`. The UTC date rolls at 20:00
    // Eastern under EDT and 19:00 under EST, so the naive version is right for
    // the club's 18:00 slot and files a 20:00 social under the following day,
    // permanently, since this runs once.
    const slug = uniqueSlug(clubDateKey(new Date(v.startsAt!)), usedSlugs);
    usedSlugs.add(slug);

    const written = await tryWrite(
      out,
      "meetings",
      record.airtableRecordId,
      () =>
        db
          .insert(meetings)
          .values({
            ...values,
            slug,
            airtableRecordId: record.airtableRecordId,
          })
          .returning({ id: meetings.id }),
    );

    const inserted = written.ok ? written.value[0] : undefined;
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
 * a skip rather than a refusal: it usually means the linked meeting was itself
 * incomplete this pass.
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

  // Same reason the meetings pass keeps these: `title` and `description` both
  // parse to null for "the officer wrote nothing" and for "the officer wrote
  // something too long", and only the second is a refusal.
  const rawByRecordId = new Map(records.map((r) => [r.id, r.fields]));

  for (const record of parsed) {
    const meetingId = record.values.meeting
      ? (meetingIds.get(record.values.meeting) ?? null)
      : null;
    const projectId = record.values.project
      ? (projectIds.get(record.values.project) ?? null)
      : null;
    // "The officer emptied the cell", as opposed to "a link is there and did
    // not resolve this pass". Computed once, here, from the same value both
    // the resolution above and the refusal below are derived from, so the two
    // cannot drift into disagreeing about one cell.
    const projectCleared = !record.values.project;

    const current = byRecordId.get(record.airtableRecordId);

    // Before the branch, and before the completeness gate, exactly like the
    // meeting value rules: a title too long to publish is too long whether
    // the row is new or not, and the officer who just typed it is the person
    // best placed to fix it now.
    const raw = rawByRecordId.get(record.airtableRecordId) ?? {};
    const valueRules = checkWorkshopValues({
      airtableRecordId: record.airtableRecordId,
      rawTitle: raw[workshopsSpec.fields.title.id],
      title: record.values.title,
      rawDescription: raw[workshopsSpec.fields.description.id],
      description: record.values.description,
    });
    out.refusals.push(...valueRules.refusals);

    if (current) {
      const rules = checkWorkshop(
        {
          airtableRecordId: record.airtableRecordId,
          attendanceCount: current.attendanceCount,
          currentMeetingId: current.meetingId,
          currentProjectId: current.projectId,
        },
        { meetingId, projectId, projectCleared },
      );
      out.refusals.push(...rules.refusals);

      const values: {
        meetingId?: string;
        projectId?: string | null;
        title?: string | null;
        description?: string | null;
      } = {
        // Written through, unlike the two links: clearing the Airtable cell
        // has to clear the column, or the page keeps printing a title an
        // officer deleted.
        //
        // But only when the null MEANS cleared. Both parsers also return null
        // past their length caps, and writing that erased a published title
        // because somebody added one character to it: no message anywhere, and
        // the schedule silently falling back to the project name. The two
        // deletes below are what tell those apart.
        title: record.values.title,
        description: record.values.description,
      };
      if (valueRules.rejectedFields.has("title")) delete values.title;
      if (valueRules.rejectedFields.has("description"))
        delete values.description;
      if (meetingId !== null && !rules.rejectedFields.has("meetingId")) {
        values.meetingId = meetingId;
      }
      // `projectId` may legitimately go to null: unlinking the project from a
      // session that turned out to teach a skill rather than a codebase is a
      // real edit, and it is the reason the column became nullable.
      //
      // Two things have to be true before that null is written, and only the
      // first used to be checked.
      //
      // The officer must have actually CLEARED the cell. A link that is
      // present and merely failed to resolve this pass, its project row
      // skipped earlier in the same run or Airtable returning the workshop
      // mid-edit, arrives here as the identical null. Writing that would
      // detach a workshop from its project because of an ordering accident.
      //
      // And nobody may have been credited for it yet. `checkWorkshop` reads a
      // null incoming value as "not a change", so the clear sailed past both
      // of its rules and `rejectedFields` came back empty, while `memberStars`
      // groups on `w."projectId"` and every member who attended lost the
      // project off a star they had already earned. That case now
      // has a rule of its own (`workshop_project_cleared`), which is why this
      // condition can stay this simple: `rejectedFields` finally knows.
      if (
        !rules.rejectedFields.has("projectId") &&
        (projectCleared || projectId !== null)
      ) {
        values.projectId = projectId;
      }

      out.idMap.set(record.airtableRecordId, current.id);

      // No empty-write skip here, deliberately: `title` and `description` are
      // always set above, so `values` is never empty and a guard on its size
      // would be a branch that reads as live and never runs. `skipped` counts
      // the insert path below, where a workshop really can have nothing to do.

      const written = await tryWrite(
        out,
        "workshops",
        record.airtableRecordId,
        () =>
          db.update(workshops).set(values).where(eq(workshops.id, current.id)),
      );
      if (written.ok) out.upserted += 1;
      continue;
    }

    // Neither skip below is silent any more, and that is the fix for
    // "workshops aren't syncing alongside events".
    //
    // Both `continue`s here used to write nothing at all. A workshop whose
    // Meeting had not synced, or whose Project link named a Projects row the
    // platform does not own, sat in the base pass after pass with a clean
    // `⚙️ Sync status`, no row in Postgres and nothing on the schedule. The
    // pull was working; it just never said what it was waiting for, so the
    // only evidence was an absence somebody had to notice. The meetings pass
    // learned this same lesson already — see `meeting_incomplete`.
    const unbuilt = describeUnbuiltWorkshop({
      hasMeetingLink: record.values.meeting !== null,
      meetingResolved: meetingId !== null,
      hasProjectLink: !projectCleared,
      projectResolved: projectId !== null,
    });
    if (unbuilt) {
      out.refusals.push({
        table: "workshops",
        airtableRecordId: record.airtableRecordId,
        ...unbuilt,
      });
    }

    // Only the MEETING link is required. `projectId` became nullable with the
    // events rework, so a career-readiness session, which belongs to no
    // codebase and never will, can be created with its project cell empty
    // rather than sitting in Airtable being skipped every pass with no
    // explanation.
    if (meetingId === null) {
      out.skipped += 1;
      continue;
    }

    // The insert path needs the same distinction the update path makes, and
    // did not have it: `projectId` went straight in, so a workshop whose
    // Project link was filled in but whose project row happened to be skipped
    // earlier in this same pass was created project-less. That is the exact
    // conflation the block above refuses to make: an empty cell and an
    // unresolved link are not the same edit. Here it was permanent, because
    // the next pass finds the row already inserted and treats its missing
    // project as the officer's choice.
    //
    // Skipped rather than inserted: the project resolves on the following
    // pass and the row is created whole, fifteen minutes later.
    if (!projectCleared && projectId === null) {
      out.skipped += 1;
      continue;
    }

    const written = await tryWrite(
      out,
      "workshops",
      record.airtableRecordId,
      () =>
        db
          .insert(workshops)
          .values({
            meetingId,
            projectId,
            // Refused values are omitted here too. On insert there is nothing
            // to preserve, but writing a value the check constraint rejects
            // would throw, and the refusal above has already told the officer
            // why the row has no title yet.
            title: valueRules.rejectedFields.has("title")
              ? null
              : record.values.title,
            description: valueRules.rejectedFields.has("description")
              ? null
              : record.values.description,
            airtableRecordId: record.airtableRecordId,
          })
          .returning({ id: workshops.id }),
    );

    const inserted = written.ok ? written.value[0] : undefined;
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

  // Both numbers below are check-constrained, so the raw cell is needed for
  // the same reason the meetings pass needs it: the parser returns null for
  // "empty" and for "not a number I can store", and only the second is worth
  // a message.
  const rawByRecordId = new Map(records.map((r) => [r.id, r.fields]));

  for (const record of parsed) {
    const v = record.values;
    const workshopId = v.workshop
      ? (workshopIds.get(v.workshop) ?? null)
      : null;
    const judgingStartsAt = v.judgingStartsAt
      ? new Date(v.judgingStartsAt)
      : null;
    const current = byRecordId.get(record.airtableRecordId);

    const raw = rawByRecordId.get(record.airtableRecordId) ?? {};
    out.refusals.push(
      ...checkCompetitionValues({
        airtableRecordId: record.airtableRecordId,
        rawMaxTeamSize: raw[competitionsSpec.fields.maxTeamSize.id],
        maxTeamSize: v.maxTeamSize,
        rawRequirementCount: raw[competitionsSpec.fields.requirementCount.id],
        requirementCount: v.requirementCount,
      }).refusals,
    );

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

      const written = await tryWrite(
        out,
        "competitions",
        record.airtableRecordId,
        () =>
          db
            .update(competitions)
            .set(values)
            .where(eq(competitions.id, current.id)),
      );
      if (written.ok) out.upserted += 1;
      continue;
    }

    // Hoisted to a const before the guard, rather than narrowed in place.
    // The insert below runs inside a callback now, and TypeScript discards a
    // narrowing on a mutable property across a function boundary: `v.slug`
    // would be `string | null` again by the time it is read.
    const slug = v.slug;
    if (workshopId === null || slug === null) {
      out.skipped += 1;
      continue;
    }

    // A brand-new competition gets `judgingStartsAt` unvalidated against the
    // workshop meeting on purpose: the rule guards against MOVING it, and on
    // creation the officer may not have linked the workshop and set the time
    // in the same edit. The next pass sees it as a change and applies the rule
    // then, when both halves are present.
    const written = await tryWrite(
      out,
      "competitions",
      record.airtableRecordId,
      () =>
        db
          .insert(competitions)
          .values({
            slug,
            workshopId,
            judgingStartsAt,
            requirementCount: v.requirementCount,
            maxTeamSize: v.maxTeamSize,
            airtableRecordId: record.airtableRecordId,
          })
          .returning({ id: competitions.id }),
    );

    const inserted = written.ok ? written.value[0] : undefined;
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

interface ProjectValues {
  displayName: string | null;
  sortOrder: number | null;
}

/**
 * Projects, pulled — and this pass replaced a `projectIdMap` that only ever
 * read.
 *
 * Projects were the one officer-facing table the platform OWNED. It pushed
 * them out and resolved links by matching `⚙️ Platform ID` back to a row it
 * had authored, which meant a Projects record an officer created in Airtable
 * could never resolve: it had no platform id, nothing would ever issue it one,
 * and the workshop pointing at it was skipped on every pass. Nor was there any
 * other way to get a project, since nothing in the platform could create one
 * either. See the note on `projectsSpec` for the whole shape of that.
 *
 * The slug is derived once on insert and never recomputed, exactly like a
 * meeting's, and for a sharper reason: `stars.csv` is keyed on it across
 * semesters, so regenerating it when an officer fixes a capital letter would
 * rewrite an export somebody already downloaded.
 *
 * ## The archive here is NOT filtered out of the reads, on purpose
 *
 * Every other archivable table is hidden everywhere once `deletedAt` is set,
 * and the seven `leftJoin(projects, ...)` sites deliberately do not follow
 * that. A project is joined as a LABEL for something that already happened: a
 * workshop that taught it, a star somebody earned for sitting in it. Filtering
 * the join would blank the name off both, which is the precise outcome the
 * soft archive exists to prevent — it would make deleting an Airtable row
 * destroy history rather than merely retire a project.
 *
 * So the archive means "stop offering this", and the only read that has to
 * respect it is one that offers a choice. There is no such read today. The
 * existing-rows query below is the other exception, and must stay unfiltered
 * for a different reason: restoring a deleted Airtable record has to re-adopt
 * its old row by `airtableRecordId`, and a filtered read would miss it and try
 * to insert a duplicate slug instead.
 */
export async function pullProjects(
  records: AirtableRecord[],
): Promise<PullOutcome> {
  const out = emptyOutcome();
  const parsed = applyPull<ProjectValues>(projectsSpec, records);

  const existing = await db
    .select({
      id: projects.id,
      airtableRecordId: projects.airtableRecordId,
      slug: projects.slug,
    })
    .from(projects);

  const byRecordId = new Map(
    existing
      .filter((p) => p.airtableRecordId !== null)
      .map((p) => [p.airtableRecordId!, p]),
  );
  const usedSlugs = new Set(existing.map((p) => p.slug));

  const rawByRecordId = new Map(records.map((r) => [r.id, r.fields]));

  for (const record of parsed) {
    const v = record.values;
    const current = byRecordId.get(record.airtableRecordId);

    // Before the completeness gate, like the meeting value rules: a name too
    // long to publish is too long whether the row is new or not.
    const raw = rawByRecordId.get(record.airtableRecordId) ?? {};
    const rules = checkProject({
      airtableRecordId: record.airtableRecordId,
      rawDisplayName: raw[projectsSpec.fields.displayName.id],
      displayName: v.displayName,
    });
    out.refusals.push(...rules.refusals);

    // The name is the only thing a project needs. `sortOrder` has a default in
    // the schema, so a project an officer has not placed yet is still a
    // project.
    if (v.displayName === null) {
      out.skipped += 1;
      if (current) out.idMap.set(record.airtableRecordId, current.id);
      // Said out loud, for the reason `meeting_incomplete` is: a row that is
      // merely unfinished looks exactly like one the sync never reached.
      //
      // Unless the name ARRIVED and was refused just above. The parser returns
      // null for "empty" and for "too long" alike, and only the first is an
      // unfinished row. `checkProject` has already written the better message
      // for the second, and adding this one would stack two explanations of
      // one problem in a single cell.
      if (!rules.rejectedFields.has("displayName")) {
        out.refusals.push({
          table: "projects",
          airtableRecordId: record.airtableRecordId,
          code: "project_incomplete",
          message:
            "Not on the site yet: this project needs a Name. Nothing else " +
            "about the row is wrong — it appears within fifteen minutes of " +
            "one being typed.",
        });
      }
      continue;
    }

    // `displayName` is non-null past the gate above, which is what makes this
    // simpler than the meetings equivalent: the parser returns null both for
    // "empty" and for "too long", and BOTH are handled up there, so there is
    // no refused-field to drop from the write here.
    const values = {
      displayName: v.displayName,
      // Null means the officer emptied the cell. The column is `not null` with
      // a default, so it goes back to 0 rather than being written as null.
      sortOrder: v.sortOrder ?? 0,
      // Un-archives, and it has to be written on every update rather than only
      // when the row is archived. `archiveMissing` sets this the moment a
      // record stops being listed, so restoring one from Airtable's trash
      // brings back a row that is still `deletedAt` and therefore still
      // invisible everywhere. Clearing it here is what makes the archive
      // reversible, which is the property the whole soft delete rests on.
      deletedAt: null,
    };

    if (current) {
      const written = await tryWrite(
        out,
        "projects",
        record.airtableRecordId,
        () =>
          db.update(projects).set(values).where(eq(projects.id, current.id)),
      );
      out.idMap.set(record.airtableRecordId, current.id);
      if (written.ok) out.upserted += 1;
      continue;
    }

    // Derived once, here. See the note above: this string is in `stars.csv`.
    const slug = uniqueSlug(v.displayName, usedSlugs);
    usedSlugs.add(slug);

    const written = await tryWrite(
      out,
      "projects",
      record.airtableRecordId,
      () =>
        db
          .insert(projects)
          .values({
            ...values,
            slug,
            airtableRecordId: record.airtableRecordId,
          })
          .returning({ id: projects.id }),
    );

    const inserted = written.ok ? written.value[0] : undefined;
    if (inserted) {
      out.idMap.set(record.airtableRecordId, inserted.id);
      out.upserted += 1;
    }
  }

  out.archived = await archiveMissing(
    projects,
    parsed.map((p) => p.airtableRecordId),
  );

  return out;
}

// ── Archival ─────────────────────────────────────────────────────────────────

type ArchivableTable =
  typeof projects | typeof meetings | typeof workshops | typeof competitions;

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
