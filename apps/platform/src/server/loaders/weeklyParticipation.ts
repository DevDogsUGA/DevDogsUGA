import { getSemesters } from "@devdogsuga/events";
import { and, eq, exists, isNull } from "drizzle-orm";
import { cache } from "react";
import { meetingHasWorkshop } from "~/server/attendance/meetingCredit";
import { db } from "~/server/db";
import { attendance, commits, meetings, repoCommits } from "~/server/db/schema";
import { buildSemesterViews, type SemesterView } from "~/lib/weeklyArt";
import { computeWeeklyStreak } from "~/lib/weeklyStreak";

/**
 * A member's weekly participation: the streak and one picture per semester.
 *
 * It reads three things and nothing else: the live meetings (which weeks have
 * any), the workshop meetings the member attended (Q165: a meeting counts when
 * it links a workshop definition), and the commits they authored on a synced
 * repository's default branch (Q42: a commit counts once its `repoCommits`
 * provenance exists, however its repository has since fared, so a repository
 * that went unavailable never unlights a week). It never reads `memberStars`,
 * EL evidence or reflections. The rules themselves are `~/lib/weeklyStreak`.
 *
 * The result discloses only which weeks lit, so a public profile can show it
 * to everyone without naming a meeting or a repository: a week lit by a commit
 * in a repository that is no longer available looks the same as any other.
 */
export interface WeeklyParticipation {
  current: number;
  longest: number;
  /** Semesters that have begun, newest first. */
  semesters: SemesterView[];
}

export const getWeeklyParticipation = cache(
  async (userId: string): Promise<WeeklyParticipation> => {
    const [live, attended, committed] = await Promise.all([
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
        .select({ committedAt: commits.committedAt })
        .from(commits)
        .where(
          and(
            eq(commits.userId, userId),
            exists(
              db
                .select({ sha: repoCommits.sha })
                .from(repoCommits)
                .where(eq(repoCommits.sha, commits.sha)),
            ),
          ),
        ),
    ]);

    const now = new Date();
    const streak = computeWeeklyStreak({
      meetings: live.filter((m) => !m.cancelledAt).map((m) => m.startsAt),
      activity: [
        ...attended.map((row) => row.startsAt),
        ...committed.map((row) => row.committedAt),
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
