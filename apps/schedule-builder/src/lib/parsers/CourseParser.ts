import { courses } from "~/server/db/schema";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";

interface PendingCourse {
  abbr: string;
  courseNumber: string;
  title: string;
  abbrTitle: string;
  minCreditHours: number;
  maxCreditHours: number;
  minBillingCreditHours: number;
  honors: boolean;
  subjectAbbr: string;
  collegeDescription: string;
  departmentDescription: string | null;
}

export class CourseCollector {
  private readonly pending = new Map<string, PendingCourse>();

  collect(row: Row): void {
    const subjectAbbr = row["SCHEDULE_OFFERING.SUBJECT"] ?? "";
    const collegeDescription = row["SCHEDULE_OFFERING.COLLEGE_DESC"] ?? "";
    if (!subjectAbbr || !collegeDescription) return;

    const abbr = row["SCHEDULE_OFFERING.COURSE_IDENTIFICATION"] ?? "";
    this.pending.set(abbr, {
      abbr,
      courseNumber: row["SCHEDULE_OFFERING.COURSE_NUMBER"] ?? "",
      title: row["SCHEDULE_OFFERING.TITLE_LONG_DESC"] ?? "",
      abbrTitle: row["SCHEDULE_OFFERING.TITLE_SHORT_DESC"] ?? "",
      minCreditHours: parseFloat(row["SCHEDULE_OFFERING.MIN_CREDITS"] ?? "0"),
      maxCreditHours: parseFloat(row["SCHEDULE_OFFERING.MAX_CREDITS"] ?? "0"),
      minBillingCreditHours: parseFloat(
        row["SCHEDULE_OFFERING.MIN_BILLING"] ?? "0",
      ),
      honors: row["Has_Honors"] === "HONORS",
      subjectAbbr,
      collegeDescription,
      departmentDescription: row["SCHEDULE_OFFERING.DEPARTMENT_DESC"] || null,
    });
  }

  async flush(
    tx: DrizzleTransaction,
    subjectIdMap: Map<string, number>,
    collegeIdMap: Map<string, number>,
    departmentIdMap: Map<string, number>,
  ): Promise<Map<string, number>> {
    const rows = [...this.pending.values()].map((c) => ({
      abbr: c.abbr,
      courseNumber: c.courseNumber,
      title: c.title,
      abbrTitle: c.abbrTitle,
      minCreditHours: c.minCreditHours,
      maxCreditHours: c.maxCreditHours,
      minBillingCreditHours: c.minBillingCreditHours,
      honors: c.honors,
      subjectId: subjectIdMap.get(c.subjectAbbr)!,
      collegeId: collegeIdMap.get(c.collegeDescription)!,
      departmentId: c.departmentDescription
        ? (departmentIdMap.get(c.departmentDescription) ?? null)
        : null,
    }));
    const returned = await bulkUpsert(tx, courses, rows);
    const map = new Map<string, number>();
    for (const r of returned) map.set(r.abbr as string, r.id as number);
    return map;
  }
}
