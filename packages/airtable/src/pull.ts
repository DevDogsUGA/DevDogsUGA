import type { AirtableRecord } from "./client.js";
import { matchKeyField, type TableSpec } from "./field.js";

export interface PullResult<T = Record<string, unknown>> {
  /** Airtable record id — the stable identity across renames and edits. */
  airtableRecordId: string;
  /** The platform id from the match key, when the record carries one. */
  platformId: string | null;
  values: T;
}

/**
 * Parses Airtable records into the shape the sync writes to Postgres.
 *
 * Every record carries its `airtableRecordId`, which is the single most
 * important detail in the integration: record IDs are stable across renames,
 * field edits, view re-sorts and moves between views, so an officer retitling
 * "Sprint 2" updates a row rather than orphaning every attendance record
 * pointing at it.
 *
 * `platformId` is separately nullable and that is meaningful — a row an
 * officer has just created has no platform id yet, which is exactly how the
 * sync tells "new in Airtable" from "already linked".
 */
export function applyPull<T = Record<string, unknown>>(
  spec: TableSpec,
  records: AirtableRecord[],
): PullResult<T>[] {
  const key = matchKeyField(spec);

  return records.map((record) => {
    const values: Record<string, unknown> = {};

    for (const [name, fieldSpec] of Object.entries(spec.fields)) {
      if (fieldSpec.direction !== "pull") continue;
      const parse = fieldSpec.parse;
      if (!parse) continue;
      values[name] = parse(record.fields[fieldSpec.id]);
    }

    const keyValue = record.fields[key.id];

    return {
      airtableRecordId: record.id,
      platformId: typeof keyValue === "string" && keyValue ? keyValue : null,
      values: values as T,
    };
  });
}
