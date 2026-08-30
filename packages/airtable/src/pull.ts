import type { AirtableRecord } from "./client.js";
import { matchKeyField, type TableSpec } from "./field.js";

export interface PullResult<T = Record<string, unknown>> {
  /** Airtable record id. Stable across renames and edits. */
  airtableRecordId: string;
  /** The platform id from the match key, when the record carries one. */
  platformId: string | null;
  values: T;
}

/**
 * Parses Airtable records into the shape the sync writes to Postgres.
 *
 * Every record carries its `airtableRecordId`. Record IDs are stable across
 * renames, field edits, view re-sorts and moves between views, so an officer
 * retitling "Sprint 2" updates a row instead of orphaning every attendance
 * record pointing at it.
 *
 * `platformId` is nullable on purpose: a row an officer just created has no
 * platform id yet, which is how the sync tells "new in Airtable" from
 * "already linked".
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
