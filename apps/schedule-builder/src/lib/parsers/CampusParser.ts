import { campuses } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class CampusCollector extends LookupCollector<
  typeof campuses.$inferInsert
> {
  constructor() {
    super(
      campuses,
      (row: Row) => {
        const abbr = row["SCHEDULE_OFFERING.CAMPUS"] ?? "";
        if (!abbr) return null;
        return {
          abbr,
          description: row["SCHEDULE_OFFERING.CAMPUS_DESC"] ?? "",
        };
      },
      (data) => data.abbr,
    );
  }
}
