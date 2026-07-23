"use server";

import { eq } from "drizzle-orm";
import { authenticate, expectSession } from "../auth";
import { db } from "../db";
import { profiles } from '../db/schema';

type Semester = "spring" | "summer" | "fall";

const SEMESTER_END_MONTH: Record<Semester, number> = {
  spring: 5,
  summer: 8,
  fall: 12,
};

function isGraduationInPast(semester: Semester, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return true;
  if (year > currentYear) return false;
  return SEMESTER_END_MONTH[semester] <= currentMonth;
}

export default async function updateGraduation(
  semester: Semester | null,
  year: number | null,
): Promise<{ error?: string }> {
  const userId = await expectSession().catch(() =>
    authenticate("google", "/console/profile"),
  );

  if ((semester === null) !== (year === null)) {
    return { error: "Both semester and year must be provided together." };
  }

  if (
    semester !== null &&
    year !== null &&
    isGraduationInPast(semester, year)
  ) {
    return { error: "Graduation date must be in the future." };
  }

  await db
    .update(profiles)
    .set({ graduationSemester: semester, graduationYear: year })
    .where(eq(profiles.userId, userId));

  return {};
}
