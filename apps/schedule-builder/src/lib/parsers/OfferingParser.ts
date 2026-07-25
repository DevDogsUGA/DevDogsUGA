import { offerings } from "~/server/db/schema";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";

interface PendingOffering {
  crn: number;
  crossListingId: string | null;
  minimumEnrollment: number;
  maximumEnrollment: number;
  actualEnrollment: number;
  seatsAvailable: number;
  active: boolean;
  academicPeriod: number;
  partOfTerm: string;
  courseAbbr: string;
  instructorKey: string | null;
  scheduleTypeAbbr: string;
  campusAbbr: string;
}

export class OfferingCollector {
  private readonly pending = new Map<number, PendingOffering>();

  collect(row: Row): void {
    const crn = parseInt(
      row["SCHEDULE_OFFERING.COURSE_REFERENCE_NUMBER"] ?? "",
      10,
    );
    const academicPeriod = parseInt(row.ACADEMIC_PERIOD ?? "", 10);
    const partOfTerm = row["SSBSECT.SSBSECT_PTRM_CODE"];
    if (isNaN(crn) || isNaN(academicPeriod) || !partOfTerm) return;

    const courseAbbr = row["SCHEDULE_OFFERING.COURSE_IDENTIFICATION"] ?? "";
    const scheduleTypeAbbr = row["SCHEDULE_OFFERING.SCHEDULE"] ?? "";
    const campusAbbr = row["SCHEDULE_OFFERING.CAMPUS"] ?? "";
    if (!courseAbbr || !scheduleTypeAbbr || !campusAbbr) return;

    const firstName =
      row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_FIRST_NAME"] ?? "";
    const lastName =
      row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_LAST_NAME"] ?? "";
    const instructorKey =
      firstName || lastName ? `${firstName}::${lastName}` : null;

    this.pending.set(crn, {
      crn,
      crossListingId: row["SCHEDULE_OFFERING.SECTION_CROSS_LIST"] ?? null,
      minimumEnrollment: 0,
      maximumEnrollment: parseInt(
        row["SCHEDULE_OFFERING.MAXIMUM_ENROLLMENT"] ?? "0",
        10,
      ),
      actualEnrollment: parseInt(
        row["SCHEDULE_OFFERING.ACTUAL_ENROLLMENT"] ?? "0",
        10,
      ),
      seatsAvailable: parseInt(
        row["SCHEDULE_OFFERING.SEATS_AVAILABLE"] ?? "0",
        10,
      ),
      active: row["SCHEDULE_OFFERING.STATUS"] === "A",
      academicPeriod,
      partOfTerm,
      courseAbbr,
      instructorKey,
      scheduleTypeAbbr,
      campusAbbr,
    });
  }

  /** Bulk-upserts offerings and returns the set of CRNs that resolved to a valid row. */
  async flush(
    tx: DrizzleTransaction,
    courseIdMap: Map<string, number>,
    instructorIdMap: Map<string, number>,
    scheduleTypeIdMap: Map<string, number>,
    campusIdMap: Map<string, number>,
  ): Promise<Set<number>> {
    const validCrns = new Set<number>();
    const rows: (typeof offerings.$inferInsert)[] = [];

    for (const o of this.pending.values()) {
      const courseId = courseIdMap.get(o.courseAbbr);
      const scheduleTypeId = scheduleTypeIdMap.get(o.scheduleTypeAbbr);
      const campusId = campusIdMap.get(o.campusAbbr);
      if (!courseId || !scheduleTypeId || !campusId) continue;

      validCrns.add(o.crn);
      rows.push({
        crn: o.crn,
        crossListingId: o.crossListingId,
        minimumEnrollment: o.minimumEnrollment,
        maximumEnrollment: o.maximumEnrollment,
        actualEnrollment: o.actualEnrollment,
        seatsAvailable: o.seatsAvailable,
        active: o.active,
        academicPeriod: o.academicPeriod,
        partOfTerm: o.partOfTerm,
        courseId,
        instructorId: o.instructorKey
          ? (instructorIdMap.get(o.instructorKey) ?? null)
          : null,
        scheduleTypeId,
        campusId,
      });
    }

    await bulkUpsert(tx, offerings, rows);
    return validCrns;
  }
}
