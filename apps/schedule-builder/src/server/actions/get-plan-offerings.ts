"use server";

import { db } from "~/server/db";
import { loadSections } from "~/lib/domain/loadSections";
import { toWeekSchedule } from "~/lib/schedule-display";
import { type WeekSchedule } from "~/types/scheduleTypes";

export async function getPlanOfferings(crns: number[]): Promise<WeekSchedule> {
  if (!crns.length) return {};

  const sections = await loadSections(db, { crns });

  return toWeekSchedule(sections);
}
