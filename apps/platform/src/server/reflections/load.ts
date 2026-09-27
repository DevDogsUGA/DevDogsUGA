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

    -- Competition participation, the same rule platform."memberStars" uses
    -- (see that view's migration comment): held an active membership on the
    -- entering team at the moment the entry opened. "endsAt" is the
    -- competition's "closedAt" -- a reflection only makes sense once the
    -- competition is actually over, which is also why this filters on it
    -- being set rather than falling back to the display-only "plannedEndAt".
    -- "select distinct" collapses a member who qualified through more than
    -- one entry (a team that reopened one) down to the one activity row
    -- "memberStars" already treats as a single fact.
    select distinct 'competition'::text as "activityType", c.id as "activityId",
      c.title as label,
      c."closedAt" as "endsAt", r.id as "reflectionId", r.content,
      r."submittedAt"
    from platform."competitionEntries" ce
    join platform.competitions c on c.id = ce."competitionId"
    join platform."teamMembers" tm
      on tm."teamId" = ce."teamId"
      and tm."joinedAt" <= ce."openedAt"
      and (tm."leftAt" is null or tm."leftAt" > ce."openedAt")
    left join platform.reflections r
      on r."userId" = tm."userId" and r."competitionId" = c.id
    where tm."userId" = ${userId}::uuid
      and c."closedAt" is not null
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
