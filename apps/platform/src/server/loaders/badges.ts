import { getBadges, getWorkshops } from "@devdogsuga/events";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { badgeAwards, profiles } from "~/server/db/schema";
import { groupAwards, type AwardRow, type BadgeEntry } from "../badges/display";

/**
 * Reads of `platform.badgeAwards`. The table is server-only; these are the
 * readers. The public profile reaches `getPublicBadges` only after resolving
 * the member through the `publicProfiles` view (see `getPublicProfileActivity`);
 * the member's own settings and the officers' console pass explicit ids.
 */

async function rowsFor(userId: string): Promise<AwardRow[]> {
  const rows = await db
    .select({
      id: badgeAwards.id,
      badgeId: badgeAwards.badgeId,
      workshopDefinitionId: badgeAwards.workshopDefinitionId,
      method: badgeAwards.method,
      awardedAt: badgeAwards.awardedAt,
      awardedBy: badgeAwards.awardedBy,
      awardedByName: sql<
        string | null
      >`(select p."preferredName" from platform.profile p where p."userId" = ${badgeAwards.awardedBy})`,
      citation: badgeAwards.citation,
      withdrawnAt: badgeAwards.withdrawnAt,
      withdrawnReason: badgeAwards.withdrawnReason,
      hidden: badgeAwards.hidden,
    })
    .from(badgeAwards)
    .where(eq(badgeAwards.userId, userId))
    .orderBy(desc(badgeAwards.awardedAt));
  return rows.map((row) => ({
    ...row,
    method: row.method === "manual" ? "manual" : "automatic",
  }));
}

/** What a public profile shows: live, un-hidden badges. */
export async function getPublicBadges(userId: string): Promise<BadgeEntry[]> {
  return groupAwards(
    await rowsFor(userId),
    getBadges(),
    getWorkshops().workshops,
  );
}

/** The member's own badges, hidden ones included, for Settings. */
export async function getOwnBadges(userId: string): Promise<BadgeEntry[]> {
  return groupAwards(
    await rowsFor(userId),
    getBadges(),
    getWorkshops().workshops,
    { includeHidden: true },
  );
}

/** Everything an officer sees about a member: hidden and withdrawn included. */
export async function getBadgesForOfficer(
  userId: string,
): Promise<BadgeEntry[]> {
  return groupAwards(
    await rowsFor(userId),
    getBadges(),
    getWorkshops().workshops,
    { includeHidden: true, includeWithdrawn: true },
  );
}

/** The member's preferred name, for the console heading. */
export async function getMemberName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: profiles.preferredName })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return row?.name ?? null;
}

export interface BadgeMemberMatch {
  userId: string;
  name: string;
  handle: string | null;
}

/** Members whose name or handle contains the text, for the console. */
export async function searchMembersForBadges(
  query: string,
): Promise<BadgeMemberMatch[]> {
  const text = query.trim();
  if (!text) return [];
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select({
      userId: profiles.userId,
      name: profiles.preferredName,
      handle: profiles.handle,
    })
    .from(profiles)
    .where(
      or(
        ilike(profiles.preferredName, pattern),
        ilike(profiles.handle, pattern),
      ),
    )
    .orderBy(profiles.preferredName)
    .limit(20);
  return rows;
}
