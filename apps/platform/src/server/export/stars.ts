import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  competitions,
  meetings,
  memberStars,
  profiles,
  projects,
  teamAwards,
  teamMembers,
  teams,
  workshops,
} from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { csvTimestamp } from "./csv";

/**
 * `stars.csv` — one row per `(member, workshop)`, every meeting, one file.
 *
 * The one export that survived pushing attendance into Airtable, and it
 * survived for two reasons the others did not:
 *
 *   * **Stars are derived, not stored.** Getting them into Airtable would mean
 *     pushing a computed row per `(member, workshop)` — the whole
 *     participation matrix, recomputed and re-pushed whenever an officer fixes
 *     one attendance row, against a per-workspace allowance shared with dues
 *     and project management. One streamed endpoint is dramatically cheaper.
 *
 *   * **Their value is cross-meeting**, which is the shape Airtable is worst
 *     at. The point is a member's record across a semester, not one meeting's
 *     roster.
 *
 * It also sidesteps an ambiguity a pushed table would have to resolve:
 * competing earns the workshop star, so a member who skipped the workshop and
 * submitted anyway has a workshop star with no attendance row to hang it on.
 * The Airtable attendance mirror has no row for them; this gives them both
 * stars. Neither is lying — they answer different questions.
 */

/**
 * The column order IS the contract.
 *
 * **Append-only.** New fields go at the end; existing columns are never
 * reordered or renamed. That is what lets a downstream import keep working
 * when the schema grows — and the failure mode of getting it wrong is not an
 * error but a spreadsheet where every value is in the wrong column.
 */
export const STARS_COLUMNS = [
  "user_id",
  "preferred_name",
  "email",
  "github_login",
  "meeting_id",
  "meeting_slug",
  "meeting_name",
  "meeting_starts_at",
  "workshop_id",
  "project_id",
  "project_slug",
  "project_name",
  "competition_id",
  "workshop_star",
  "competition_star",
  "submitted",
  "won",
  "award_category",
] as const;

export interface StarsFilters {
  /** Inclusive, on the meeting's start. */
  from?: Date;
  to?: Date;
  projectSlug?: string;
}

export interface StarRow {
  userId: string;
  preferredName: string | null;
  email: string | null;
  githubLogin: string | null;
  meetingId: string;
  meetingSlug: string;
  meetingName: string;
  meetingStartsAt: Date;
  workshopId: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  competitionId: string | null;
  workshopStar: boolean;
  competitionStar: boolean;
  submitted: boolean;
  won: boolean;
  awardCategory: string | null;
}

/** One CSV line, in `STARS_COLUMNS` order. */
export function projectStarRow(row: StarRow): unknown[] {
  return [
    row.userId,
    row.preferredName,
    row.email,
    row.githubLogin,
    row.meetingId,
    row.meetingSlug,
    row.meetingName,
    csvTimestamp(row.meetingStartsAt),
    row.workshopId,
    row.projectId,
    row.projectSlug,
    row.projectName,
    row.competitionId,
    row.workshopStar,
    row.competitionStar,
    row.submitted,
    row.won,
    row.awardCategory,
  ];
}

/**
 * The rows, in pages.
 *
 * Paged rather than one query for the same reason the response streams: this
 * grows with the club across every semester, and a single `select` would hold
 * the whole result set in the Worker before the first byte reached the client.
 *
 * Ordered by `(meetingStartsAt, userId, workshopId)` — deterministic and
 * total, which matters because keyset pagination over a non-total order
 * silently skips or repeats rows at page boundaries.
 */
export async function* streamStarRows(
  filters: StarsFilters = {},
  pageSize = 500,
): AsyncGenerator<StarRow> {
  let offset = 0;

  for (;;) {
    const page = await starPage(filters, pageSize, offset);
    for (const row of page) yield row;
    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

async function starPage(
  filters: StarsFilters,
  limit: number,
  offset: number,
): Promise<StarRow[]> {
  const conditions = [];
  if (filters.from) conditions.push(gte(meetings.startsAt, filters.from));
  if (filters.to) conditions.push(lte(meetings.startsAt, filters.to));
  if (filters.projectSlug) {
    conditions.push(eq(projects.slug, filters.projectSlug));
  }

  return db
    .select({
      userId: memberStars.userId,
      preferredName: profiles.preferredName,
      email: usersInAuth.email,
      githubLogin: sql<string | null>`(
        select i.identity_data ->> 'user_name'
        from auth.identities i
        where i.user_id = ${memberStars.userId} and i.provider = 'github'
        limit 1
      )`,
      meetingId: meetings.id,
      meetingSlug: meetings.slug,
      // The CSV's columns are an append-only contract, so this one has to keep
      // emitting a value even though `nameOverride` is null for most nights.
      // Coalescing to the workshop's title and then its project keeps the
      // cell meaningful; the empty string is the floor, because a reader
      // already has `meetingSlug` and `meetingStartsAt` in the neighbouring
      // columns and a literal like "Untitled" would be text the club never
      // wrote appearing in an export it publishes.
      meetingName: sql<string>`coalesce(
        ${meetings.nameOverride},
        ${workshops.title},
        ${projects.displayName},
        ''
      )`,
      meetingStartsAt: meetings.startsAt,
      workshopId: memberStars.workshopId,
      projectId: projects.id,
      projectSlug: projects.slug,
      projectName: projects.displayName,
      competitionId: competitions.id,
      workshopStar: memberStars.workshopStar,
      competitionStar: memberStars.competitionStar,
      // `submitted` is not `competitionStar`: a team can have a live PR and
      // still not have competed, because competing is frozen at judging.
      submitted: sql<boolean>`exists (
        select 1
        from ${teams} t
        join ${teamMembers} tm
          on tm."teamId" = t."id" and tm."userId" = ${memberStars.userId}
        where t."competitionId" = ${competitions.id}
          and t."submissionState" is not null
      )`,
      won: memberStars.won,
      awardCategory: teamAwards.category,
    })
    .from(memberStars)
    .innerJoin(meetings, eq(meetings.id, memberStars.meetingId))
    .innerJoin(workshops, eq(workshops.id, memberStars.workshopId))
    // Left, like every other read of a workshop's project: `projectId` is
    // nullable, and a star earned at a skill session is still a star the
    // export has to carry.
    .leftJoin(projects, eq(projects.id, memberStars.projectId))
    .leftJoin(profiles, eq(profiles.userId, memberStars.userId))
    .leftJoin(usersInAuth, eq(usersInAuth.id, memberStars.userId))
    .leftJoin(competitions, eq(competitions.workshopId, memberStars.workshopId))
    .leftJoin(
      teamAwards,
      and(
        eq(teamAwards.competitionId, competitions.id),
        sql`exists (
          select 1 from ${teamMembers} tm
          where tm."teamId" = ${teamAwards.teamId}
            and tm."userId" = ${memberStars.userId}
        )`,
      ),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      asc(meetings.startsAt),
      asc(memberStars.userId),
      asc(memberStars.workshopId),
    )
    .limit(limit)
    .offset(offset) as Promise<StarRow[]>;
}

/** Parses the query string into filters, ignoring anything unparseable. */
export function parseStarsFilters(url: URL): StarsFilters {
  const filters: StarsFilters = {};

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const project = url.searchParams.get("project");

  if (from && !Number.isNaN(Date.parse(from))) filters.from = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) filters.to = new Date(to);
  if (project) filters.projectSlug = project;

  return filters;
}
