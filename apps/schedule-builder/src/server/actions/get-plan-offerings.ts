"use server";

import { inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  offerings,
  courses,
  instructors,
  meetings,
  buildings,
} from "~/server/db/schema";
import { toWeekSchedule } from "~/lib/schedule-display";
import { type WeekSchedule } from "~/types/scheduleTypes";
import { eq } from "drizzle-orm";

export async function getPlanOfferings(crns: number[]): Promise<WeekSchedule> {
  if (!crns.length) return {};

  const rows = await db
    .select({
      crn: offerings.crn,
      seatsAvailable: offerings.seatsAvailable,
      actualEnrollment: offerings.actualEnrollment,
      maximumEnrollment: offerings.maximumEnrollment,
      courseAbbr: courses.abbr,
      courseTitle: courses.title,
      courseNumber: courses.courseNumber,
      maxCreditHours: courses.maxCreditHours,
      instructorFirstName: instructors.firstName,
      instructorLastName: instructors.lastName,
      meetingId: meetings.id,
      monday: meetings.monday,
      tuesday: meetings.tuesday,
      wednesday: meetings.wednesday,
      thursday: meetings.thursday,
      friday: meetings.friday,
      startTime: meetings.startTime,
      endTime: meetings.endTime,
      buildingDescription: buildings.description,
    })
    .from(offerings)
    .innerJoin(courses, eq(courses.id, offerings.courseId))
    .leftJoin(instructors, eq(instructors.id, offerings.instructorId))
    .leftJoin(meetings, eq(meetings.offeringCrn, offerings.crn))
    .leftJoin(buildings, eq(buildings.id, meetings.buildingId))
    .where(inArray(offerings.crn, crns));

  // Reshape flat join rows into the nested PlanOffering shape expected by toWeekSchedule
  const offeringMap = new Map<
    number,
    {
      crn: number;
      seatsAvailable: number;
      actualEnrollment: number;
      maximumEnrollment: number;
      courses: {
        abbr: string;
        title: string;
        courseNumber: string;
        maxCreditHours: number;
      } | null;
      instructors: { firstName: string | null; lastName: string | null } | null;
      meetings: {
        monday: boolean | null;
        tuesday: boolean | null;
        wednesday: boolean | null;
        thursday: boolean | null;
        friday: boolean | null;
        startTime: string | null;
        endTime: string | null;
        buildings: { description: string | null } | null;
      }[];
    }
  >();

  for (const row of rows) {
    if (!offeringMap.has(row.crn)) {
      offeringMap.set(row.crn, {
        crn: row.crn,
        seatsAvailable: row.seatsAvailable,
        actualEnrollment: row.actualEnrollment,
        maximumEnrollment: row.maximumEnrollment,
        courses: {
          abbr: row.courseAbbr,
          title: row.courseTitle,
          courseNumber: row.courseNumber,
          maxCreditHours: row.maxCreditHours,
        },
        instructors:
          row.instructorFirstName !== null || row.instructorLastName !== null
            ? {
                firstName: row.instructorFirstName ?? null,
                lastName: row.instructorLastName ?? null,
              }
            : null,
        meetings: [],
      });
    }
    if (row.meetingId !== null) {
      offeringMap.get(row.crn)!.meetings.push({
        monday: row.monday,
        tuesday: row.tuesday,
        wednesday: row.wednesday,
        thursday: row.thursday,
        friday: row.friday,
        startTime: row.startTime,
        endTime: row.endTime,
        buildings:
          row.buildingDescription !== null
            ? { description: row.buildingDescription }
            : null,
      });
    }
  }

  return toWeekSchedule([...offeringMap.values()]);
}
