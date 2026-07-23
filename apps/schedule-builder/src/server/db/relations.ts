import { defineRelations } from "drizzle-orm";
import * as tables from "./schema";

export const relations = defineRelations(tables, (t) => ({
  subjects: {
    courses: t.many.courses(),
  },

  colleges: {
    departments: t.many.departments(),
    courses: t.many.courses(),
  },

  departments: {
    college: t.one.colleges({
      from: t.departments.collegeId,
      to: t.colleges.id,
    }),
    courses: t.many.courses(),
  },

  buildings: {
    meetings: t.many.meetings(),
  },

  campuses: {
    offerings: t.many.offerings(),
  },

  scheduleTypes: {
    offerings: t.many.offerings(),
  },

  terms: {
    offerings: t.many.offerings(),
    partsOfTerm: t.many.partsOfTerm(),
  },

  partsOfTerm: {
    term: t.one.terms({
      from: t.partsOfTerm.academicPeriod,
      to: t.terms.academicPeriod,
    }),
    offerings: t.many.offerings(),
  },

  instructors: {
    offerings: t.many.offerings(),
  },

  courses: {
    subject: t.one.subjects({
      from: t.courses.subjectId,
      to: t.subjects.id,
    }),
    college: t.one.colleges({
      from: t.courses.collegeId,
      to: t.colleges.id,
    }),
    department: t.one.departments({
      from: t.courses.departmentId,
      to: t.departments.id,
    }),
    details: t.one.courseDetails({
      from: t.courses.id,
      to: t.courseDetails.courseId,
    }),
    offerings: t.many.offerings(),
    draftEntries: t.many.userPlanDraftCourses(),
  },

  courseDetails: {
    course: t.one.courses({
      from: t.courseDetails.courseId,
      to: t.courses.id,
    }),
  },

  offerings: {
    course: t.one.courses({
      from: t.offerings.courseId,
      to: t.courses.id,
    }),
    instructor: t.one.instructors({
      from: t.offerings.instructorId,
      to: t.instructors.id,
    }),
    scheduleType: t.one.scheduleTypes({
      from: t.offerings.scheduleTypeId,
      to: t.scheduleTypes.id,
    }),
    campus: t.one.campuses({
      from: t.offerings.campusId,
      to: t.campuses.id,
    }),
    term: t.one.terms({
      from: t.offerings.academicPeriod,
      to: t.terms.academicPeriod,
    }),
    partOfTermDetails: t.one.partsOfTerm({
      from: [t.offerings.academicPeriod, t.offerings.partOfTerm],
      to: [t.partsOfTerm.academicPeriod, t.partsOfTerm.code],
    }),
    meetings: t.many.meetings(),
  },

  meetings: {
    offering: t.one.offerings({
      from: t.meetings.offeringCrn,
      to: t.offerings.crn,
    }),
    building: t.one.buildings({
      from: t.meetings.buildingId,
      to: t.buildings.id,
    }),
  },

  userPlanDraftCourses: {
    course: t.one.courses({
      from: t.userPlanDraftCourses.courseId,
      to: t.courses.id,
    }),
  },
}));
