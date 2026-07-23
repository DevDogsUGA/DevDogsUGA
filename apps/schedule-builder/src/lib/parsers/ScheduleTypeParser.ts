import { scheduleTypes } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class ScheduleTypeCollector extends LookupCollector<
  typeof scheduleTypes.$inferInsert
> {
  constructor() {
    super(
      scheduleTypes,
      (row: Row) => {
        const abbr = row["SCHEDULE_OFFERING.SCHEDULE"] ?? "";
        if (!abbr) return null;
        return {
          abbr,
          description: row["SCHEDULE_OFFERING.SCHEDULE_DESC"] ?? "",
        };
      },
      (data) => data.abbr,
    );
  }
}
