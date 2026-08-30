import type { AirtableRecord } from "./client.js";
import {
  matchKeyField,
  pushFields,
  type AirtableValue,
  type FieldSpec,
  type TableSpec,
} from "./field.js";

/**
 * Building the push payload: what changed, and what must never be written.
 *
 * Two rules do all the work here, and both are about NOT writing.
 */

export interface PushPlan {
  /** Records to send, keyed by field ID. */
  records: { fields: Record<string, AirtableValue> }[];
  /** Rows skipped because nothing they map to has changed. */
  unchanged: number;
  /** Field writes omitted because the platform value was null. */
  omittedBlanks: number;
}

/**
 * Whether two values are the same as far as Airtable is concerned.
 *
 * Airtable omits empty fields from responses entirely rather than returning
 * null, so `undefined` from a read and `null` from a projection describe the
 * same state and must compare equal. Otherwise every record with one empty
 * field looks changed on every pass, forever.
 */
function sameValue(a: AirtableValue, b: AirtableValue): boolean {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function isBlank(value: AirtableValue): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Projects rows onto Airtable records, skipping what has not changed.
 *
 * ## Change detection
 *
 * Compared against what Airtable currently holds rather than against a stored
 * hash. That costs one list call the pull already makes, needs no extra state,
 * and is self-correcting: if an officer edits a pushed value, the next pass
 * sees the difference and puts it back, where a stored hash would decide
 * nothing had changed and leave the edit in place.
 *
 * A sync that rewrites identical values burns the shared call allowance and
 * makes every record look freshly modified, which destroys "sort by last
 * modified" as a way to find what an officer actually touched.
 *
 * ## Never blanking
 *
 * A null projection omits the field from the payload rather than writing an
 * empty value. Null in Postgres means "we have not learned this yet", never
 * "it is empty", and the two are indistinguishable once written. This is what
 * stops a member who is missing from one Involvement CSV from having their
 * dues record's name silently cleared.
 */
export function buildPush<TRow>(
  spec: TableSpec,
  rows: TRow[],
  existing: AirtableRecord[],
): PushPlan {
  const key = matchKeyField(spec);
  const fields = pushFields(spec);

  const existingByKey = new Map<string, AirtableRecord>();
  for (const record of existing) {
    const keyValue = record.fields[key.id];
    if (typeof keyValue === "string" && keyValue !== "") {
      existingByKey.set(keyValue, record);
    }
  }

  const records: { fields: Record<string, AirtableValue> }[] = [];
  let unchanged = 0;
  let omittedBlanks = 0;

  for (const row of rows) {
    const projected = new Map<string, AirtableValue>();
    for (const spec of fields) {
      projected.set(spec.id, project(spec, row));
    }

    const keyValue = projected.get(key.id);
    // A row with no match key cannot be upserted: Airtable would create a
    // duplicate on every pass. The caller filters these out (members without a
    // ugaEmail, for instance); this is the backstop.
    if (typeof keyValue !== "string" || keyValue === "") continue;

    const current = existingByKey.get(keyValue);
    const payload: Record<string, AirtableValue> = {};
    let changed = current === undefined;

    for (const [fieldId, value] of projected) {
      if (isBlank(value) && fieldId !== key.id) {
        // Only counts as an omission when there was something to preserve.
        if (current && !isBlank(current.fields[fieldId])) omittedBlanks += 1;
        continue;
      }
      payload[fieldId] = value;
      if (current && !sameValue(current.fields[fieldId], value)) changed = true;
    }

    if (!changed) {
      unchanged += 1;
      continue;
    }

    records.push({ fields: payload });
  }

  return { records, unchanged, omittedBlanks };
}

/**
 * The same projection, addressed by Airtable record id instead of match key.
 *
 * Which one to use follows from who authors the table:
 *
 *   * The platform authors Members, Projects and Teams, so a row with no
 *     matching Airtable record SHOULD create one. That is `buildPush` +
 *     `upsertRecords`.
 *
 *   * Airtable authors Meetings, Workshops and Competitions. The platform only
 *     writes derived values back onto rows an officer already created. Sending
 *     those through an upsert keyed on `⚙️ Platform ID` would CREATE a second
 *     Airtable record for every row whose Platform ID is still blank, i.e.
 *     every row an officer just added, exactly the rows a sync touches first.
 *     That is this function.
 *
 * Same change detection and same never-blank rule, because they are properties
 * of the engine rather than of either call site.
 */
export interface UpdatePlan {
  records: { id: string; fields: Record<string, AirtableValue> }[];
  unchanged: number;
  omittedBlanks: number;
}

export function buildUpdate<TRow>(
  spec: TableSpec,
  entries: { recordId: string; row: TRow }[],
  existing: AirtableRecord[],
): UpdatePlan {
  const fields = pushFields(spec);
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const records: { id: string; fields: Record<string, AirtableValue> }[] = [];
  let unchanged = 0;
  let omittedBlanks = 0;

  for (const { recordId, row } of entries) {
    const current = existingById.get(recordId);
    // Unlike the upsert path there is nothing to create here: an id we have
    // never seen listed is a record deleted since the fetch, and PATCHing it
    // would fail the whole batch of ten.
    if (!current) continue;

    const payload: Record<string, AirtableValue> = {};
    let changed = false;

    for (const fieldSpec of fields) {
      const value = project(fieldSpec, row);
      if (isBlank(value)) {
        if (!isBlank(current.fields[fieldSpec.id])) omittedBlanks += 1;
        continue;
      }
      payload[fieldSpec.id] = value;
      if (!sameValue(current.fields[fieldSpec.id], value)) changed = true;
    }

    if (!changed) {
      unchanged += 1;
      continue;
    }

    records.push({ id: recordId, fields: payload });
  }

  return { records, unchanged, omittedBlanks };
}

function project<TRow>(spec: FieldSpec, row: TRow): AirtableValue {
  const fn = spec.project as unknown as
    ((row: TRow) => AirtableValue) | undefined;
  return fn ? fn(row) : null;
}

/** Field IDs to pass as `fieldsToMergeOn`. */
export function mergeOn(spec: TableSpec): string[] {
  return [matchKeyField(spec).id];
}
