"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { auditEvents, reflectionSettings } from "~/server/db/schema";
import { canUserManageAttendance } from "./permissions";

export interface ReflectionSettingsActionState {
  ok: boolean;
  message: string;
}

// Bounds are sanity limits, not policy: a word count above this is almost
// certainly a typo (1000 words is already a long reflection), and a
// submission window longer than a semester defeats the point of a deadline.
const MINIMUM_WORD_COUNT_BOUNDS = { min: 1, max: 1000 } as const;
const SUBMISSION_WINDOW_DAYS_BOUNDS = { min: 1, max: 90 } as const;

const inputSchema = z.object({
  minimumWordCount: z.coerce
    .number()
    .int()
    .min(MINIMUM_WORD_COUNT_BOUNDS.min)
    .max(MINIMUM_WORD_COUNT_BOUNDS.max),
  submissionWindowDays: z.coerce
    .number()
    .int()
    .min(SUBMISSION_WINDOW_DAYS_BOUNDS.min)
    .max(SUBMISSION_WINDOW_DAYS_BOUNDS.max),
});

/**
 * Updates the global EL reflection policy: the minimum word count a
 * submission needs and how many days after an activity ends members may
 * still submit. Gated on `canManageAttendance`, the same flag that gates
 * `/console/attendance` -- reflections are earned through attendance
 * eligibility and read from the same page, so there is no separate
 * "manage reflections" permission to hold.
 */
export async function updateReflectionSettings(
  _previous: ReflectionSettingsActionState,
  formData: FormData,
): Promise<ReflectionSettingsActionState> {
  const userId = await expectSession();
  if (!(await canUserManageAttendance(userId))) {
    return {
      ok: false,
      message: "Not authorized: canManageAttendance required.",
    };
  }

  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: `Minimum word count must be an integer from ${MINIMUM_WORD_COUNT_BOUNDS.min} to ${MINIMUM_WORD_COUNT_BOUNDS.max}, and the submission window must be an integer from ${SUBMISSION_WINDOW_DAYS_BOUNDS.min} to ${SUBMISSION_WINDOW_DAYS_BOUNDS.max} days.`,
    };
  }

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({
        minimumWordCount: reflectionSettings.minimumWordCount,
        submissionWindowDays: reflectionSettings.submissionWindowDays,
      })
      .from(reflectionSettings)
      .limit(1);

    await tx
      .update(reflectionSettings)
      .set({
        minimumWordCount: parsed.data.minimumWordCount,
        submissionWindowDays: parsed.data.submissionWindowDays,
        updatedAt: new Date(),
      })
      .where(eq(reflectionSettings.id, true));

    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: userId,
      source: "platform",
      action: "reflectionSettings.updated",
      // Singleton row, so there is no per-row id to key the audit log on --
      // the fixed string is the target's whole identity, same as its primary
      // key is a fixed boolean rather than a uuid.
      targetType: "reflectionSettings",
      targetId: "reflectionSettings",
      metadata: { before, after: parsed.data },
    });
  });

  revalidatePath("/console/attendance");
  revalidatePath("/attendance");

  return { ok: true, message: "Reflection settings updated." };
}
