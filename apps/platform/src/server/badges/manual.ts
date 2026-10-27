import {
  BADGE_CITATION_MAX_LENGTH,
  BADGE_WITHDRAWAL_REASON_MAX_LENGTH,
  getBadges,
} from "@devdogsuga/events";
import { and, eq, isNull } from "drizzle-orm";
import { isOfficer } from "~/server/actions/permissions";
import { db } from "~/server/db";
import { auditEvents, badgeAwards } from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";

/**
 * Officer-awarded badges (Q104, Q106, Q107) and a member hiding their own.
 *
 * Every function checks its actor itself rather than trusting the caller:
 * awarding and withdrawing need a leadership role (`isLeader`, the
 * `isLeadership` trait of any held role), hiding needs only the member's own
 * id. Each write and its audit event share a transaction.
 *
 * Automatic awards and their withdrawal are not here: the database does those
 * in the same transaction as the evidence (`platform.sync_workshop_badge`,
 * `platform.award_first_merge`).
 */

export type AwardResult =
  | { status: "awarded"; awardId: string }
  | {
      status:
        | "forbidden"
        | "unknown_badge"
        | "citation_required"
        | "citation_too_long"
        | "unknown_member"
        | "self_award";
    };

export async function awardManualBadge(
  officerId: string,
  input: { userId: string; badgeId: string; citation: string },
): Promise<AwardResult> {
  if (!(await isOfficer(officerId))) return { status: "forbidden" };
  const definition = getBadges().badges.find((b) => b.id === input.badgeId);
  if (definition?.kind !== "manual" || definition.perWorkshop) {
    return { status: "unknown_badge" };
  }
  const citation = input.citation.trim();
  if (citation === "") return { status: "citation_required" };
  if (citation.length > BADGE_CITATION_MAX_LENGTH) {
    return { status: "citation_too_long" };
  }
  if (input.userId === officerId) return { status: "self_award" };

  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: usersInAuth.id })
      .from(usersInAuth)
      .where(eq(usersInAuth.id, input.userId))
      .for("share");
    if (!member) return { status: "unknown_member" } as const;

    // A badge the member hid stays hidden when it is awarded again.
    const existing = await tx
      .select({ hidden: badgeAwards.hidden })
      .from(badgeAwards)
      .where(
        and(
          eq(badgeAwards.userId, input.userId),
          eq(badgeAwards.badgeId, input.badgeId),
          isNull(badgeAwards.withdrawnAt),
        ),
      );
    const hidden = existing.length > 0 && existing.every((row) => row.hidden);

    const [created] = await tx
      .insert(badgeAwards)
      .values({
        userId: input.userId,
        badgeId: input.badgeId,
        method: "manual",
        repeatable: definition.repeatable,
        awardedBy: officerId,
        citation,
        hidden,
      })
      .returning({ id: badgeAwards.id });
    if (!created) throw new Error("Badge award was not created.");
    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: officerId,
      source: "platform",
      action: "badge.awarded",
      targetType: "badgeAward",
      targetId: created.id,
      metadata: {
        userId: input.userId,
        badgeId: input.badgeId,
        citation,
        automatic: false,
      },
    });
    return { status: "awarded", awardId: created.id } as const;
  });
}

export type WithdrawResult =
  | { status: "withdrawn"; userId: string }
  | {
      status: "forbidden" | "reason_required" | "reason_too_long" | "not_found";
    };

/** An officer withdraws a live award (manual or automatic) with a reason. */
export async function withdrawBadge(
  officerId: string,
  awardId: string,
  reason: string,
): Promise<WithdrawResult> {
  if (!(await isOfficer(officerId))) return { status: "forbidden" };
  const trimmed = reason.trim();
  if (trimmed === "") return { status: "reason_required" };
  if (trimmed.length > BADGE_WITHDRAWAL_REASON_MAX_LENGTH) {
    return { status: "reason_too_long" };
  }
  return db.transaction(async (tx) => {
    const [withdrawn] = await tx
      .update(badgeAwards)
      .set({ withdrawnAt: new Date(), withdrawnReason: trimmed })
      .where(and(eq(badgeAwards.id, awardId), isNull(badgeAwards.withdrawnAt)))
      .returning({
        userId: badgeAwards.userId,
        badgeId: badgeAwards.badgeId,
        workshopDefinitionId: badgeAwards.workshopDefinitionId,
      });
    if (!withdrawn) return { status: "not_found" } as const;
    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: officerId,
      source: "platform",
      action: "badge.withdrawn",
      targetType: "badgeAward",
      targetId: awardId,
      metadata: { ...withdrawn, reason: trimmed, automatic: false },
    });
    return { status: "withdrawn", userId: withdrawn.userId } as const;
  });
}

/**
 * The member hides (or shows) one of their badges on their public profile.
 * Hides every live award of that badge (and workshop), so a multiplier badge
 * goes as one. The records stay.
 */
export async function setBadgeHidden(
  userId: string,
  badgeId: string,
  workshopDefinitionId: string | null,
  hidden: boolean,
): Promise<number> {
  const rows = await db
    .update(badgeAwards)
    .set({ hidden })
    .where(
      and(
        eq(badgeAwards.userId, userId),
        eq(badgeAwards.badgeId, badgeId),
        workshopDefinitionId
          ? eq(badgeAwards.workshopDefinitionId, workshopDefinitionId)
          : isNull(badgeAwards.workshopDefinitionId),
        isNull(badgeAwards.withdrawnAt),
      ),
    )
    .returning({ id: badgeAwards.id });
  return rows.length;
}
