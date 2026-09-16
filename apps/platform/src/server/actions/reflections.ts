"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  auditEvents,
  reflectionRevisions,
  reflections,
} from "~/server/db/schema";
import {
  reflectionDeadline,
  reflectionWordCount,
} from "~/server/reflections/policy";

export interface ReflectionActionState {
  ok: boolean;
  message: string;
}

const inputSchema = z.object({
  activityType: z.enum(["meeting", "competition"]),
  activityId: z.string().uuid(),
  content: z.string().max(12_000),
  intent: z.enum(["save", "submit"]),
});

export async function saveReflection(
  _previous: ReflectionActionState,
  formData: FormData,
): Promise<ReflectionActionState> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: "That reflection is invalid." };

  const userId = await expectSession();
  const input = parsed.data;
  try {
    await writeReflection(userId, input);
    revalidatePath("/attendance");
    return {
      ok: true,
      message:
        input.intent === "submit" ? "Reflection submitted." : "Draft saved.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ReflectionError
          ? error.message
          : "The reflection could not be saved. Try again.",
    };
  }
}

class ReflectionError extends Error {}

async function writeReflection(
  userId: string,
  input: z.infer<typeof inputSchema>,
): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const settings = await tx.execute<{
      minimumWordCount: number;
      submissionWindowDays: number;
    }>(sql`select "minimumWordCount", "submissionWindowDays"
          from platform."reflectionSettings" where id = true for share`);
    const policy = settings[0] ?? {
      minimumWordCount: 100,
      submissionWindowDays: 7,
    };
    const eligibility = await eligibleActivity(tx, userId, input);
    if (!eligibility)
      throw new ReflectionError("You are not eligible for this reflection.");
    if (
      new Date() >
      reflectionDeadline(eligibility.endsAt, policy.submissionWindowDays)
    ) {
      throw new ReflectionError("The reflection window has closed.");
    }
    if (
      input.intent === "submit" &&
      reflectionWordCount(input.content) < policy.minimumWordCount
    ) {
      throw new ReflectionError(
        `Submitted reflections require at least ${policy.minimumWordCount} words.`,
      );
    }

    const activityWhere =
      input.activityType === "meeting"
        ? and(
            eq(reflections.userId, userId),
            eq(reflections.meetingId, input.activityId),
          )
        : and(
            eq(reflections.userId, userId),
            eq(reflections.competitionId, input.activityId),
          );
    const existingRows = await tx.execute<{
      id: string;
      userId: string;
      meetingId: string | null;
      competitionId: string | null;
      content: string;
      submittedAt: Date | null;
    }>(sql`
      select id, "userId", "meetingId", "competitionId", content, "submittedAt"
      from platform.reflections
      where "userId" = ${userId}::uuid and
        ${
          input.activityType === "meeting"
            ? sql`"meetingId" = ${input.activityId}::uuid`
            : sql`"competitionId" = ${input.activityId}::uuid`
        }
      for update
    `);
    const existing = existingRows[0];
    if (existing?.submittedAt)
      throw new ReflectionError("This reflection is already submitted.");

    const submittedAt = input.intent === "submit" ? new Date() : null;
    let reflectionId: string;
    let beforeRevisionId: string | undefined;
    if (existing) {
      const [before] = await tx
        .insert(reflectionRevisions)
        .values({
          reflectionId: existing.id,
          userId,
          meetingId: existing.meetingId,
          competitionId: existing.competitionId,
          content: existing.content,
          submittedAt: existing.submittedAt,
          createdByUserId: userId,
        })
        .returning({ id: reflectionRevisions.id });
      beforeRevisionId = before?.id;
      await tx
        .update(reflections)
        .set({ content: input.content, submittedAt, updatedAt: new Date() })
        .where(activityWhere);
      reflectionId = existing.id;
    } else {
      const [created] = await tx
        .insert(reflections)
        .values({
          userId,
          meetingId: input.activityType === "meeting" ? input.activityId : null,
          competitionId:
            input.activityType === "competition" ? input.activityId : null,
          content: input.content,
          submittedAt,
        })
        .returning({ id: reflections.id });
      if (!created) throw new Error("Reflection was not created.");
      reflectionId = created.id;
    }
    const [after] = await tx
      .insert(reflectionRevisions)
      .values({
        reflectionId,
        userId,
        meetingId: input.activityType === "meeting" ? input.activityId : null,
        competitionId:
          input.activityType === "competition" ? input.activityId : null,
        content: input.content,
        submittedAt,
        createdByUserId: userId,
      })
      .returning({ id: reflectionRevisions.id });
    if (!after) throw new Error("Reflection revision was not created.");
    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: userId,
      source: "platform",
      action:
        input.intent === "submit" ? "reflection.submitted" : "reflection.saved",
      targetType: "reflection",
      targetId: reflectionId,
      metadata: {
        activityType: input.activityType,
        activityId: input.activityId,
      },
      beforeReflectionRevisionId: beforeRevisionId,
      afterReflectionRevisionId: after.id,
    });
    return reflectionId;
  });
  if (!result) throw new Error("Reflection transaction failed.");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function eligibleActivity(
  tx: Tx,
  userId: string,
  input: z.infer<typeof inputSchema>,
): Promise<{ endsAt: Date } | undefined> {
  if (input.activityType === "meeting") {
    const rows = await tx.execute<{ endsAt: Date }>(sql`
      select m."endsAt" from platform.attendance a
      join platform.meetings m on m.id = a."meetingId"
      where a."userId" = ${userId}::uuid and m.id = ${input.activityId}::uuid
        and a."revokedAt" is null and m."elEligible"
        and m."deletedAt" is null and m."cancelledAt" is null
      for share of a, m
    `);
    return rows[0];
  }
  const rows = await tx.execute<{ endsAt: Date }>(sql`
    select c."judgingStartsAt" as "endsAt"
    from platform."teamMembers" tm
    join platform.teams t on t.id = tm."teamId"
    join platform.competitions c on c.id = t."competitionId"
    join platform.workshops w on w.id = c."workshopId"
    where tm."userId" = ${userId}::uuid and c.id = ${input.activityId}::uuid
      and coalesce(t."participationOverride", t."competedAt" is not null)
      and c."elEligible" and c."deletedAt" is null and w."deletedAt" is null
    for share of tm, t, c, w
  `);
  return rows[0];
}
