import { sql } from "drizzle-orm";
import { meetingHasWorkshop } from "~/server/attendance/meetingCredit";
import { db } from "~/server/db";
import { calculateStreak, type StreakSummary } from "./streakPolicy";

// Raw SQL values do not inherit a column's Date decoder -- postgres.js hands
// `db.execute` back text for every column, so "startsAt" arrives as a string
// and is converted below (the same as in ~/server/reflections/load.ts).
type StartRow = { startsAt: string; [key: string]: unknown };

export async function getStreakForUser(userId: string): Promise<StreakSummary> {
  const [opportunities, earned] = await Promise.all([
    db.execute<StartRow>(sql`
      select m."startsAt" from platform.meetings m
      where ${meetingHasWorkshop(sql`m.id`)} and m."cancelledAt" is null
        and m."deletedAt" is null
    `),
    db.execute<StartRow>(sql`
      select "startsAt" from platform."memberStars"
      where "userId" = ${userId}::uuid and "activityType" = 'meeting'
    `),
  ]);
  return calculateStreak(
    opportunities.map((row) => new Date(row.startsAt)),
    earned.map((row) => new Date(row.startsAt)),
  );
}
