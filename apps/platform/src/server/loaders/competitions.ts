import { desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { competitions } from "~/server/db/schema";

/**
 * Reads for the competition pages.
 *
 * A competition is a mirror of a converted GitHub issue -- see
 * `server/github/competitions.ts` for the ingestion that keeps this table
 * current. Nothing here writes; every row already exists by the time a page
 * asks for it. There is no `deletedAt` here the way there is on meetings and
 * workshops: a mirrored competition never gets soft-archived, it just stops
 * being refreshed (see the ingestion module's header on `deleted`/`archived`
 * Project items).
 */

export interface CompetitionHeader {
  id: string;
  slug: string;
  /** From the Project's "Title" field, falling back to the issue's own
   *  title. Never null -- see the migration's comment on the column. */
  title: string;
  /** The issue body, markdown. Render with `DocsMarkdown`, never as plain
   *  text: officers write this expecting headings, links and code blocks. */
  brief: string | null;
  /** The Project's planned judging/end date. DISPLAY-ONLY -- not read to
   *  decide whether the competition is still open. `closedAt` is that. */
  plannedEndAt: Date | null;
  kickedOffAt: Date;
  /** Null means still open. */
  closedAt: Date | null;
  url: string;
}

/**
 * One competition, by slug.
 *
 * Exists so a page can tell "no such competition" from every other state --
 * a competition with no entries yet, one still open, one already closed --
 * which is what `null` versus a row lets the page's own logic decide, the
 * same split `getMeetingBySlug` draws.
 */
export const getCompetitionBySlug = cache(
  async (slug: string): Promise<CompetitionHeader | null> => {
    const [row] = await db
      .select({
        id: competitions.id,
        slug: competitions.slug,
        title: competitions.title,
        brief: competitions.brief,
        plannedEndAt: competitions.plannedEndAt,
        kickedOffAt: competitions.kickedOffAt,
        closedAt: competitions.closedAt,
        url: competitions.url,
      })
      .from(competitions)
      .where(eq(competitions.slug, slug));

    return row ?? null;
  },
);

/**
 * Every competition slug that resolves to a page, newest kickoff first, for
 * `sitemap.ts`.
 *
 * Unlike the old `getJudgedCompetitionSlugs` this replaces, there is no
 * "worth crawling" filter: every mirrored competition is a real, converted
 * issue the moment it exists, so there is no draft state to exclude here the
 * way there was a not-yet-judged one before.
 */
export const getCompetitionSlugs = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ slug: competitions.slug })
    .from(competitions)
    .orderBy(desc(competitions.kickedOffAt));

  return rows.map((row) => row.slug);
});
