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
 * archive — attendance survives an officer deleting the wrong row — which
 * means an archived meeting is still fully present in the database and only
 * these filters keep it off the site.
 */

export interface MeetingSummary {
  id: string;
  slug: string;
  name: string;
  /**
   * Which building, from the closed list the campus map can draw — or `Other`
   * for somewhere it cannot, or null when nobody has picked one.
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
   * cannot describe — `Social`, `Career`, `Info session`, `Open lab`.
   *
   * Null is the ordinary case and means "read the derived segments", NOT
   * "unknown". Typed as free text rather than a union because it is an
   * Airtable single-select an officer can extend without anybody touching this
   * repository, and a value this side has never heard of has to render as
   * itself rather than fall through a `switch` into a crash or a blank badge.
   */
  kind: string | null;
  /** An authored sentence or two for the calendar popover. Null means the page
   *  falls back to the workshop list, which is usually the better blurb — so
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
 * correlated count as a raw template —
 *
 * ```
 * sql`(select count(*)::int from ${attendance}
 *      where ${attendance.meetingId} = ${meetings.id})`
 * ```
 *
 * — renders BOTH column references unqualified: `where "meetingId" = "id"`.
 * Inside the subquery those resolve against the inner table, so it asks
 * `attendance.meetingId = attendance.id`, which is never true. The query is
 * valid SQL, Postgres runs it without complaint, and every count comes back
 * zero. Interpolating a query BUILDER instead makes Drizzle qualify both sides
 * — `"platform"."attendance"."meetingId" = "platform"."meetings"."id"` — which
 * is the whole difference.
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
  name: meetings.name,
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
      .where(and(isNull(meetings.deletedAt), gte(meetings.endsAt, new Date())))
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
 * The competition is a left join because a workshop need not have one — a
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
        name: row.name,
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
  projectSlug: string;
  projectName: string;
  competitionSlug: string | null;
  teamCount: number;
}

/**
 * The workshops that ran at one meeting.
 *
 * The competition is a LEFT join, not an inner one: a supplementary workshop
 * has no competition and is complete on its own — worth exactly one star — so
 * an inner join would silently drop it from the meeting it ran at.
 *
 * Ordered by the project sort order officers control, so the list on the page
 * matches the order the sessions are announced in rather than the alphabet.
 */
export const getMeetingWorkshops = cache(
  async (meetingId: string): Promise<MeetingWorkshop[]> => {
    return db
      .select({
        workshopId: workshops.id,
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
      .innerJoin(projects, eq(projects.id, workshops.projectId))
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
      .orderBy(asc(projects.sortOrder), asc(projects.displayName));
  },
);

export interface MeetingRangeWorkshop {
  workshopId: string;
  projectSlug: string;
  projectName: string;
  /**
   * The competition this workshop opened, or null.
   *
   * Null is a *supplementary* workshop — complete on its own and worth exactly
   * one star — rather than a competition that failed to load. That is why the
   * join below is a LEFT one: an inner join would silently delete every
   * supplementary session from the calendar, and the absence would look like a
   * quiet week rather than a bug.
   */
  competitionSlug: string | null;
}

export interface MeetingRangeJudging {
  competitionId: string;
  competitionSlug: string;
  /** A competition has no name of its own — it is called after its project. */
  projectName: string;
  projectSlug: string;
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
   * Competitions whose judging happens at this meeting — opened at an EARLIER
   * meeting, which is the whole point of the model. Empty is entirely normal:
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
 * both comparisons, so an unscheduled competition joins to no meeting at all —
 * the required behaviour ("not yet", never "never") falling out of
 * three-valued logic rather than being bolted on.
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
      judgingStartsAt: competitions.judgingStartsAt,
    })
    .from(competitions)
    .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
    .innerJoin(projects, eq(projects.id, workshops.projectId))
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
 * picking its id back out of the result — which worked, and read like a bug.
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
 * Bounded on `startsAt`, unlike `getUpcomingMeetings` — a calendar grid asks
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
 *   cartesian product — a night with three workshops judging two competitions
 *   returns six rows, and every scalar in `summaryColumns` is duplicated
 *   across them. It has to be de-duplicated in JavaScript anyway, so the
 *   "single query" saves a round trip and buys back a grouping pass plus the
 *   chance of getting the de-duplication subtly wrong.
 * - **Two correlated `json_agg` subqueries.** Correct, but Drizzle cannot type
 *   the aggregate, so both collections arrive as `unknown` and get cast by
 *   hand — which is exactly where the `noUncheckedIndexedAccess` guarantees
 *   this codebase relies on stop applying. The soft-delete filters would also
 *   move inside a JSON aggregate, where a missing `deletedAt is null` is
 *   invisible to anyone reading the file rather than sitting in the same
 *   recognisable position it occupies in every other query here.
 *
 * Three statements keyed on the window's meeting ids is a *constant* three
 * round trips no matter how wide the window is, which is what "no N+1"
 * actually asks for — the failure mode being avoided is a query per meeting,
 * not a query per collection. Each child query also keeps the same join and
 * filter shape as the single-meeting loader beside it (`getMeetingWorkshops`),
 * so the two cannot drift on which rows count as live.
 *
 * A note on `cache`: React memoises on argument identity, and two `Date`
 * objects for the same instant are different arguments. Callers that want the
 * dedupe must pass the same objects, and the page does — it computes the
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
          projectSlug: projects.slug,
          projectName: projects.displayName,
          competitionSlug: competitions.slug,
        })
        .from(workshops)
        .innerJoin(projects, eq(projects.id, workshops.projectId))
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
  /** A competition has no name of its own — it is called after its project. */
  name: string;
  /** The opening workshop's meeting. NOT when judging happens. */
  openedOn: Date;
  /**
   * When judging begins. The authority for every roster lock — and separate
   * from `openedOn` because presentations are their own occasion, held at a
   * later meeting. Null means "not scheduled yet", never "never".
   */
  judgingStartsAt: Date | null;
  /**
   * The roster cap, already resolved against `DEFAULT_MAX_TEAM_SIZE`.
   *
   * Resolved here rather than returned nullable, because a nullable cap makes
   * every caller reimplement the fallback — and a page that renders "3 of —"
   * while the action rejects a fourth member is the drift this loader exists
   * to prevent. `requireCanJoin` resolves it the same way.
   */
  maxTeamSize: number;
}

/**
 * One competition, by slug.
 *
 * Exists so a page can tell "no such competition" from "not scored yet".
 * `getStandings` takes a slug and returns team rows, so an empty array merges
 * those two states into one — and they need opposite answers: a 404 and an
 * explanation.
 */
export const getCompetitionBySlug = cache(
  async (slug: string): Promise<CompetitionHeader | null> => {
    const [row] = await db
      .select({
        id: competitions.id,
        slug: competitions.slug,
        name: projects.displayName,
        openedOn: meetings.startsAt,
        judgingStartsAt: competitions.judgingStartsAt,
        maxTeamSize: sql<number>`coalesce(
          ${competitions.maxTeamSize},
          ${DEFAULT_MAX_TEAM_SIZE}
        )`,
      })
      .from(competitions)
      .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
      .innerJoin(projects, eq(projects.id, workshops.projectId))
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
 * Whether there is a form to point somebody at, right now.
 *
 * Deliberately NOT "whether attendance is open". The platform stopped being
 * able to answer that when the check-in codes went: the Airtable form's own
 * open and close is the only gate, and this process has no way to read it.
 * Claiming otherwise would put a confident "Attendance open" badge on a page
 * next to a form that is closed.
 *
 * So this answers the narrower question it can actually answer — is there a
 * link, and is the meeting happening — and the copy around it is worded as a
 * pointer rather than a promise.
 */
export function attendanceFormIsLive(
  meeting: Pick<MeetingSummary, "startsAt" | "endsAt" | "attendanceFormUrl">,
  now = new Date(),
): boolean {
  return (
    meeting.attendanceFormUrl !== null &&
    now >= meeting.startsAt &&
    now < meeting.endsAt
  );
}

/**
 * Every meeting slug that resolves to a page, newest first — for `sitemap.ts`.
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
 * Competition slugs whose results page is worth crawling — for `sitemap.ts`.
 *
 * `/competitions/[slug]/results` is the only competition route not behind
 * `expectSession()`, so it is the only one a sitemap may name; the two under
 * `teams/` redirect an anonymous crawler to `/auth`.
 *
 * The joins are not decoration. `getCompetitionBySlug` — which the results
 * page calls before anything else, and 404s on — reaches the competition's
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
