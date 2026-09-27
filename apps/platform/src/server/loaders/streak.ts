import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { calculateStreak, type StreakSummary } from "./streakPolicy";

export async function getStreakForUser(userId: string): Promise<StreakSummary> {
  const [opportunities, earned] = await Promise.all([
    db.execute<{ startsAt: Date; [key: string]: unknown }>(sql`
      select m."startsAt" from platform.meetings m
      where m."countsForCredit" and m."cancelledAt" is null
        and m."deletedAt" is null
      union all
      -- Every mirrored competition is a real, converted issue, so there is
      -- no "counts toward progress" flag to check -- being real IS counting.
      -- Kicked off, not judged or closed: the week the opportunity to enter
      -- appears is the week that requires a star.
      select "kickedOffAt" as "startsAt" from platform.competitions
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
