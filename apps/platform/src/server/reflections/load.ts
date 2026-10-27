import { getWorkshops } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import { meetingHasWorkshop } from "~/server/attendance/meetingCredit";
import { db } from "~/server/db";
import {
  reflectionDeadline,
  reflectionWindowStart,
  reflectionWordCount,
} from "./policy";

export interface ReflectionActivity {
  activityType: "meeting";
  activityId: string;
  label: string;
  endsAt: Date;
  deadline: Date;
  reflectionId: string | null;
  content: string;
  submittedAt: Date | null;
  wordCount: number;
  canEdit: boolean;
  /** The workshops this meeting ran, to pick from (Q95). Never empty. */
  workshops: ReflectionWorkshop[];
  /** The workshop the member chose, or null before they have. */
  workshopDefinitionId: string | null;
}

export interface ReflectionWorkshop {
  id: string;
  title: string;
}

interface ActivityRow {
  [key: string]: unknown;
  activityType: "meeting";
  activityId: string;
  label: string;
  // Raw SQL values do not inherit a column's Date decoder (see the comment
  // on `ongoing` in getMeetings.ts) -- postgres.js hands `db.execute` back
  // text for every column, so these two arrive as strings and are converted
  // explicitly below.
  endsAt: string;
  recordedAt: string;
  reflectionId: string | null;
  content: string | null;
  submittedAt: string | null;
  workshopDefinitionId: string | null;
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
      coalesce(m."nameOverride", 'Meeting') as label,
      m."endsAt", a."recordedAt", r.id as "reflectionId", r.content, r."submittedAt",
      r."workshopDefinitionId"
    from platform.attendance a
    join platform.meetings m on m.id = a."meetingId"
    left join platform.reflections r
      on r."userId" = a."userId" and r."meetingId" = m.id
    where a."userId" = ${userId}::uuid
      and ${meetingHasWorkshop(sql`m.id`)} and m."deletedAt" is null and m."cancelledAt" is null

    order by "endsAt" desc, "activityId"
  `);

  const meetingIds = rows.map((row) => row.activityId);
  const workshopRows =
    meetingIds.length === 0
      ? []
      : await db.execute<{
          meetingId: string;
          definitionId: string;
          title: string | null;
          project: string | null;
        }>(sql`
          select distinct on ("meetingId", "definitionId") "meetingId", "definitionId", title, project
          from platform.workshops
          where "meetingId" in (${sql.join(
            meetingIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
            and "definitionId" is not null and "deletedAt" is null
          order by "meetingId", "definitionId"
        `);
  const definitions = new Map(
    getWorkshops().workshops.map((workshop) => [workshop.id, workshop.title]),
  );
  const workshopsByMeeting = new Map<string, ReflectionWorkshop[]>();
  for (const row of workshopRows) {
    const list = workshopsByMeeting.get(row.meetingId) ?? [];
    list.push({
      id: row.definitionId,
      title:
        definitions.get(row.definitionId) ??
        row.title ??
        row.project ??
        row.definitionId,
    });
    workshopsByMeeting.set(row.meetingId, list);
  }

  return {
    minimumWordCount: policy.minimumWordCount,
    activities: rows.map((row) => {
      const endsAt = new Date(row.endsAt);
      const deadline = reflectionDeadline(
        reflectionWindowStart(endsAt, new Date(row.recordedAt)),
        policy.submissionWindowDays,
      );
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
        workshops: workshopsByMeeting.get(row.activityId) ?? [],
      };
    }),
  };
}
