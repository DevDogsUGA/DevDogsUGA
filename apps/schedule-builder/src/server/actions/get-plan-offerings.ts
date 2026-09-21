"use server";

import { db } from "~/server/db";
import { loadSections } from "~/lib/domain/loadSections";
import { toWeekSchedule } from "~/lib/schedule-display";
import { type WeekSchedule } from "~/types/scheduleTypes";

export async function getPlanOfferings(
  academicPeriod: number,
  crns: number[],
): Promise<WeekSchedule> {
  if (!crns.length) return {};

  const sections = await loadSections(db, { academicPeriod, crns });

  return toWeekSchedule(sections);
}
