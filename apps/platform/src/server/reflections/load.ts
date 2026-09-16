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
  endsAt: Date;
  reflectionId: string | null;
  content: string | null;
  submittedAt: Date | null;
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
    where a."userId" = ${userId}::uuid and a."revokedAt" is null
      and m."elEligible" and m."deletedAt" is null and m."cancelledAt" is null

    union all

    select distinct 'competition'::text as "activityType", c.id as "activityId",
      coalesce(w.title, c.slug, 'Competition') as label,
      c."judgingStartsAt" as "endsAt", r.id as "reflectionId", r.content,
      r."submittedAt"
    from platform."teamMembers" tm
    join platform.teams t on t.id = tm."teamId"
    join platform.competitions c on c.id = t."competitionId"
    join platform.workshops w on w.id = c."workshopId"
    left join platform.reflections r
      on r."userId" = tm."userId" and r."competitionId" = c.id
    where tm."userId" = ${userId}::uuid
      and coalesce(t."participationOverride", t."competedAt" is not null)
      and c."elEligible" and c."deletedAt" is null and w."deletedAt" is null
    order by "endsAt" desc, "activityType", "activityId"
  `);

  return {
    minimumWordCount: policy.minimumWordCount,
    activities: rows.map((row) => {
      const deadline = reflectionDeadline(
        row.endsAt,
        policy.submissionWindowDays,
      );
      const content = row.content ?? "";
      return {
        ...row,
        content,
        deadline,
        wordCount: reflectionWordCount(content),
        canEdit: row.submittedAt === null && now <= deadline,
      };
    }),
  };
}
