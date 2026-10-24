/**
 * The database half of `import badges`. Reads the evidence, then applies the
 * plan in one transaction by calling `platform.sync_workshop_badge` and
 * `platform.award_first_merge`, the functions the triggers call, so the rules
 * live in one place. Writes one audit summary.
 */
import { withConnection } from "../production/access.js";
import { pairKey, type BadgesPlan, type ReflectionEvidence } from "./plan.js";

export interface Evidence {
  reflections: ReflectionEvidence[];
  /** `pairKey`s of live Workshop completed awards, any method. */
  liveWorkshopAwards: Set<string>;
  /** Members with at least one matched contribution. */
  contributors: string[];
  /** Members with any First Merge row, withdrawn or not. */
  firstMergeHolders: Set<string>;
}

export type ReadEvidence = () => Promise<Evidence>;

export function readEvidenceFor(url: string): ReadEvidence {
  return () =>
    withConnection(url, "Could not read the badge evidence", async (sql) => {
      const [reflections, awards, contributors, holders] = await Promise.all([
        sql`
          select r."id", r."userId", r."meetingId", r."workshopDefinitionId",
                 coalesce((select array_agg(distinct w."definitionId")
                             from "platform"."workshops" w
                            where w."meetingId" = r."meetingId"
                              and w."definitionId" is not null
                              and w."deletedAt" is null), '{}') as "offered",
                 exists (select 1 from "platform"."attendance" a
                          where a."userId" = r."userId"
                            and a."meetingId" = r."meetingId") as "attended",
                 (m."deletedAt" is null and m."cancelledAt" is null) as "live"
            from "platform"."reflections" r
            join "platform"."meetings" m on m."id" = r."meetingId"
           where r."submittedAt" is not null
             and r."meetingId" is not null
             and exists (select 1 from "auth"."users" u where u."id" = r."userId")`,
        sql`
          select "userId", "workshopDefinitionId" from "platform"."badgeAwards"
           where "badgeId" = 'workshop-completed' and "withdrawnAt" is null`,
        sql`
          select distinct "userId" from "platform"."contributions"
           where "userId" is not null`,
        sql`
          select distinct "userId" from "platform"."badgeAwards"
           where "badgeId" = 'first-merge'`,
      ]);
      return {
        reflections: reflections.map((r) => ({
          reflectionId: String(r.id),
          userId: String(r.userId),
          meetingId: String(r.meetingId),
          workshopDefinitionId:
            (r.workshopDefinitionId as string | null) ?? null,
          offered: r.offered as string[],
          attended: r.attended === true,
          meetingLive: r.live === true,
        })),
        liveWorkshopAwards: new Set(
          awards.map((a) =>
            pairKey(String(a.userId), String(a.workshopDefinitionId)),
          ),
        ),
        contributors: contributors.map((c) => String(c.userId)),
        firstMergeHolders: new Set(holders.map((h) => String(h.userId))),
      };
    });
}

export interface Applied {
  workshopAwarded: number;
  firstMergeAwarded: number;
}

export type ApplyBadges = (plan: BadgesPlan) => Promise<Applied>;

/** Everything inserted in this transaction carries its start time as "awardedAt". */
export const COUNT_AWARDED = `
select "badgeId", count(*)::int as "n" from "platform"."badgeAwards"
 where "awardedAt" = now() and "method" = 'automatic'
   and "badgeId" in ('workshop-completed', 'first-merge')
 group by "badgeId"`;

export function applyBadgesFor(url: string): ApplyBadges {
  return (plan) =>
    withConnection(url, "The badge backfill was rolled back", async (sql) => {
      let result: Applied = { workshopAwarded: 0, firstMergeAwarded: 0 };
      await sql.begin(async (tx) => {
        for (const award of plan.workshop.awards) {
          // Record the picker's default first; the reflection trigger then
          // runs the sync, and the explicit call below is a no-op after it.
          for (const reflectionId of award.assign) {
            await tx`
              update "platform"."reflections"
                 set "workshopDefinitionId" = ${award.definitionId}
               where "id" = ${reflectionId}::uuid
                 and "workshopDefinitionId" is null
                 and "submittedAt" is not null`;
          }
          await tx`select "platform"."sync_workshop_badge"(${award.userId}::uuid, ${award.definitionId})`;
        }
        for (const userId of plan.firstMerge.userIds) {
          await tx`select "platform"."award_first_merge"(${userId}::uuid)`;
        }
        const counts = await tx.unsafe(COUNT_AWARDED);
        const n = (badge: string) =>
          Number(counts.find((c) => c.badgeId === badge)?.n ?? 0);
        result = {
          workshopAwarded: n("workshop-completed"),
          firstMergeAwarded: n("first-merge"),
        };
        await tx`
          insert into "platform"."auditEvents"
            ("actorType", "source", "action", "targetType", "targetId", "metadata")
          values ('system', 'system', 'badge.backfill', 'badgeBackfill',
                  ${new Date().toISOString()},
                  ${tx.json({
                    ...result,
                    workshopSkipped: plan.workshop.skipped,
                    workshopAlreadyAwarded: plan.workshop.alreadyAwarded,
                    firstMergeAlreadyHeld: plan.firstMerge.alreadyHeld,
                  })})`;
      });
      return result;
    });
}
