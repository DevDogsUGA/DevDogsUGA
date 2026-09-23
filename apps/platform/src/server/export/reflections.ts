import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { profiles, reflections } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import {
  parseReflectionsFilters,
  projectReflectionRow,
  REFLECTIONS_COLUMNS,
  type ReflectionRow,
  type ReflectionsFilters,
} from "./reflectionsCsv";

export {
  parseReflectionsFilters,
  projectReflectionRow,
  REFLECTIONS_COLUMNS,
  type ReflectionRow,
  type ReflectionsFilters,
};

export async function* streamReflectionRows(
  filters: ReflectionsFilters = {},
  pageSize = 500,
): AsyncGenerator<ReflectionRow> {
  let offset = 0;
  for (;;) {
    const page = await reflectionPage(filters, pageSize, offset);
    for (const row of page) yield row;
    if (page.length < pageSize) return;
    offset += pageSize;
  }
}

async function reflectionPage(
  filters: ReflectionsFilters,
  limit: number,
  offset: number,
): Promise<ReflectionRow[]> {
  const conditions = [];
  if (filters.from) conditions.push(gte(reflections.createdAt, filters.from));
  if (filters.to) conditions.push(lte(reflections.createdAt, filters.to));

  const rows = await db
    .select({
      userId: reflections.userId,
      preferredName: profiles.preferredName,
      email: usersInAuth.email,
      githubLogin: sql<string | null>`(
        select i.identity_data ->> 'user_name'
        from auth.identities i
        where i.user_id = ${reflections.userId} and i.provider = 'github'
        limit 1
      )`,
      activityType: sql<"meeting" | "competition">`
        case when ${reflections.meetingId} is not null then 'meeting' else 'competition' end
      `,
      activityId: sql<string>`coalesce(${reflections.meetingId}, ${reflections.competitionId})`,
      // Same coalesce chain as the stars grid's label for a meeting: a
      // night's own name, then its kind, then a placeholder. A competition's
      // title is never null (see the migration's comment on the column), so
      // unlike the meeting branch there is no fallback chain to build for it
      // any more.
      activityTitle: sql<string>`case
        when ${reflections.meetingId} is not null then coalesce(
          (select m."nameOverride" from platform.meetings m where m.id = ${reflections.meetingId}),
          (select m.kind from platform.meetings m where m.id = ${reflections.meetingId}),
          'Meeting'
        )
        else (select c.title from platform.competitions c where c.id = ${reflections.competitionId})
      end`,
      content: reflections.content,
      submittedAt: reflections.submittedAt,
      createdAt: reflections.createdAt,
      updatedAt: reflections.updatedAt,
      revisionCount: sql<number>`(
        select count(*)::int from platform."reflectionRevisions" rr
        where rr."reflectionId" = ${reflections.id}
      )`,
    })
    .from(reflections)
    .leftJoin(profiles, eq(profiles.userId, reflections.userId))
    .leftJoin(usersInAuth, eq(usersInAuth.id, reflections.userId))
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(reflections.createdAt), asc(reflections.userId))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    userId: row.userId,
    preferredName: row.preferredName,
    email: row.email,
    githubLogin: row.githubLogin,
    activityType: row.activityType,
    activityId: row.activityId,
    activityTitle: row.activityTitle,
    content: row.content,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revisionCount: row.revisionCount,
  }));
}
