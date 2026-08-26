"use server";

import { eq } from "drizzle-orm";
import { authenticate, expectSession } from "../auth";
import { db } from "../db";
import { profiles } from "../db/schema";
import { validateGraduation, type Semester } from "~/lib/validation/profile";

/**
 * The both-or-neither rule and the not-in-the-past rule live in
 * ~/lib/validation/profile, which is also what GraduationDateField checks
 * against on blur. Sharing them is what keeps this from being the thing that
 * fails a page-wide save: the client refuses the same pairs this does.
 */
export default async function updateGraduation(
  semester: Semester | null,
  year: number | null,
): Promise<{ error?: string }> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/account"),
  );

  const error = validateGraduation(semester, year);
  if (error) return { error };

  await db
    .update(profiles)
    .set({ graduationSemester: semester, graduationYear: year })
    .where(eq(profiles.userId, userId));

  return {};
}
