import type { AirtableClient, LiveTable, NewField } from "./client.js";
import type { FieldSpec, TableSpec } from "./field.js";
import { registry } from "./registry.js";

/**
 * Creating the base from the registry.
 *
 * The base is built by script rather than by clicking, because a base built by
 * hand has no record of how it was built. The second one, a staging base or a
 * rebuild after somebody deletes a table, would be a different base with the
 * same name.
 *
 * Idempotent by construction: everything here is "create what is missing".
 * Re-running against a complete base does nothing, which makes it safe to run
 * after adding a field to the registry.
 */

/**
 * The `options` each field type requires at creation.
 *
 * Four types take none; the rest reject the request without them. Verified
 * against Airtable's field-model reference on 2026-08-06, then against the
 * real base. The values below are the ones that actually created.
 *
 * These are creation-time defaults, not a claim about what the field must look
 * like forever. An officer restyling a date format is not drift: `verify.ts`
 * compares `type`, and of `options` exactly one thing, the choice NAMES of a
 * select field whose spec declares `choices`, because the platform's own code
 * branches on those strings. Colours, date formats, precision, icons and
 * everything else in `options` remain the officers' to change, unchecked and
 * unreported. That widening is narrow on purpose, not the start of comparing
 * `options` generally.
 */
export function createOptionsFor(
  spec: FieldSpec,
  linkedTableId?: string,
): Record<string, unknown> | undefined {
  switch (spec.type) {
    case "singleLineText":
    case "multilineText":
    case "email":
    case "url":
      return undefined;

    // Integers. Every number the registry pushes is a count or a point total;
    // none is fractional, and precision 0 is what stops "3" rendering as
    // "3.00" in the officer's grid.
    case "number":
      return { precision: 0 };

    case "date":
      return { dateFormat: { name: "iso" } };

    // UTC, deliberately. The platform stores instants and the officer console
    // is read in one place, so a base-local timezone would only introduce a
    // second interpretation of the same column.
    case "dateTime":
      return {
        timeZone: "utc",
        dateFormat: { name: "iso" },
        timeFormat: { name: "24hour" },
      };

    case "checkbox":
      return { icon: "check", color: "greenBright" };

    case "singleSelect":
    case "multipleSelects":
      // Who owns the vocabulary decides the shape.
      //
      // A spec that DECLARES choices owns it: the field is created holding
      // exactly those, so Airtable's dropdown never offers a value the
      // platform cannot render, and `verify.ts` checks the live names against
      // the same list. A spec that declares none leaves the vocabulary to the
      // officers, who add choices in the UI. An empty choice list is legal, and
      // that is the point of it, not a placeholder for a list nobody wrote.
      //
      // `{ name }` and no colour, on purpose. The create endpoint takes choices
      // as `[{ name: "..." }]` with `color` optional and assigns one itself
      // when it is left out. Sending our own would make an officer restyling a
      // choice a permanent disagreement between the base and this file, over
      // something that is theirs to decide.
      //
      // LIMITATION, and the thing to know if you are here to add a choice:
      // this only ever runs at CREATION. `scaffoldBase` creates what is missing
      // and nothing else, and the client has no `updateField`, so adding a name
      // to a spec's `choices` does NOT reach a field that already exists. A
      // re-run skips it. Adding a choice to a live base is a manual edit in the
      // Airtable UI, and `verify.ts`'s choice check is what tells you the edit
      // is still outstanding, which is why it is fatal rather than a warning.
      return spec.choices
        ? { choices: spec.choices.map((name) => ({ name })) }
        : { choices: [] };

    case "multipleRecordLinks":
      if (!linkedTableId) {
        throw new Error(
          `Link field "${spec.name}" has no resolved target table id`,
        );
      }
      // `linkedTableId` and NOTHING ELSE.
      //
      // The published field-model reference lists `prefersSingleRecordLink` as
      // a required option and `isReversed` not at all. Both are wrong for
      // creation. Measured against the real API, all three combinations:
      //
      //   { linkedTableId }                                200
      //   { linkedTableId, prefersSingleRecordLink }       422
      //   { linkedTableId, isReversed }                    422
      //   { linkedTableId, prefersSingleRecordLink,        422
      //     isReversed }
      //
      // The 422s read "... is not included in the options schema", so these
      // are response-only properties: the create returns
      // `prefersSingleRecordLink: false` and `isReversed: false` without being
      // asked. Sending back what was read is what fails.
      //
      // The cost is that officers get a multi-record picker rather than a
      // single-record one. Cosmetic here, since every pull parser reads `v[0]`
      // and ignores the rest, but it is on the manual checklist as the
      // officer-facing half of "one meeting per workshop".
      return { linkedTableId };
  }
}

function isLink(spec: FieldSpec): boolean {
  return spec.type === "multipleRecordLinks";
}

function newField(spec: FieldSpec, linkedTableId?: string): NewField {
  const options = createOptionsFor(spec, linkedTableId);
  return { name: spec.name, type: spec.type, ...(options ? { options } : {}) };
}

export interface ScaffoldAction {
  kind: "table" | "field";
  table: string;
  field?: string;
  /** What it got, once Airtable assigned one. */
  id: string;
}

export interface ScaffoldResult {
  created: ScaffoldAction[];
  /** The base as it stands afterwards, what `pull-ids` writes from. */
  schema: LiveTable[];
}

/**
 * Match live tables and fields by NAME, not by id.
 *
 * Necessary rather than preferable: before the first scaffold every registry id
 * is a placeholder, so there is nothing to match on. After `pull-ids` has run
 * the ids are real, and a re-run matches on those first, because a field
 * renamed in the UI must not be created a second time.
 */
function findTable(live: LiveTable[], spec: TableSpec): LiveTable | undefined {
  return (
    live.find((t) => t.id === spec.id) ?? live.find((t) => t.name === spec.name)
  );
}

function hasField(table: LiveTable, spec: FieldSpec): boolean {
  return table.fields.some((f) => f.id === spec.id || f.name === spec.name);
}

/**
 * Bring the base up to the registry.
 *
 * Two passes, and the split is the whole design: a link field cannot be created
 * before the table it points at exists, so pass one creates every table with
 * only its non-link fields, and pass two fills the links in. Ordering the
 * tables by dependency would work today and break the first time two tables
 * link to each other; this cannot.
 */
export async function scaffoldBase(
  client: AirtableClient,
  options: {
    tables?: Record<string, TableSpec>;
    /** Report progress as it goes. Scaffolding is slow enough to narrate. */
    log?: (message: string) => void;
  } = {},
): Promise<ScaffoldResult> {
  const specs =
    options.tables ?? (registry as unknown as Record<string, TableSpec>);
  const log = options.log ?? (() => undefined);
  const created: ScaffoldAction[] = [];

  let live = (await client.getBaseSchema()).tables;

  // ── Pass 1: tables, and every field that is not a link ────────────────────
  for (const spec of Object.values(specs)) {
    const existing = findTable(live, spec);

    if (!existing) {
      const fields = Object.values(spec.fields)
        .filter((f) => !isLink(f))
        .map((f) => newField(f));

      const table = await client.createTable(spec.name, fields);
      created.push({ kind: "table", table: spec.name, id: table.id });
      for (const f of table.fields) {
        created.push({
          kind: "field",
          table: spec.name,
          field: f.name,
          id: f.id,
        });
      }
      log(
        `created table ${spec.name} (${table.id}) with ${fields.length} fields`,
      );
      live = [...live, table];
      continue;
    }

    log(`table ${spec.name} already exists (${existing.id})`);

    for (const fieldSpec of Object.values(spec.fields)) {
      if (isLink(fieldSpec) || hasField(existing, fieldSpec)) continue;
      const field = await client.createField(existing.id, newField(fieldSpec));
      created.push({
        kind: "field",
        table: spec.name,
        field: field.name,
        id: field.id,
      });
      existing.fields.push(field);
      log(`  + ${spec.name}.${field.name} (${field.id})`);
    }
  }

  // ── Pass 2: links, now that every target table has an id ──────────────────
  for (const spec of Object.values(specs)) {
    const existing = findTable(live, spec);
    if (!existing) continue;

    for (const fieldSpec of Object.values(spec.fields)) {
      if (!isLink(fieldSpec) || hasField(existing, fieldSpec)) continue;

      const targetKey = fieldSpec.linkTo;
      const targetSpec = targetKey ? specs[targetKey] : undefined;
      if (!targetSpec) {
        throw new Error(
          `Link field "${spec.name}.${fieldSpec.name}" names an unknown target "${String(targetKey)}"`,
        );
      }
      const target = findTable(live, targetSpec);
      if (!target) {
        throw new Error(
          `Link field "${spec.name}.${fieldSpec.name}" targets "${targetSpec.name}", which does not exist`,
        );
      }

      const field = await client.createField(
        existing.id,
        newField(fieldSpec, target.id),
      );
      created.push({
        kind: "field",
        table: spec.name,
        field: field.name,
        id: field.id,
      });
      existing.fields.push(field);
      log(`  + ${spec.name}.${field.name} -> ${targetSpec.name} (${field.id})`);
    }
  }

  // Re-read rather than trusting the accumulated view. Creating a link field
  // also creates its symmetric reverse field in the target table, and that one
  // is never in a create response, so anything built from the local copy would
  // be missing fields the base actually has.
  const schema = (await client.getBaseSchema()).tables;
  return { created, schema };
}

export interface ScaffoldPlan {
  table: string;
  /** False when the whole table would be created. */
  exists: boolean;
  /** Fields the registry declares and the base does not have. */
  missing: FieldSpec[];
  /** How many fields the registry declares for this table. */
  declared: number;
}

/**
 * What `scaffoldBase` would create, without creating it.
 *
 * Worth having because the first real run is against a base somebody cares
 * about, and "what would this do" is the question they will actually ask. It
 * reads the same `findTable`/`hasField` matching the real pass does, so a
 * dry-run that says "up to date" and a run that then creates something is a
 * contradiction rather than a difference in interpretation.
 */
export function planScaffold(
  schema: LiveTable[],
  tables?: Record<string, TableSpec>,
): ScaffoldPlan[] {
  const specs = tables ?? (registry as unknown as Record<string, TableSpec>);

  return Object.values(specs).map((spec) => {
    const live = findTable(schema, spec);
    const declared = Object.values(spec.fields);
    return {
      table: spec.name,
      exists: Boolean(live),
      missing: live ? declared.filter((f) => !hasField(live, f)) : declared,
      declared: declared.length,
    };
  });
}

export interface UndeclaredField {
  table: string;
  field: string;
  type: string;
}

/**
 * Fields the base has that the registry does not declare.
 *
 * Almost always the reverse side of a link: Airtable creates those
 * automatically and never mentions them in a create response, so they would
 * otherwise first appear as a surprise in `verify` output. Reported, never
 * failed on.
 */
export function undeclaredFields(
  schema: LiveTable[],
  tables?: Record<string, TableSpec>,
): UndeclaredField[] {
  const specs = tables ?? (registry as unknown as Record<string, TableSpec>);

  return schema.flatMap((live) => {
    const spec = Object.values(specs).find(
      (s) => s.id === live.id || s.name === live.name,
    );
    if (!spec) return [];

    const declared = Object.values(spec.fields);
    const names = new Set(declared.map((f) => f.name));
    const ids = new Set(declared.map((f) => f.id));

    return live.fields
      .filter((f) => !names.has(f.name) && !ids.has(f.id))
      .map((f) => ({ table: live.name, field: f.name, type: f.type }));
  });
}

/**
 * The registry ids discovered from a live base, keyed for `pull-ids`.
 *
 * Returned as data rather than written here so the rewriter can be tested
 * without a base, and so a mismatch is a diff rather than a surprise edit.
 */
export function discoverIds(
  schema: LiveTable[],
  tables?: Record<string, TableSpec>,
): {
  tables: Record<string, string>;
  fields: Record<string, string>;
  missing: string[];
} {
  const specs = tables ?? (registry as unknown as Record<string, TableSpec>);
  const tableIds: Record<string, string> = {};
  const fieldIds: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, spec] of Object.entries(specs)) {
    const live = findTable(schema, spec);
    if (!live) {
      missing.push(spec.name);
      continue;
    }
    tableIds[spec.id] = live.id;

    for (const [fieldKey, fieldSpec] of Object.entries(spec.fields)) {
      const liveField =
        live.fields.find((f) => f.id === fieldSpec.id) ??
        live.fields.find((f) => f.name === fieldSpec.name);
      if (!liveField) {
        missing.push(`${spec.name}.${fieldKey} ("${fieldSpec.name}")`);
        continue;
      }
      fieldIds[fieldSpec.id] = liveField.id;
    }
  }

  return { tables: tableIds, fields: fieldIds, missing };
}
