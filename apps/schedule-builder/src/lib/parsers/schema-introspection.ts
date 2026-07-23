import { getColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export interface TargetInfo {
  target: PgColumn | PgColumn[];
  uniqueKeys: string[];
  isSerialOnly: boolean;
}

const targetCache = new WeakMap<object, TargetInfo>();

/**
 * Figures out which column(s) to use as the ON CONFLICT target for a table,
 * following Drizzle's column metadata. Cached per-table since it's pure
 * schema introspection.
 */
export function detectTarget(table: PgTable): TargetInfo {
  if (targetCache.has(table)) return targetCache.get(table)!;

  const cols = getColumns(table) as Record<string, PgColumn>;
  const config = getTableConfig(table);

  // Priority 1: column-level unique (non-PK)
  for (const [key, col] of Object.entries(cols)) {
    if (col.isUnique && !col.primary) {
      const info: TargetInfo = {
        target: col,
        uniqueKeys: [key],
        isSerialOnly: false,
      };
      targetCache.set(table, info);
      return info;
    }
  }

  // Priority 2: table-level unique constraint
  if (config.uniqueConstraints.length > 0) {
    const uc = config.uniqueConstraints[0]!;
    const uniqueKeys = uc.columns.map(
      (ucCol) =>
        Object.entries(cols).find(([, c]) => c.name === ucCol.name)![0],
    );
    const info: TargetInfo = {
      target: uc.columns,
      uniqueKeys,
      isSerialOnly: false,
    };
    targetCache.set(table, info);
    return info;
  }

  // Priority 3: non-serial PK (integer PK whose value comes from the caller, e.g. buildings.id, offerings.crn)
  for (const [key, col] of Object.entries(cols)) {
    if (col.primary && !col.hasDefault) {
      const info: TargetInfo = {
        target: col,
        uniqueKeys: [key],
        isSerialOnly: false,
      };
      targetCache.set(table, info);
      return info;
    }
  }

  // Priority 4: serial-PK-only — plain INSERT, no natural dedup key
  const info: TargetInfo = {
    target: [] as unknown as PgColumn,
    uniqueKeys: [],
    isSerialOnly: true,
  };
  targetCache.set(table, info);
  return info;
}
