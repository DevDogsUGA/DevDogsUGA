import { buildings } from "~/server/db/schema";
import { LookupCollector } from "./LookupCollector";
import type { Row } from "./types";

export class BuildingCollector extends LookupCollector<
  typeof buildings.$inferInsert
> {
  constructor() {
    super(
      buildings,
      (row: Row) => {
        const id = parseInt(row.Building ?? "", 10);
        if (isNaN(id)) return null;
        return { id, description: row["MEETING_TIME.BUILDING_DESC"] ?? "" };
      },
      (data) => String(data.id),
      // Only refresh `description` on conflict. `address`/`latitude`/`longitude`
      // aren't present in the registrar CSV, so the default upsert would null
      // them out on every run.
      { set: ["description"] },
    );
  }
}
