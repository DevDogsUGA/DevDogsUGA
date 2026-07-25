import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import type { Course } from "~/types/course";

function meetingDays(m: {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}): string {
  return (
    [
      m.monday && "M",
      m.tuesday && "T",
      m.wednesday && "W",
      m.thursday && "R",
      m.friday && "F",
    ]
      .filter(Boolean)
      .join("") || "TBA"
  );
}

export async function getAllSubjects(): Promise<string[]> {
  const rows = await db
    .select({ abbr: schema.subjects.abbr })
    .from(schema.subjects)
    .orderBy(schema.subjects.abbr);
  return rows.map((r) => r.abbr);
}

export async function getCoursesBySubject(
  subjectAbbr: string,
): Promise<Course[]> {
  const rows = await db
    .select({
      id: schema.courses.id,
      courseNumber: schema.courses.courseNumber,
      title: schema.courses.title,
      abbrTitle: schema.courses.abbrTitle,
      subjectAbbr: schema.subjects.abbr,
      offeringCrn: schema.offerings.crn,
      instructorFirst: schema.instructors.firstName,
      instructorLast: schema.instructors.lastName,
      monday: schema.meetings.monday,
      tuesday: schema.meetings.tuesday,
      wednesday: schema.meetings.wednesday,
      thursday: schema.meetings.thursday,
      friday: schema.meetings.friday,
      startTime: schema.meetings.startTime,
      endTime: schema.meetings.endTime,
    })
    .from(schema.courses)
    .innerJoin(
      schema.subjects,
      eq(schema.courses.subjectId, schema.subjects.id),
    )
    .leftJoin(
      schema.offerings,
      eq(schema.offerings.courseId, schema.courses.id),
    )
    .leftJoin(
      schema.instructors,
      eq(schema.offerings.instructorId, schema.instructors.id),
    )
    .leftJoin(
      schema.meetings,
      eq(schema.meetings.offeringCrn, schema.offerings.crn),
    )
    .where(eq(schema.subjects.abbr, subjectAbbr));

  // Group flat join results by course
  const courseMap = new Map<
    number,
    {
      id: number;
      courseNumber: string;
      title: string;
      abbrTitle: string;
      subjectAbbr: string;
      offerings: Map<
        number,
        {
          crn: number;
          instructor?: { firstName: string; lastName: string };
          meetings: {
            monday: boolean;
            tuesday: boolean;
            wednesday: boolean;
            thursday: boolean;
            friday: boolean;
            startTime: string | null;
            endTime: string | null;
          }[];
        }
      >;
    }
  >();

  for (const row of rows) {
    if (!courseMap.has(row.id)) {
      courseMap.set(row.id, {
        id: row.id,
        courseNumber: row.courseNumber,
        title: row.title,
        abbrTitle: row.abbrTitle,
        subjectAbbr: row.subjectAbbr,
        offerings: new Map(),
      });
    }
    const course = courseMap.get(row.id)!;

    if (row.offeringCrn != null) {
      if (!course.offerings.has(row.offeringCrn)) {
        course.offerings.set(row.offeringCrn, {
          crn: row.offeringCrn,
          instructor:
            row.instructorFirst && row.instructorLast
              ? { firstName: row.instructorFirst, lastName: row.instructorLast }
              : undefined,
          meetings: [],
        });
      }
      const offering = course.offerings.get(row.offeringCrn)!;
      if (row.monday != null) {
        offering.meetings.push({
          monday: row.monday,
          tuesday: row.tuesday!,
          wednesday: row.wednesday!,
          thursday: row.thursday!,
          friday: row.friday!,
          startTime: row.startTime,
          endTime: row.endTime,
        });
      }
    }
  }

  return [...courseMap.values()].map((c) => ({
    courseId: c.id,
    subject: c.subjectAbbr,
    courseNumber: c.courseNumber,
    title: c.title,
    athenaTitle: c.abbrTitle,
    courseSections: [...c.offerings.values()].map((o) => ({
      crn: o.crn,
      professor: o.instructor,
      classes: o.meetings.map((m) => ({
        days: meetingDays(m),
        startTime: m.startTime ?? undefined,
        endTime: m.endTime ?? undefined,
      })),
    })),
  }));
}

export async function getCourseDetailsByCrn(
  crn: number,
): Promise<Course | null> {
  const rows = await db
    .select({
      courseId: schema.courses.id,
      courseNumber: schema.courses.courseNumber,
      title: schema.courses.title,
      abbrTitle: schema.courses.abbrTitle,
      subjectAbbr: schema.subjects.abbr,
    })
    .from(schema.offerings)
    .innerJoin(schema.courses, eq(schema.offerings.courseId, schema.courses.id))
    .innerJoin(
      schema.subjects,
      eq(schema.courses.subjectId, schema.subjects.id),
    )
    .where(eq(schema.offerings.crn, crn))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    courseId: row.courseId,
    subject: row.subjectAbbr,
    courseNumber: row.courseNumber,
    title: row.title,
    athenaTitle: row.abbrTitle,
  };
}
