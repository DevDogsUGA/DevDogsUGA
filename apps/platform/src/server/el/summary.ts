import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * What /attendance says about a member's EL standing: the workshops they have
 * attended and the hours the club can vouch for. The hours come from
 * `platform."memberElEvidence"`, the same view the officers' evidence export
 * reads, so the page and the export cannot disagree about what is verified.
 */
export interface ElSummary {
  /** Distinct workshops attended (a workshop run twice counts once). */
  workshopsAttended: number;
  /** Workshops with a qualifying reflection. */
  workshopsVerified: number;
  workshopHours: number;
  projectHours: number;
  totalHours: number;
}

export async function getElSummary(userId: string): Promise<ElSummary> {
  const [attended, evidence] = await Promise.all([
    db.execute<{ n: number }>(sql`
      select count(distinct w."definitionId")::int as n
      from platform.attendance a
      join platform.meetings m on m.id = a."meetingId"
        and m."deletedAt" is null and m."cancelledAt" is null
      join platform.workshops w on w."meetingId" = m.id
        and w."definitionId" is not null and w."deletedAt" is null
      where a."userId" = ${userId}::uuid
    `),
    db.execute<{
      evidenceType: string;
      items: number;
      hours: string | null;
    }>(sql`
      select "evidenceType", count(*)::int as items, sum(hours)::text as hours
      from platform."memberElEvidence"
      where "userId" = ${userId}::uuid
      group by "evidenceType"
    `),
  ]);
  const of = (type: string) => evidence.find((r) => r.evidenceType === type);
  const workshopHours = Number(of("workshop")?.hours ?? 0);
  const projectHours = Number(of("project_report")?.hours ?? 0);
  return {
    workshopsAttended: attended[0]?.n ?? 0,
    workshopsVerified: of("workshop")?.items ?? 0,
    workshopHours,
    projectHours,
    totalHours: workshopHours + projectHours,
  };
}
