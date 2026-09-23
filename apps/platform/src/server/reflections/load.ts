import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { reflectionDeadline, reflectionWordCount } from "./policy";

export interface ReflectionActivity {
  activityType: "meeting" | "competition";
  activityId: string;
  label: string;
  endsAt: Date;
  deadline: Date;
  reflectionId: string | null;
  content: string;
  submittedAt: Date | null;
  wordCount: number;
  canEdit: boolean;
}

interface ActivityRow {
  [key: string]: unknown;
  activityType: "meeting" | "competition";
  activityId: string;
  label: string;
  // Raw SQL values do not inherit a column's Date decoder (see the comment
  // on `ongoing` in getMeetings.ts) -- postgres.js hands `db.execute` back
  // text for every column, so these two arrive as strings and are converted
  // explicitly below.
  endsAt: string;
  reflectionId: string | null;
  content: string | null;
  submittedAt: string | null;
}

export async function getReflectionActivities(
  userId: string,
  now = new Date(),
): Promise<{ minimumWordCount: number; activities: ReflectionActivity[] }> {
  const settings = await db.execute<{
    minimumWordCount: number;
    submissionWindowDays: number;
  }>(sql`
    select "minimumWordCount", "submissionWindowDays"
    from platform."reflectionSettings" where id = true
  `);
  const policy = settings[0] ?? {
    minimumWordCount: 100,
    submissionWindowDays: 7,
  };

  const rows = await db.execute<ActivityRow>(sql`
    select 'meeting'::text as "activityType", m.id as "activityId",
      coalesce(m."nameOverride", m.kind, 'Meeting') as label,
      m."endsAt", r.id as "reflectionId", r.content, r."submittedAt"
    from platform.attendance a
    join platform.meetings m on m.id = a."meetingId"
    left join platform.reflections r
      on r."userId" = a."userId" and r."meetingId" = m.id
    where a."userId" = ${userId}::uuid
      and m."countsForCredit" and m."deletedAt" is null and m."cancelledAt" is null

    union all

    -- STUB, matching platform."memberStars"'s own stub (see the teams-core
    -- migration's comment there): the platform redesign's teams-core step
    -- dropped "teams"."competitionId" and "teams"."competedAt", so "which
    -- competitions has this member competed in" is no longer answerable from
    -- team membership. Kept shape-compatible (same columns, real tables
    -- joined) so this UNION ALL still compiles, but "and false" guarantees
    -- it returns nothing until the competitions step rewires this to the
    -- competition-entry mirror.
    select distinct 'competition'::text as "activityType", c.id as "activityId",
      coalesce(w.title, c.slug, 'Competition') as label,
      c."judgingStartsAt" as "endsAt", r.id as "reflectionId", r.content,
      r."submittedAt"
    from platform."teamMembers" tm
    join platform.competitions c on true
    join platform.workshops w on w.id = c."workshopId"
    left join platform.reflections r
      on r."userId" = tm."userId" and r."competitionId" = c.id
    where tm."userId" = ${userId}::uuid
      and c."elEligible" and c."deletedAt" is null and w."deletedAt" is null
      and false
    order by "endsAt" desc, "activityType", "activityId"
  `);

  return {
    minimumWordCount: policy.minimumWordCount,
    activities: rows.map((row) => {
      const endsAt = new Date(row.endsAt);
      const deadline = reflectionDeadline(endsAt, policy.submissionWindowDays);
      const content = row.content ?? "";
      const submittedAt =
        row.submittedAt === null ? null : new Date(row.submittedAt);
      return {
        ...row,
        endsAt,
        content,
        submittedAt,
        deadline,
        wordCount: reflectionWordCount(content),
        canEdit: submittedAt === null && now <= deadline,
      };
    }),
  };
}
