"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { authenticate, expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  academicPrograms,
  profileAcademicPrograms,
  profiles,
} from "~/server/db/schema";
import { validateAcademicProgramIds } from "~/lib/validation/profile";

export interface UpdateAcademicProgramsResult {
  error?: string;
  programIds?: number[];
}

export default async function updateAcademicPrograms(
  programIds: number[],
): Promise<UpdateAcademicProgramsResult> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/account"),
  );

  const validationError = validateAcademicProgramIds(programIds);
  if (validationError) return { error: validationError };

  return db.transaction(async (tx) => {
    const [status] = await tx
      .select({
        frozen: sql<boolean>`platform.is_profile_frozen(${userId})`,
        suspended: sql<boolean>`platform.is_suspended(${userId})`,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId));

    if (!status) return { error: "Profile not found." };
    if (status.frozen || status.suspended) {
      return { error: "This profile can't be edited right now." };
    }

    if (programIds.length > 0) {
      const [programRows, currentRows] = await Promise.all([
        tx
          .select({ id: academicPrograms.id, active: academicPrograms.active })
          .from(academicPrograms)
          .where(inArray(academicPrograms.id, programIds)),
        tx
          .select({ programId: profileAcademicPrograms.programId })
          .from(profileAcademicPrograms)
          .where(eq(profileAcademicPrograms.userId, userId)),
      ]);
      const currentIds = new Set(currentRows.map(({ programId }) => programId));

      if (
        programRows.length !== programIds.length ||
        programRows.some(
          (program) => !program.active && !currentIds.has(program.id),
        )
      ) {
        return {
          error:
            "One of those programs is no longer in the current UGA Bulletin.",
        };
      }
    }

    await tx
      .delete(profileAcademicPrograms)
      .where(eq(profileAcademicPrograms.userId, userId));

    if (programIds.length > 0) {
      await tx.insert(profileAcademicPrograms).values(
        programIds.map((programId, sortOrder) => ({
          userId,
          programId,
          sortOrder,
        })),
      );
    }

    return { programIds };
  });
}
