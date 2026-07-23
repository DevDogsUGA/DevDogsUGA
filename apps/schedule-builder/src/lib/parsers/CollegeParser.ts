import { colleges } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class CollegeCollector extends LookupCollector<
  typeof colleges.$inferInsert
> {
  constructor() {
    super(
      colleges,
      (row: Row) => {
        const description = row["SCHEDULE_OFFERING.COLLEGE_DESC"] ?? "";
        if (!description) return null;
        return { description };
      },
      (data) => data.description,
    );
  }
}
