import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { calculateStreak, type StreakSummary } from "./streakPolicy";

export async function getStreakForUser(userId: string): Promise<StreakSummary> {
  const [opportunities, earned] = await Promise.all([
    db.execute<{ startsAt: Date; [key: string]: unknown }>(sql`
      select m."startsAt" from platform.meetings m
      where m."countsTowardProgress" and m."cancelledAt" is null
        and m."deletedAt" is null
      union all
      select opening_meeting."startsAt"
      from platform.competitions c
      join platform.workshops w on w.id = c."workshopId"
      join platform.meetings opening_meeting on opening_meeting.id = w."meetingId"
      where c."countsTowardProgress" and c."deletedAt" is null
        and w."deletedAt" is null and opening_meeting."deletedAt" is null
    `),
    db.execute<{ startsAt: Date; [key: string]: unknown }>(sql`
      select "startsAt" from platform."memberStars"
      where "userId" = ${userId}::uuid
    `),
  ]);
  return calculateStreak(
    opportunities.map((row) => row.startsAt),
    earned.map((row) => row.startsAt),
  );
}
