import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  attendance,
  competitions,
  instance,
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
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  checkInClosesAt: Date;
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

const summaryColumns = {
  id: meetings.id,
  slug: meetings.slug,
  name: meetings.name,
  location: meetings.location,
  startsAt: meetings.startsAt,
  endsAt: meetings.endsAt,
  checkInClosesAt: meetings.checkInClosesAt,
  attendanceCount: sql<number>`(
    select count(*)::int from ${attendance}
    where ${attendance.meetingId} = ${meetings.id}
  )`,
  workshopCount: sql<number>`(
    select count(*)::int from ${workshops}
    where ${workshops.meetingId} = ${meetings.id}
      and ${workshops.deletedAt} is null
  )`,
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
        teamCount: sql<number>`(
          select count(*)::int from ${teams}
          where ${teams.competitionId} = ${competitions.id}
        )`,
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
        location: row.location,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        checkInClosesAt: row.checkInClosesAt,
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
        teamCount: sql<number>`(
          select count(*)::int from ${teams}
          where ${teams.competitionId} = ${competitions.id}
        )`,
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
   * The roster cap, already resolved against `instance.defaultMaxTeamSize`.
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
          (select ${instance.defaultMaxTeamSize} from ${instance} limit 1),
          4
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
 * Whether check-in is open for a meeting, right now.
 *
 * `checkInClosesAt` is its own column rather than `endsAt`, because officers
 * routinely want check-in to close before the meeting does — otherwise
 * somebody who walks in at the last minute for the free pizza earns the same
 * star as somebody who sat through the workshop.
 */
export function checkInIsOpen(
  meeting: Pick<MeetingSummary, "startsAt" | "checkInClosesAt">,
  now = new Date(),
): boolean {
  return now >= meeting.startsAt && now < meeting.checkInClosesAt;
}
