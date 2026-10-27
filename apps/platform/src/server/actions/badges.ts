"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { profilePath } from "~/lib/profilePath";
import {
  awardManualBadge,
  setBadgeHidden,
  withdrawBadge,
} from "~/server/badges/manual";
import { db } from "~/server/db";
import { profiles } from "~/server/db/schema";
import { expectSession } from "~/server/auth";

/**
 * The badge actions. Officers award and withdraw from the console; members
 * hide their own from Settings. The rules live in `server/badges/manual.ts`
 * (which re-checks the actor); this only parses input and revalidates.
 */

export interface BadgeActionState {
  ok: boolean;
  message: string;
}

const MESSAGES = {
  forbidden: "Only officers can award or withdraw badges.",
  unknown_badge: "That badge cannot be awarded by hand.",
  citation_required: "Write a short citation: it is shown publicly.",
  citation_too_long: "The citation is too long.",
  unknown_member: "That member was not found.",
  self_award: "You cannot award yourself a badge.",
  reason_required: "Say why the badge is being withdrawn.",
  reason_too_long: "The reason is too long.",
  not_found: "That award is already withdrawn or does not exist.",
} as const;

async function revalidateMember(userId: string) {
  revalidatePath("/console/badges");
  revalidatePath(`/console/badges/${userId}`);
  const [row] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (row?.handle) revalidatePath(profilePath(row.handle));
  revalidatePath("/settings/profile");
}

const awardSchema = z.object({
  userId: z.string().uuid(),
  badgeId: z.string().min(1).max(60),
  citation: z.string().max(2000),
});

export async function awardBadge(
  _previous: BadgeActionState,
  formData: FormData,
): Promise<BadgeActionState> {
  const parsed = awardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "That award is invalid." };
  const officerId = await expectSession();
  const result = await awardManualBadge(officerId, parsed.data);
  if (result.status !== "awarded") {
    return { ok: false, message: MESSAGES[result.status] };
  }
  await revalidateMember(parsed.data.userId);
  return { ok: true, message: "Badge awarded." };
}

const withdrawSchema = z.object({
  awardId: z.string().uuid(),
  reason: z.string().max(2000),
});

export async function withdrawBadgeAward(
  _previous: BadgeActionState,
  formData: FormData,
): Promise<BadgeActionState> {
  const parsed = withdrawSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: "That request is invalid." };
  const officerId = await expectSession();
  const result = await withdrawBadge(
    officerId,
    parsed.data.awardId,
    parsed.data.reason,
  );
  if (result.status !== "withdrawn") {
    return { ok: false, message: MESSAGES[result.status] };
  }
  await revalidateMember(result.userId);
  return { ok: true, message: "Badge withdrawn." };
}

const hideSchema = z.object({
  badgeId: z.string().min(1).max(60),
  workshopDefinitionId: z.string().max(80).nullable(),
  hidden: z.boolean(),
});

/** The signed-in member hides or shows one of their own badges. */
export async function setMyBadgeHidden(
  input: z.input<typeof hideSchema>,
): Promise<{ changed: number }> {
  const parsed = hideSchema.parse(input);
  const userId = await expectSession();
  const changed = await setBadgeHidden(
    userId,
    parsed.badgeId,
    parsed.workshopDefinitionId,
    parsed.hidden,
  );
  await revalidateMember(userId);
  return { changed };
}
