import { instructors } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class InstructorCollector extends LookupCollector<
  typeof instructors.$inferInsert
> {
  constructor() {
    super(
      instructors,
      (row: Row) => {
        const firstName =
          row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_FIRST_NAME"] ?? "";
        const lastName =
          row["SCHEDULE_OFFERING.PRIMARY_INSTRUCTOR_LAST_NAME"] ?? "";
        if (!firstName && !lastName) return null;
        return {
          firstName,
          lastName,
          totalReviews: 0,
          averageRating: 0,
          difficultyRating: 0,
          wouldTakeAgainRating: 0,
        };
      },
      (data) => `${data.firstName}::${data.lastName}`,
      { set: [] }, // no-op update on conflict, preserving existing RMP data
    );
  }
}
