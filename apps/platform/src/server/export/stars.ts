import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { memberStars, profiles } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { csvTimestamp } from "./csv";

/**
 * The export follows the new one-row-per-star ledger. Attendance is a meeting
 * fact and participation is a competition fact; neither is attributed to a
 * workshop merely to fit the former shape.
 */
export const STARS_COLUMNS = [
  "user_id",
  "preferred_name",
  "email",
  "github_login",
  "activity_type",
  "activity_id",
  "activity_starts_at",
  "earned_at",
  "meeting_id",
  "competition_id",
  "meeting_star",
  "competition_star",
  "won",
] as const;

export interface StarsFilters {
  from?: Date;
  to?: Date;
  /** Limits competition rows to those opened by this project. */
  projectSlug?: string;
}

export interface StarRow {
  userId: string;
  preferredName: string | null;
  email: string | null;
  githubLogin: string | null;
  activityType: "meeting" | "competition";
  activityId: string;
  activityStartsAt: Date;
  earnedAt: Date;
  meetingId: string | null;
  competitionId: string | null;
  meetingStar: boolean;
  competitionStar: boolean;
  won: boolean;
}

export function projectStarRow(row: StarRow): unknown[] {
  return [
    row.userId,
    row.preferredName,
    row.email,
    row.githubLogin,
    row.activityType,
    row.activityId,
    csvTimestamp(row.activityStartsAt),
    csvTimestamp(row.earnedAt),
    row.meetingId,
    row.competitionId,
    row.meetingStar,
    row.competitionStar,
    row.won,
  ];
}

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
  if (filters.from) conditions.push(gte(memberStars.startsAt, filters.from));
  if (filters.to) conditions.push(lte(memberStars.startsAt, filters.to));
  if (filters.projectSlug) {
    conditions.push(sql`exists (
      select 1
      from platform.competitions c
      join platform.workshops w on w.id = c."workshopId"
      join platform.projects p on p.id = w."projectId"
      where c.id = ${memberStars.competitionId}
        and p.slug = ${filters.projectSlug}
    )`);
  }

  const rows = await db
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
      activityType: sql<"meeting" | "competition">`${memberStars.activityType}`,
      activityId: memberStars.activityId,
      activityStartsAt: memberStars.startsAt,
      earnedAt: memberStars.earnedAt,
      meetingId: memberStars.meetingId,
      competitionId: memberStars.competitionId,
      meetingStar: sql<boolean>`${memberStars.activityType} = 'meeting'`,
      competitionStar: sql<boolean>`${memberStars.activityType} = 'competition'`,
      won: memberStars.won,
    })
    .from(memberStars)
    .leftJoin(profiles, eq(profiles.userId, memberStars.userId))
    .leftJoin(usersInAuth, eq(usersInAuth.id, memberStars.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(
      asc(memberStars.startsAt),
      asc(memberStars.userId),
      asc(memberStars.activityType),
      asc(memberStars.activityId),
    )
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    userId: row.userId!,
    preferredName: row.preferredName,
    email: row.email,
    githubLogin: row.githubLogin,
    activityType: row.activityType,
    activityId: row.activityId!,
    activityStartsAt: row.activityStartsAt!,
    earnedAt: row.earnedAt!,
    meetingId: row.meetingId,
    competitionId: row.competitionId,
    meetingStar: row.meetingStar,
    competitionStar: row.competitionStar,
    won: row.won!,
  }));
}

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
