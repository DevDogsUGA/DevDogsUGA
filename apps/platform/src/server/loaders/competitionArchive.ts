import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  competitionEntries,
  competitions,
  teamMembers,
  teams,
} from "~/server/db/schema";
import { getPublicSummariesByUserId } from "./publicProfiles";

/**
 * The public competition archive, `/community/competitions`.
 *
 * WHO CONTRIBUTED. A contributor is a member of a team that entered the
 * competition, counted by the rule `memberStars` and
 * `getPublicProfileActivity` use: an active membership at the moment the
 * entry's pull request opened (`joinedAt <= openedAt`, not yet left), on an
 * entry that opened before the competition closed. Somebody who joins after a
 * team's entry opened does not appear, so this list agrees with the stars.
 *
 * WHO MAY BE NAMED. Identity comes only from `getPublicSummariesByUserId`,
 * which reads the `publicProfiles` view. A contributor the view drops
 * (private, unverified, quarantined, suspended) is never looked up by name:
 * the loader subtracts the public ones from the total and returns only that
 * number. No user id leaves this module for anyone, public or not.
 */

/** A contributor who has a public profile. Nothing here is a join key. */
export interface ArchiveContributor {
  /** Lowercase, without the `@`. Build links with `profilePath`. */
  handle: string;
  /** Null when the member hides their name; show the handle instead. */
  displayName: string | null;
  /** Null when hidden or never uploaded; show initials. */
  avatarUrl: string | null;
}

export interface ArchivedCompetition {
  slug: string;
  title: string;
  /** The brief, flattened to plain text and shortened. Null when there is none. */
  briefExcerpt: string | null;
  kickedOffAt: Date;
  /** Display-only; `closedAt` decides whether it is still open. */
  plannedEndAt: Date | null;
  closedAt: Date | null;
  /** The team whose entry merged, or null when none has. */
  winner: { teamName: string; teamSlug: string } | null;
  /** Contributors with a public profile, by display name then handle. */
  contributors: ArchiveContributor[];
  /** Contributors without one. Counted, never identified. */
  privateContributorCount: number;
}

const EXCERPT_LENGTH = 240;

/**
 * A markdown brief as one short plain-text paragraph: code fences, images,
 * link targets, heading and list markers and emphasis dropped, whitespace
 * collapsed, cut on a word boundary with an ellipsis. Deliberately crude; it
 * is a teaser, and the full brief lives on the competition page.
 */
export function excerptBrief(
  brief: string | null,
  maxLength = EXCERPT_LENGTH,
): string | null {
  if (!brief) return null;
  const text = brief
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/**
 * Every competition, newest kickoff first, with its winner and contributors.
 * Three queries however many competitions there are: the competitions, the
 * winning team of each, and the distinct (competition, member) pairs.
 */
export const getCompetitionArchive = cache(
  async (): Promise<ArchivedCompetition[]> => {
    const [rows, winners, members] = await Promise.all([
      db
        .select({
          id: competitions.id,
          slug: competitions.slug,
          title: competitions.title,
          brief: competitions.brief,
          kickedOffAt: competitions.kickedOffAt,
          plannedEndAt: competitions.plannedEndAt,
          closedAt: competitions.closedAt,
        })
        .from(competitions)
        .orderBy(desc(competitions.kickedOffAt), asc(competitions.slug)),
      // The earliest merged entry per competition, as `getEntrants` would
      // list first: `mergedAt` is the winner record (see the results page).
      db
        .selectDistinctOn([competitionEntries.competitionId], {
          competitionId: competitionEntries.competitionId,
          teamName: teams.name,
          teamSlug: teams.slug,
        })
        .from(competitionEntries)
        .innerJoin(teams, eq(teams.id, competitionEntries.teamId))
        .where(isNotNull(competitionEntries.mergedAt))
        .orderBy(
          competitionEntries.competitionId,
          asc(competitionEntries.mergedAt),
        ),
      db
        .selectDistinct({
          competitionId: competitionEntries.competitionId,
          userId: teamMembers.userId,
        })
        .from(competitionEntries)
        .innerJoin(
          competitions,
          eq(competitions.id, competitionEntries.competitionId),
        )
        .innerJoin(
          teamMembers,
          eq(teamMembers.teamId, competitionEntries.teamId),
        )
        .where(
          and(
            sql`${teamMembers.joinedAt} <= ${competitionEntries.openedAt}`,
            sql`(${teamMembers.leftAt} is null or ${teamMembers.leftAt} > ${competitionEntries.openedAt})`,
            sql`(${competitions.closedAt} is null or ${competitionEntries.openedAt} < ${competitions.closedAt})`,
          ),
        ),
    ]);

    const idsByCompetition = new Map<string, string[]>();
    for (const { competitionId, userId } of members) {
      const list = idsByCompetition.get(competitionId);
      if (list) list.push(userId);
      else idsByCompetition.set(competitionId, [userId]);
    }
    const winnerByCompetition = new Map(
      winners.map((w) => [
        w.competitionId,
        { teamName: w.teamName, teamSlug: w.teamSlug },
      ]),
    );

    const summaries = await getPublicSummariesByUserId([
      ...new Set(members.map((m) => m.userId)),
    ]);

    return rows.map((row) => {
      const ids = idsByCompetition.get(row.id) ?? [];
      const contributors: ArchiveContributor[] = [];
      for (const userId of ids) {
        const summary = summaries.get(userId);
        if (summary) {
          contributors.push({
            handle: summary.handle,
            displayName: summary.displayName,
            avatarUrl: summary.avatarUrl,
          });
        }
      }
      contributors.sort((a, b) =>
        (a.displayName ?? a.handle)
          .toLowerCase()
          .localeCompare((b.displayName ?? b.handle).toLowerCase()),
      );
      return {
        slug: row.slug,
        title: row.title,
        briefExcerpt: excerptBrief(row.brief),
        kickedOffAt: row.kickedOffAt,
        plannedEndAt: row.plannedEndAt,
        closedAt: row.closedAt,
        winner: winnerByCompetition.get(row.id) ?? null,
        contributors,
        privateContributorCount: ids.length - contributors.length,
      };
    });
  },
);
