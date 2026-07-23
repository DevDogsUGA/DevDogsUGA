import { subjects } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class SubjectCollector extends LookupCollector<
  typeof subjects.$inferInsert
> {
  constructor() {
    super(
      subjects,
      (row: Row) => {
        const abbr = row["SCHEDULE_OFFERING.SUBJECT"] ?? "";
        if (!abbr) return null;
        return {
          abbr,
          description: row["SCHEDULE_OFFERING.SUBJECT_DESC"] ?? "",
        };
      },
      (data) => data.abbr,
    );
  }
}
