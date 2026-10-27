import { and, desc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { contributions } from "~/server/db/schema";
import { countMergesByWeek, type WeeklyMerges } from "./contributionWeeks";

export { countMergesByWeek, type WeeklyMerges };

/**
 * Reads of `platform.contributions`: the merged pull requests of one member.
 *
 * The table is server-only and these are the readers. The public profile
 * reaches `getContributionsForUser` only after resolving the member through
 * the `publicProfiles` view and checking `showContributions` (see
 * `getPublicProfileActivity`); the member's own pages pass their session id.
 */

export interface ContributionItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  mergedAt: Date;
}

/** Newest first, capped so a prolific member cannot make a page unbounded. */
const LIST_LIMIT = 100;

/**
 * A member's merged pull requests, newest first. `publicOnly` leaves out
 * private repositories, which a public profile must never name; the member's
 * own view passes false.
 */
export async function getContributionsForUser(
  userId: string,
  options: { publicOnly: boolean },
): Promise<ContributionItem[]> {
  const rows = await db
    .select({
      repo: contributions.repo,
      number: contributions.prNumber,
      title: contributions.title,
      url: contributions.url,
      mergedAt: contributions.mergedAt,
    })
    .from(contributions)
    .where(
      options.publicOnly
        ? and(
            eq(contributions.userId, userId),
            eq(contributions.repoPrivate, false),
          )
        : eq(contributions.userId, userId),
    )
    .orderBy(desc(contributions.mergedAt), desc(contributions.id))
    .limit(LIST_LIMIT);
  return rows;
}

/**
 * Merged pull requests per club week, private repositories included (any
 * merged PR counts toward a streak). The streak and badge stages build on
 * this; nothing renders it yet.
 */
export async function getMergedPrsPerWeek(
  userId: string,
): Promise<WeeklyMerges[]> {
  const rows = await db
    .select({ mergedAt: contributions.mergedAt })
    .from(contributions)
    .where(eq(contributions.userId, userId));
  return countMergesByWeek(rows.map((row) => row.mergedAt));
}
