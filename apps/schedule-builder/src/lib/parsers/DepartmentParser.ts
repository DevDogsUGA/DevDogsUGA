import { departments } from "~/server/db/schema";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";

interface PendingDepartment {
  description: string;
  collegeDescription: string;
}

export class DepartmentCollector {
  private readonly pending = new Map<string, PendingDepartment>();

  collect(row: Row): void {
    const description = row["SCHEDULE_OFFERING.DEPARTMENT_DESC"] ?? "";
    const collegeDescription = row["SCHEDULE_OFFERING.COLLEGE_DESC"] ?? "";
    if (!description || !collegeDescription) return;
    this.pending.set(description, { description, collegeDescription });
  }

  async flush(
    tx: DrizzleTransaction,
    collegeIdMap: Map<string, number>,
  ): Promise<Map<string, number>> {
    const rows = [...this.pending.values()].map((d) => ({
      description: d.description,
      collegeId: collegeIdMap.get(d.collegeDescription)!,
    }));
    const returned = await bulkUpsert(tx, departments, rows);
    const map = new Map<string, number>();
    for (const r of returned) map.set(r.description as string, r.id as number);
    return map;
  }
}
