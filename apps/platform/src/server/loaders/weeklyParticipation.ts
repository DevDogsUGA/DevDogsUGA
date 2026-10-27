import { getSemesters } from "@devdogsuga/events";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { meetingHasWorkshop } from "~/server/attendance/meetingCredit";
import { db } from "~/server/db";
import { attendance, contributions, meetings } from "~/server/db/schema";
import { buildSemesterViews, type SemesterView } from "~/lib/weeklyArt";
import { computeWeeklyStreak } from "~/lib/weeklyStreak";

/**
 * A member's weekly participation: the streak and one picture per semester.
 *
 * It reads three things and nothing else: the live meetings (which weeks have
 * any), the workshop meetings the member attended (Q165: a meeting counts when
 * it links a workshop definition), and the pull requests merged for them (any
 * repository, private included: Q97). It never reads `memberStars`, EL
 * evidence or reflections. The rules themselves are `~/lib/weeklyStreak`.
 *
 * The result discloses only which weeks lit, so a public profile can show it
 * to everyone without naming a meeting or a repository.
 */
export interface WeeklyParticipation {
  current: number;
  longest: number;
  /** Semesters that have begun, newest first. */
  semesters: SemesterView[];
}

export const getWeeklyParticipation = cache(
  async (userId: string): Promise<WeeklyParticipation> => {
    const [live, attended, merged] = await Promise.all([
      db
        .select({
          startsAt: meetings.startsAt,
          cancelledAt: meetings.cancelledAt,
        })
        .from(meetings)
        .where(isNull(meetings.deletedAt)),
      db
        .select({ startsAt: meetings.startsAt })
        .from(attendance)
        .innerJoin(meetings, eq(meetings.id, attendance.meetingId))
        .where(
          and(
            eq(attendance.userId, userId),
            isNull(meetings.cancelledAt),
            isNull(meetings.deletedAt),
            meetingHasWorkshop(meetings.id),
          ),
        ),
      db
        .select({ mergedAt: contributions.mergedAt })
        .from(contributions)
        .where(eq(contributions.userId, userId)),
    ]);

    const now = new Date();
    const streak = computeWeeklyStreak({
      meetings: live.filter((m) => !m.cancelledAt).map((m) => m.startsAt),
      activity: [
        ...attended.map((row) => row.startsAt),
        ...merged.map((row) => row.mergedAt),
      ],
      now,
    });
    return {
      current: streak.current,
      longest: streak.longest,
      semesters: buildSemesterViews({
        semesters: getSemesters().semesters,
        meetings: live,
        streak,
        now,
      }),
    };
  },
);

/** The one switch for weeks with no meetings: frost or left out. */
export function emptyWeekTreatment() {
  return getSemesters().emptyWeeks;
}
