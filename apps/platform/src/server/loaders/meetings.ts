import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { DEFAULT_MAX_TEAM_SIZE } from "~/server/teams/limits";
import {
  attendance,
  competitions,
  meetings,
  projects,
  teams,
  workshops,
} from "~/server/db/schema";

/**
 * Reads for the meeting list, a workshop's detail page, and the calendar.
 *
 * Every query here filters `deletedAt is null`. Deletion in Airtable is a soft
 * archive, so attendance survives an officer deleting the wrong row. An
 * archived meeting is still fully present in the database, and only these
 * filters keep it off the site.
 */

export interface MeetingSummary {
  id: string;
  slug: string;
  /**
   * A name for this night, when it has one worth reading: "Cold Start",
   * "Midterm Study Session".
   *
   * Null is the ORDINARY case: a sprint Monday derives its heading from its
   * workshops and its judging, and the schedule renders no heading at all for
   * one. Surfaces that need a string regardless (the `<title>`, the JSON-LD,
   * the dialog's accessible name, the stars table) go through `meetingTitle`
   * rather than reading this directly.
   */
  nameOverride: string | null;
  /**
   * When this meeting was called off, or null.
   *
   * Distinct from `deletedAt`, which is not in this type at all because every
   * loader filters it out: that one means "authored in error", this one means
   * "real, and not happening". A cancelled meeting is still returned by the
   * reads that answer *what is on the schedule* and filtered out of the ones
   * that answer *where should I go now*.
   */
  cancelledAt: Date | null;
  /** Why, in a few words. Null even when cancelled: the fact and the
   *  explanation arrive in separate keystrokes. */
  cancellationReason: string | null;
  /**
   * Which building, from the closed list the campus map can draw. `Other`
   * covers somewhere it cannot, and null means nobody has picked one.
   *
   * Typed as free text rather than a union for the same reason `kind` is: it
   * is an Airtable single-select, and while the parser and a check constraint
   * both hold it to the list, a union here would make widening that list a
   * type error in every consumer rather than a value one of them renders as
   * itself. `isMappedBuilding` narrows it where the narrowing matters.
   */
  building: string | null;
  /** The room or space inside {@link building}. Free text; never parsed. */
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  attendanceFormUrl: string | null;
  /**
   * An officer's override for what the night is, for the nights structure
   * cannot describe. One of the four `MEETING_KIND_CHOICES`: `Build Session`,
   * `Study Session`, `Interest Meeting`, `Social`.
   *
   * Null is the ordinary case and means "read the derived segments", NOT
   * "unknown".
   *
   * Typed as free text rather than as `MeetingKind` because that is what the
   * column is: the list is enforced by `parseMeetingKind` on the way in and by
   * `meetings_kind_choices` in the database, neither of which a row already
   * stored can be re-checked against here. Widening it costs nothing, since
   * the values are Title Case display strings and every render path prints the
   * string rather than switching on it.
   */
  kind: string | null;
  /** An authored sentence or two for the calendar popover. Null means the page
   *  falls back to the workshop list, which is usually the better blurb, so
   *  this is worth printing only when an officer bothered to write it. */
  summary: string | null;
  rsvpUrl: string | null;
  attendanceCount: number;
  workshopCount: number;
}

export interface WorkshopDetail {
  workshopId: string;
  meeting: MeetingSummary;
  projectId: string;
  projectSlug: string;
  projectName: string;
  competition: {
    id: string;
    slug: string;
    judgingStartsAt: Date | null;
    maxTeamSize: number | null;
    requirementCount: number | null;
    teamCount: number;
  } | null;
}

/**
 * Wraps a Drizzle subquery so it can sit in a `select` as a scalar.
 *
 * This exists because the obvious spelling is silently wrong. Writing the
 * correlated count as a raw template:
 *
 * ```
 * sql`(select count(*)::int from ${attendance}
 *      where ${attendance.meetingId} = ${meetings.id})`
 * ```
 *
 * renders BOTH column references unqualified: `where "meetingId" = "id"`.
 * Inside the subquery those resolve against the inner table, so it asks
 * `attendance.meetingId = attendance.id`, which is never true. The query is
 * valid SQL, Postgres runs it without complaint, and every count comes back
 * zero. Interpolating a query BUILDER instead makes Drizzle qualify both
 * sides: `"platform"."attendance"."meetingId" = "platform"."meetings"."id"`.
 *
 * Measured on 2026-08-22 against the local stack: the raw form returned 0
 * workshops for a meeting with two, and this form returned 2.
 */
function correlatedCount(subquery: { getSQL(): SQL }): SQL<number> {
  return sql<number>`(${subquery})`;
}

const summaryColumns = {
  id: meetings.id,
  slug: meetings.slug,
  nameOverride: meetings.nameOverride,
  cancelledAt: meetings.cancelledAt,
  cancellationReason: meetings.cancellationReason,
  building: meetings.building,
  location: meetings.location,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  attendanceFormUrl: meetings.attendanceFormUrl,
  kind: meetings.kind,
  summary: meetings.summary,
  rsvpUrl: meetings.rsvpUrl,
  attendanceCount: correlatedCount(
    db
      .select({ n: sql`count(*)::int` })
      .from(attendance)
      .where(eq(attendance.meetingId, meetings.id)),
  ),
  workshopCount: correlatedCount(
    db
      .select({ n: sql`count(*)::int` })
      .from(workshops)
      .where(
        and(eq(workshops.meetingId, meetings.id), isNull(workshops.deletedAt)),
      ),
  ),
};

/**
 * Meetings that have not happened yet, soonest first.
 *
 * Bounded on `endsAt` rather than `startsAt`: a meeting in progress is
 * upcoming as far as anybody deciding whether to walk over is concerned, and
 * that is the whole audience for this list.
 */
export const getUpcomingMeetings = cache(
  async (limit = 10): Promise<MeetingSummary[]> => {
    return db
      .select(summaryColumns)
      .from(meetings)
      .where(
        and(
          isNull(meetings.deletedAt),
          // Cancelled meetings are filtered HERE and deliberately not in
          // `getMeetingsInRange`. This read answers "where should I go next",
          // feeding the next-meeting strip and the homepage stack, and a
          // cancelled meeting is not an answer to it; naming one as the next
          // meeting is worse than the vanishing this column was added to stop.
          // The range read answers "what is on the schedule", where a cancelled
          // night is exactly what somebody holding it in their calendar needs
          // to see, struck through and with its reason.
          isNull(meetings.cancelledAt),
          gte(meetings.endsAt, new Date()),
        ),
      )
      .orderBy(asc(meetings.startsAt))
      .limit(limit);
  },
);

/** Meetings that are over, most recent first. */
export const getPastMeetings = cache(
  async (limit = 25, offset = 0): Promise<MeetingSummary[]> => {
    return db
      .select(summaryColumns)
      .from(meetings)
      .where(and(isNull(meetings.deletedAt), lt(meetings.endsAt, new Date())))
      .orderBy(desc(meetings.startsAt))
      .limit(limit)
      .offset(offset);
  },
);

export const getMeetingBySlug = cache(
  async (slug: string): Promise<MeetingSummary | null> => {
    const [row] = await db
      .select(summaryColumns)
      .from(meetings)
      .where(and(isNull(meetings.deletedAt), eq(meetings.slug, slug)));
    return row ?? null;
  },
);

/**
 * A workshop and everything a member needs to decide whether to join a team.
 *
 * The competition is a left join because a workshop need not have one: a
 * supplementary session is a workshop with nothing to compete in, and a null
 * here is that case rather than a missing row.
 */
export const getWorkshopDetail = cache(
  async (
    meetingSlug: string,
    projectSlug: string,
  ): Promise<WorkshopDetail | null> => {
    const [row] = await db
      .select({
        workshopId: workshops.id,
        projectId: projects.id,
        projectSlug: projects.slug,
        projectName: projects.displayName,
        competitionId: competitions.id,
        competitionSlug: competitions.slug,
        judgingStartsAt: competitions.judgingStartsAt,
        maxTeamSize: competitions.maxTeamSize,
        requirementCount: competitions.requirementCount,
        teamCount: correlatedCount(
          db
            .select({ n: sql`count(*)::int` })
            .from(teams)
            .where(eq(teams.competitionId, competitions.id)),
        ),
        ...summaryColumns,
      })
      .from(workshops)
      .innerJoin(meetings, eq(meetings.id, workshops.meetingId))
      .innerJoin(projects, eq(projects.id, workshops.projectId))
      .leftJoin(
        competitions,
        and(
          eq(competitions.workshopId, workshops.id),
          isNull(competitions.deletedAt),
        ),
      )
      .where(
        and(
          isNull(workshops.deletedAt),
          isNull(meetings.deletedAt),
          eq(meetings.slug, meetingSlug),
          eq(projects.slug, projectSlug),
        ),
      );

    if (!row) return null;

    return {
      workshopId: row.workshopId,
      projectId: row.projectId,
      projectSlug: row.projectSlug,
      projectName: row.projectName,
      meeting: {
        id: row.id,
        slug: row.slug,
        nameOverride: row.nameOverride,
        cancelledAt: row.cancelledAt,
        cancellationReason: row.cancellationReason,
        building: row.building,
        location: row.location,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        attendanceFormUrl: row.attendanceFormUrl,
        kind: row.kind,
        summary: row.summary,
        rsvpUrl: row.rsvpUrl,
        attendanceCount: row.attendanceCount,
        workshopCount: row.workshopCount,
      },
      competition:
        row.competitionId === null
          ? null
          : {
              id: row.competitionId,
              slug: row.competitionSlug!,
              judgingStartsAt: row.judgingStartsAt,
              maxTeamSize: row.maxTeamSize,
              requirementCount: row.requirementCount,
              teamCount: row.teamCount,
            },
    };
  },
);

export interface MeetingWorkshop {
  workshopId: string;
  /**
   * What the officers call this session: "Supabase", "Career Fair Readiness".
   * Null falls back to {@link projectName}, so every workshop authored before
   * the column existed renders exactly as it did.
   */
  title: string | null;
  /** One or two sentences on what it teaches. Null renders nothing. */
  description: string | null;
  /** Both null for a workshop that teaches a skill rather than a codebase. */
  projectSlug: string | null;
  projectName: string | null;
  competitionSlug: string | null;
  teamCount: number;
}

/**
 * The workshops that ran at one meeting.
 *
 * BOTH joins are left joins, for the same reason twice over.
 *
 * The competition, because a supplementary workshop has none and is complete
 * on its own, worth exactly one star, so an inner join would silently drop it
 * from the meeting it ran at.
 *
 * The project, because `workshops.projectId` is nullable as of the events
 * rework: a career-readiness session teaches a skill and belongs to no
 * codebase, and inventing a project for it would put that session on the
 * Projects page as a body of work the club does not have. An inner join would
 * make the nullable column unreachable: the row would exist, no surface would
 * ever show it, and it would fail silently on exactly the night the feature
 * was added for.
 *
 * Ordered by the project sort order officers control, so the list on the page
 * matches the order the sessions are announced in rather than the alphabet.
 * `nullsLast` puts the project-less sessions after the ones that carry an
 * ordering officers chose, rather than wherever Postgres would default them.
 */
export const getMeetingWorkshops = cache(
  async (meetingId: string): Promise<MeetingWorkshop[]> => {
    return db
      .select({
        workshopId: workshops.id,
        title: workshops.title,
        description: workshops.description,
        projectSlug: projects.slug,
        projectName: projects.displayName,
        competitionSlug: competitions.slug,
        teamCount: correlatedCount(
          db
            .select({ n: sql`count(*)::int` })
            .from(teams)
            .where(eq(teams.competitionId, competitions.id)),
        ),
      })
      .from(workshops)
      .leftJoin(projects, eq(projects.id, workshops.projectId))
      .leftJoin(
        competitions,
        and(
          eq(competitions.workshopId, workshops.id),
          isNull(competitions.deletedAt),
        ),
      )
      .where(
        and(eq(workshops.meetingId, meetingId), isNull(workshops.deletedAt)),
      )
      .orderBy(
        sql`${projects.sortOrder} asc nulls last`,
        sql`${projects.displayName} asc nulls last`,
        asc(workshops.title),
      );
  },
);

export interface MeetingRangeWorkshop {
  workshopId: string;
  /** The officers' own word for the session. Null falls back to the project. */
  title: string | null;
  /**
   * Both null for a workshop teaching a skill rather than a codebase.
   * `workshops.projectId` is nullable, and the join below is a left one so
   * such a session reaches the calendar instead of vanishing from it.
   */
  projectSlug: string | null;
  projectName: string | null;
  /**
   * The competition this workshop opened, or null.
   *
   * Null is a *supplementary* workshop, complete on its own and worth exactly
   * one star, rather than a competition that failed to load. That is why the
   * join below is a LEFT one: an inner join would silently delete every
   * supplementary session from the calendar, and the absence would look like a
   * quiet week rather than a bug.
   */
  competitionSlug: string | null;
}

export interface MeetingRangeJudging {
  competitionId: string;
  competitionSlug: string;
  /**
   * A competition has no name of its own. It is called after the workshop that
   * opened it, and after that workshop's project.
   *
   * Null when it has neither: `workshops.projectId` is nullable, and
   * `judgingForMeetings` left-joins deliberately so that a project-less
   * competition still reaches the calendar instead of being dropped off a
   * night that has a deadline behind it.
   *
   * Read through `workshopLabel`, never directly; see `title` below.
   */
  projectName: string | null;
  projectSlug: string | null;
  /**
   * The officer's word for the workshop this competition came out of.
   *
   * ⚠️ Selected here because this row did not have it, and the omission
   * printed one workshop under two different names on two nights of the same
   * schedule: a workshop titled "Supabase" on project "Platform" was the chip
   * **Supabase** on its kickoff night and **Judging: Platform** on its judging
   * night. Worse, a titled workshop with no project, the case the whole
   * nullable-`projectId` rework exists for, rendered as the bare word
   * "Judging" with a perfectly good title sitting unread in the row.
   *
   * This is the same drift `workshopLabel` was introduced to remove. It was
   * applied to the chip, the row and the star grid, and never here.
   */
  title: string | null;
  /**
   * The authored judging time. It falls inside this meeting's span, but it is
   * generally NOT the meeting's `startsAt`: two competitions judged the same
   * night begin at 18:00 and 18:40, and the schedule list prints both times.
   */
  judgingStartsAt: Date;
}

export interface MeetingInRange extends MeetingSummary {
  /** Ordered by the project sort order officers control, so the popover lists
   *  sessions in the order they are announced rather than alphabetically. */
  workshops: MeetingRangeWorkshop[];
  /**
   * Competitions whose judging happens at this meeting, opened at an EARLIER
   * meeting, which is the whole point of the model. Empty is normal:
   * the first meeting of a semester has nothing to judge yet, and a night that
   * only teaches never will.
   */
  judgedCompetitions: MeetingRangeJudging[];
}

/**
 * The competitions judged at each of `ids`, bucketed by meeting.
 *
 * Extracted rather than inlined because two callers need it and there must
 * only ever be ONE spelling of "which night is this judged on". The predicate
 * is subtle enough that a second copy would drift: judging attaches by WHEN it
 * starts, not by `judgingMeetingId`. See `isJudgedDuring` below for why; this
 * join is the SQL spelling of that same predicate, and the two have to keep
 * agreeing, so neither should be changed without the other.
 *
 * The null case needs no clause of its own: `judgingStartsAt is null` fails
 * both comparisons, so an unscheduled competition joins to no meeting at all.
 * The required behaviour ("not yet", never "never") falls out of three-valued
 * logic.
 *
 * Not exported, and not `cache()`d: both callers are, and wrapping an
 * array-argument function would memoise on a reference that changes every
 * call anyway.
 */
async function judgingForMeetings(
  ids: string[],
): Promise<Map<string, MeetingRangeJudging[]>> {
  const rows = await db
    .select({
      meetingId: meetings.id,
      competitionId: competitions.id,
      competitionSlug: competitions.slug,
      projectSlug: projects.slug,
      projectName: projects.displayName,
      // The officer's title for the opening workshop, so both nights of a
      // competition print the same word. Already joined below for the
      // `deletedAt` filter, so this costs no extra work.
      title: workshops.title,
      judgingStartsAt: competitions.judgingStartsAt,
    })
    .from(competitions)
    .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
    // Left, because `workshops.projectId` is nullable. A competition normally
    // hangs off repo work and so has a project, but nothing in the schema
    // enforces that, and an inner join would answer "this meeting judges
    // nothing" for a competition it does judge, and the calendar then quietly
    // drops a judging chip off a night that has a deadline behind it.
    .leftJoin(projects, eq(projects.id, workshops.projectId))
    .innerJoin(
      meetings,
      and(
        inArray(meetings.id, ids),
        gte(competitions.judgingStartsAt, meetings.startsAt),
        lt(competitions.judgingStartsAt, meetings.endsAt),
      ),
    )
    .where(
      and(
        isNull(competitions.deletedAt),
        // The workshop that OPENED the competition, at some earlier meeting.
        // Archiving that workshop retracts the competition from the calendar,
        // matching `getCompetitionBySlug`, which would 404 on the same row.
        isNull(workshops.deletedAt),
        isNull(meetings.deletedAt),
      ),
    )
    // 18:00 before 18:40, so the schedule reads down the evening.
    .orderBy(asc(competitions.judgingStartsAt));

  const byMeeting = new Map<string, MeetingRangeJudging[]>();
  for (const row of rows) {
    const entry: MeetingRangeJudging = {
      competitionId: row.competitionId,
      competitionSlug: row.competitionSlug,
      projectSlug: row.projectSlug,
      projectName: row.projectName,
      title: row.title,
      // Non-null by construction: the join only matches rows whose
      // `judgingStartsAt` compared successfully against two timestamps, and
      // null compares to neither. Drizzle types it from the column, which
      // cannot know that.
      judgingStartsAt: row.judgingStartsAt!,
    };
    const bucket = byMeeting.get(row.meetingId);
    if (bucket) bucket.push(entry);
    else byMeeting.set(row.meetingId, [entry]);
  }
  return byMeeting;
}

/**
 * The competitions judged at one meeting.
 *
 * Exists so a meeting's own page does not have to go through
 * `getMeetingsInRange` to answer a question about a single row. It briefly
 * did, by asking for a one-millisecond window around the meeting's start and
 * picking its id back out of the result, which worked and read like a bug.
 */
export const getMeetingJudging = cache(
  async (meetingId: string): Promise<MeetingRangeJudging[]> =>
    (await judgingForMeetings([meetingId])).get(meetingId) ?? [],
);

/**
 * Every non-archived meeting starting in `[from, to)`, ascending, with the
 * workshops it runs and the competitions it judges.
 *
 * Half-open on purpose. The calendar pages by month and asks for a three-month
 * window at a time, so the ranges it requests are adjacent; a closed upper
 * bound would put a meeting starting exactly at midnight on the first of a
 * month into two windows at once, and the page would draw it twice.
 *
 * Bounded on `startsAt`, unlike `getUpcomingMeetings`: a calendar grid asks
 * "which square does this go in", and that is the start. The in-progress
 * meeting that `getUpcomingMeetings` deliberately keeps alive by bounding on
 * `endsAt` is not a case here: it still belongs to the day it started on.
 *
 * ## Three queries, joined in memory, rather than one aggregate
 *
 * A meeting has two independent one-to-many collections hanging off it, and
 * that is what decides the shape. Doing it in a single statement means one of:
 *
 * - **Joining both.** `meetings × workshops × judgedCompetitions` is a
 *   cartesian product. A night with three workshops judging two competitions
 *   returns six rows, and every scalar in `summaryColumns` is duplicated
 *   across them. It has to be de-duplicated in JavaScript anyway, so the
 *   "single query" saves a round trip and buys back a grouping pass plus the
 *   chance of getting the de-duplication subtly wrong.
 * - **Two correlated `json_agg` subqueries.** Correct, but Drizzle cannot type
 *   the aggregate, so both collections arrive as `unknown` and get cast by
 *   hand, which is exactly where the `noUncheckedIndexedAccess` guarantees
 *   this codebase relies on stop applying. The soft-delete filters would also
 *   move inside a JSON aggregate, where a missing `deletedAt is null` is
 *   invisible to anyone reading the file rather than sitting in the same
 *   recognisable position it occupies in every other query here.
 *
 * Three statements keyed on the window's meeting ids is a *constant* three
 * round trips no matter how wide the window is, which is what "no N+1" asks
 * for: the failure mode being avoided is a query per meeting, not a query per
 * collection. Each child query also keeps the same join and
 * filter shape as the single-meeting loader beside it (`getMeetingWorkshops`),
 * so the two cannot drift on which rows count as live.
 *
 * A note on `cache`: React memoises on argument identity, and two `Date`
 * objects for the same instant are different arguments. Callers that want the
 * dedupe must pass the same objects, and the page does: it computes the
 * window once and threads it through.
 */
export const getMeetingsInRange = cache(
  async (from: Date, to: Date): Promise<MeetingInRange[]> => {
    const rows = await db
      .select(summaryColumns)
      .from(meetings)
      .where(
        and(
          isNull(meetings.deletedAt),
          gte(meetings.startsAt, from),
          lt(meetings.startsAt, to),
        ),
      )
      .orderBy(asc(meetings.startsAt));

    // Not merely an optimisation. `inArray` with an empty list is a degenerate
    // predicate, and skipping the two child statements keeps an empty month
    // from touching the database three times to learn nothing.
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const [workshopRows, judgingByMeeting] = await Promise.all([
      db
        .select({
          meetingId: workshops.meetingId,
          workshopId: workshops.id,
          title: workshops.title,
          projectSlug: projects.slug,
          projectName: projects.displayName,
          competitionSlug: competitions.slug,
        })
        .from(workshops)
        // Left: this feeds the calendar and the schedule chips, so an inner
        // join would make a project-less workshop invisible on exactly the
        // surfaces the nullable column was added to serve.
        .leftJoin(projects, eq(projects.id, workshops.projectId))
        .leftJoin(
          competitions,
          and(
            eq(competitions.workshopId, workshops.id),
            isNull(competitions.deletedAt),
          ),
        )
        .where(
          and(inArray(workshops.meetingId, ids), isNull(workshops.deletedAt)),
        )
        .orderBy(asc(projects.sortOrder), asc(projects.displayName)),

      judgingForMeetings(ids),
    ]);

    const workshopsByMeeting = new Map<string, MeetingRangeWorkshop[]>();
    for (const row of workshopRows) {
      const bucket = workshopsByMeeting.get(row.meetingId);
      const entry: MeetingRangeWorkshop = {
        workshopId: row.workshopId,
        title: row.title,
        projectSlug: row.projectSlug,
        projectName: row.projectName,
        competitionSlug: row.competitionSlug,
      };
      if (bucket) bucket.push(entry);
      else workshopsByMeeting.set(row.meetingId, [entry]);
    }

    return rows.map((row) => ({
      ...row,
      workshops: workshopsByMeeting.get(row.id) ?? [],
      judgedCompetitions: judgingByMeeting.get(row.id) ?? [],
    }));
  },
);

export {
  isJudgedDuring,
  resolveMeetingSegments,
  type MeetingBilling,
  type MeetingSegment,
  type MeetingStructure,
} from "~/lib/meetingSegments";

export interface CompetitionHeader {
  id: string;
  slug: string;
  /** A competition has no name of its own; it is called after its project. */
  name: string;
  /** The opening workshop's meeting. NOT when judging happens. */
  openedOn: Date;
  /**
   * When judging begins. The authority for every roster lock, and separate
   * from `openedOn` because presentations are their own occasion, held at a
   * later meeting. Null means "not scheduled yet", never "never".
   */
  judgingStartsAt: Date | null;
  /**
   * The roster cap, already resolved against `DEFAULT_MAX_TEAM_SIZE`.
   *
   * Resolved here rather than returned nullable, because a nullable cap makes
   * every caller reimplement the fallback. A page that renders "3 of" and a
   * blank while the action rejects a fourth member is the drift this loader
   * exists to prevent. `requireCanJoin` resolves it the same way.
   */
  maxTeamSize: number;
}

/**
 * One competition, by slug.
 *
 * Exists so a page can tell "no such competition" from "not scored yet".
 * `getStandings` takes a slug and returns team rows, so an empty array merges
 * those two states into one, and they need opposite answers: a 404 and an
 * explanation.
 */
export const getCompetitionBySlug = cache(
  async (slug: string): Promise<CompetitionHeader | null> => {
    const [row] = await db
      .select({
        id: competitions.id,
        slug: competitions.slug,
        // A competition is called after its project, but `projectId` is
        // nullable now, so the fallbacks matter. The workshop's own title is
        // the next best name, and the competition's slug is the last resort:
        // it is `not null`, unique, and already user-visible in git as the
        // integration branch, so it is a real name rather than invented text.
        name: sql<string>`coalesce(
          ${projects.displayName},
          ${workshops.title},
          ${competitions.slug}
        )`,
        openedOn: meetings.startsAt,
        judgingStartsAt: competitions.judgingStartsAt,
        maxTeamSize: sql<number>`coalesce(
          ${competitions.maxTeamSize},
          ${DEFAULT_MAX_TEAM_SIZE}
        )`,
      })
      .from(competitions)
      .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
      .leftJoin(projects, eq(projects.id, workshops.projectId))
      .innerJoin(meetings, eq(meetings.id, workshops.meetingId))
      .where(
        and(
          eq(competitions.slug, slug),
          isNull(competitions.deletedAt),
          isNull(workshops.deletedAt),
          isNull(meetings.deletedAt),
        ),
      );

    return row ?? null;
  },
);

/**
 * Re-exported from `~/lib/meetingSegments`, which owns it.
 *
 * This was a byte-identical second copy, same body and same docstring, in a
 * branch whose own story is deduplicating `clubDay` for exactly this reason.
 * Two copies of a predicate is two places to fix a bug and one of them gets
 * missed, which is what happened: neither consulted `cancelledAt`, and a fix
 * applied to one would have left the other handing out check-in buttons for a
 * cancelled night.
 *
 * Kept as a re-export rather than deleted so the existing import sites, which
 * reach for it beside the loaders they already use, keep working.
 */
export { attendanceFormIsLive } from "~/lib/meetingSegments";

/**
 * Every meeting slug that resolves to a page, newest first, for `sitemap.ts`.
 *
 * Deliberately not `getUpcomingMeetings` + `getPastMeetings`. Those two select
 * `summaryColumns`, which carries a correlated COUNT over `attendance` and
 * another over `workshops` for every row, and the sitemap wants neither; they
 * are also both bounded by a `limit` the sitemap would have to guess at, and a
 * guess that came in low would silently drop URLs off the end of the list
 * rather than fail. One column and the same `deletedAt is null` filter the
 * meeting page itself applies is the whole of what a `<loc>` needs.
 */
export const getMeetingSlugs = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ slug: meetings.slug })
    .from(meetings)
    .where(isNull(meetings.deletedAt))
    .orderBy(desc(meetings.startsAt));

  return rows.map((row) => row.slug);
});

/**
 * Competition slugs whose results page is worth crawling, for `sitemap.ts`.
 *
 * `/competitions/[slug]/results` is the only competition route not behind
 * `expectSession()`, so it is the only one a sitemap may name; the two under
 * `teams/` redirect an anonymous crawler to `/auth`.
 *
 * The joins are not decoration. `getCompetitionBySlug`, which the results
 * page calls before anything else and 404s on, reaches the competition's
 * name through `workshops → projects` and its `openedOn` through
 * `workshops → meetings`, and requires all three rows to be live. A slug list
 * that skipped them would put URLs in the sitemap that answer 404, so this
 * mirrors that query's filters exactly and selects one column.
 *
 * `judgingStartsAt <= now` is the second filter, and it is about what the page
 * has to say rather than about whether it exists: standings are written by the
 * tally, and the RLS policy on `competitionStandings` only reveals them once
 * an election is tallied. Before judging the route renders "not scored yet",
 * which is a real answer for somebody who followed a link and thin content for
 * a crawler. Null (never scheduled) is excluded by the comparison, which is
 * the intended reading.
 */
export const getJudgedCompetitionSlugs = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ slug: competitions.slug })
    .from(competitions)
    .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
    .innerJoin(meetings, eq(meetings.id, workshops.meetingId))
    .where(
      and(
        isNull(competitions.deletedAt),
        isNull(workshops.deletedAt),
        isNull(meetings.deletedAt),
        lte(competitions.judgingStartsAt, new Date()),
      ),
    )
    .orderBy(desc(competitions.judgingStartsAt));

  return rows.map((row) => row.slug);
});
