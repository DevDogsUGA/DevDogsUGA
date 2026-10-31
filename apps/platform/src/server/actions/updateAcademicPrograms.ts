"use server";

import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";

import { authorizeSession } from "~/server/auth/access";

import { eq, inArray, sql } from "drizzle-orm";
import { authenticate, expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  academicPrograms,
  profileAcademicPrograms,
  profiles,
} from "~/server/db/schema";
import { validateAcademicProgramIds } from "~/lib/validation/profile";
import { revalidateOfficers } from "~/server/loaders/officers";

export default async function updateAcademicPrograms(
  programIds: number[],
): Promise<ActionResult<number[]>> {
  return expected(async () => {
    const access = await authorizeSession();
    if (!access.ok) {
      // A signed-out caller is sent to sign in; a signed-in one is refused.
      await expectSession().catch(() =>
        authenticate("google", "/dashboard/profile"),
      );
      throw new ExpectedFailure(access.message);
    }
    const userId = await expectSession().catch(() =>
      authenticate("google", "/dashboard/profile"),
    );

    const validationError = validateAcademicProgramIds(programIds);
    if (validationError)
      throw new ExpectedFailure(validationError, {
        academics: validationError,
      });

    const result = await db.transaction(async (tx) => {
      const [status] = await tx
        .select({
          frozen: sql<boolean>`platform.is_profile_frozen(${userId})`,
          suspended: sql<boolean>`platform.is_suspended(${userId})`,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId));

      if (!status) throw new ExpectedFailure("Profile not found.");
      if (status.frozen || status.suspended) {
        throw new ExpectedFailure("This profile can't be edited right now.");
      }

      if (programIds.length > 0) {
        const [programRows, currentRows] = await Promise.all([
          tx
            .select({
              id: academicPrograms.id,
              active: academicPrograms.active,
            })
            .from(academicPrograms)
            .where(inArray(academicPrograms.id, programIds)),
          tx
            .select({ programId: profileAcademicPrograms.programId })
            .from(profileAcademicPrograms)
            .where(eq(profileAcademicPrograms.userId, userId)),
        ]);
        const currentIds = new Set(
          currentRows.map(({ programId }) => programId),
        );

        if (
          programRows.length !== programIds.length ||
          programRows.some(
            (program) => !program.active && !currentIds.has(program.id),
          )
        ) {
          throw new ExpectedFailure(
            "One of those programs is no longer in the current UGA Bulletin.",
          );
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

      return programIds;
    });

    revalidateOfficers();
    return result;
  });
}
