import type { AirtableClient, AirtableRecord } from "./client.js";
import {
  isMergeEligible,
  matchKeyField,
  platformOwnedFields,
  pushFields,
  type FieldSpec,
  type TableSpec,
} from "./field.js";
import { isPlaceholder, registry } from "./registry.js";

/**
 * Diffs the live base against the registry.
 *
 * Runs in CI and before any sync in a fresh environment. The registry is what
 * the code agrees with, so when this disagrees with the base the base is what
 * changes.
 */

export type Severity = "fatal" | "warn" | "report";

export interface Finding {
  severity: Severity;
  table: string;
  field?: string;
  message: string;
}

export interface VerifyResult {
  findings: Finding[];
  /**
   * Every platform-owned field, as a checklist for the one thing nothing can
   * verify. `.status()` fields are on it too: an officer typing over a refusal
   * message is the same class of problem as one typing over an attendance
   * count, and both are prevented the same way.
   */
  pushChecklist: { table: string; field: string; id: string }[];
  ok: boolean;
}

interface LiveTable {
  id: string;
  name: string;
  fields: {
    id: string;
    name: string;
    type: string;
    /**
     * Widened for check 6 alone. The Meta API returns the whole option bag
     * here, colours and date formats and precision, and the verifier reads one
     * key out of it: `choices`, and only for a field whose spec declares its
     * own. Nothing else in here is looked at. See the note on
     * `createOptionsFor` in `scaffold.ts`.
     */
    options?: Record<string, unknown>;
  }[];
}

/**
 * The six checks.
 *
 *   1. Every registered field ID exists       FATAL: writes into nothing
 *   2. Field types match the registry         FATAL: a text field where a
 *                                             date is expected coerces silently
 *   3. The .matchKey() field is merge-eligible FATAL: upsert rejects email,
 *                                             computed and other types
 *   4. Match keys are unique-ish              WARN: Airtable cannot enforce
 *                                             uniqueness on most field types
 *   5. Live fields absent from the registry   REPORT: officers may add their
 *                                             own, just list them
 *   6. Declared select choices match the base FATAL: a value the page cannot
 *                                             render is worse than no value
 *
 * The list read as most-severe-first until check 6 was added, which is fatal
 * and still numbered last. The numbers are stable identities rather than a
 * ranking: renumbering would repoint every inline comment and test name that
 * says "check 4" at a different check, and a renamed test is indistinguishable
 * from a deleted one in a diff.
 */
export async function verifyBase(
  client: AirtableClient,
  options: {
    checkDuplicates?: boolean;
    /**
     * The declarations to check against. Defaults to the real registry; taking
     * it as a parameter is what lets each check be driven against a
     * deliberately broken fixture base, which is the only way to know a check
     * fires rather than merely existing.
     */
    tables?: Record<string, TableSpec>;
  } = {},
): Promise<VerifyResult> {
  const specs = Object.values(
    options.tables ?? (registry as unknown as Record<string, TableSpec>),
  );
  const schema = await client.getBaseSchema();
  const liveByName = new Map<string, LiveTable>(
    schema.tables.map((t) => [t.name, t]),
  );
  const findings: Finding[] = [];
  const pushChecklist: VerifyResult["pushChecklist"] = [];

  // Collected for every table up front, independent of whether the schema
  // checks below can run at all. The checklist is most needed immediately
  // after scaffolding, at step 6 of the runbook, before the base has ever been
  // verified. Building it inside the checks would leave it empty exactly when
  // somebody is about to walk the UI with it.
  for (const spec of specs) {
    for (const fieldSpec of platformOwnedFields(spec)) {
      pushChecklist.push({
        table: spec.name,
        field: fieldSpec.name,
        id: fieldSpec.id,
      });
    }
  }

  for (const spec of specs) {
    // Placeholders are fatal rather than a warning. A placeholder that reaches
    // a live sync does not error. Airtable accepts the request and the write
    // lands nowhere, so the pass reports success and the data never arrives.
    if (isPlaceholder(spec.id)) {
      findings.push({
        severity: "fatal",
        table: spec.name,
        message:
          "Table ID is still a placeholder — run `pnpm devtools airtable scaffold` then `pnpm devtools airtable pull-ids`",
      });
      continue;
    }

    const live = liveByName.get(spec.name) ?? findById(schema.tables, spec.id);
    if (!live) {
      findings.push({
        severity: "fatal",
        table: spec.name,
        message: `Table ${spec.id} is not present in the base`,
      });
      continue;
    }

    const liveFieldsById = new Map(live.fields.map((f) => [f.id, f]));
    const registered = new Set<string>();

    for (const [key, fieldSpec] of Object.entries(spec.fields)) {
      registered.add(fieldSpec.id);

      if (isPlaceholder(fieldSpec.id)) {
        findings.push({
          severity: "fatal",
          table: spec.name,
          field: key,
          message:
            "Field ID is still a placeholder — run `pnpm devtools airtable scaffold` then `pnpm devtools airtable pull-ids`",
        });
        continue;
      }

      // Check 1: existence.
      const liveField = liveFieldsById.get(fieldSpec.id);
      if (!liveField) {
        findings.push({
          severity: "fatal",
          table: spec.name,
          field: key,
          message: `Field ${fieldSpec.id} ("${fieldSpec.name}") does not exist in the base`,
        });
        continue;
      }

      // Check 2: type. This is the one field IDs exist to survive. A rename
      // is invisible here, which is the point, but a retyped column is not.
      if (liveField.type !== fieldSpec.type) {
        findings.push({
          severity: "fatal",
          table: spec.name,
          field: key,
          message: `Field "${liveField.name}" is ${liveField.type} in the base, ${fieldSpec.type} in the registry`,
        });
      }

      // Check 3: merge eligibility of the match key.
      if (fieldSpec.isMatchKey && !isMergeEligible(fieldSpec.type)) {
        findings.push({
          severity: "fatal",
          table: spec.name,
          field: key,
          message: `Match key is ${fieldSpec.type}, which fieldsToMergeOn does not accept`,
        });
      }

      // Check 6: the choice list of a select field that declares one.
      //
      // A narrow widening of "compare type, never options", meant to stay
      // narrow: only choice NAMES, only for fields whose spec declares them. A
      // colour, a date format, a precision is still the officers' to change and
      // still not drift. See the same note on `createOptionsFor`.
      //
      // Fatal rather than a warning because the platform branches on these
      // strings. A choice renamed in the UI does not blank the column and does
      // not fail a write. It leaves rows holding a value no branch matches,
      // which surfaces as an empty slot on a page that is otherwise working,
      // worse than the field having no value at all.
      findings.push(...choiceFindings(spec.name, key, fieldSpec, liveField));
    }

    // Check 5: live fields the registry does not mention. A report, not an
    // error: the base is the officer console, and officers adding a column for
    // their own tracking is the system working. Listing them just means nobody
    // assumes a hand-added column syncs anywhere.
    for (const liveField of live.fields) {
      if (!registered.has(liveField.id)) {
        findings.push({
          severity: "report",
          table: spec.name,
          field: liveField.name,
          message: `Present in the base, not in the registry (${liveField.id}) — not synced`,
        });
      }
    }

    // Check 4: duplicate match keys.
    if (options.checkDuplicates !== false) {
      const records = await client.listRecords(live.id);
      findings.push(...duplicateKeyFindings(spec, records));
    }
  }

  return {
    findings,
    pushChecklist,
    ok: !findings.some((f) => f.severity === "fatal"),
  };
}

/**
 * Compares a select field's live choice names against the ones its spec
 * declares.
 *
 * A set comparison, not a sequence one: choice ORDER is the officer's to
 * arrange in the UI, nothing in the platform reads it, and treating a
 * drag-and-drop reorder as drift would train people to ignore the verifier.
 * Colours are likewise not looked at.
 *
 * Defensive about the shape because this is the only place the verifier reaches
 * into `options`, which the Meta API types as an open bag and the docs describe
 * loosely. Anything unrecognisable becomes a finding rather than a throw: a
 * verifier that dies mid-pass reports nothing about the tables it had not
 * reached, which is less useful than a bad base plus a clear message.
 *
 * Exported for the same reason `duplicateKeyFindings` is, so the comparison can
 * be driven against a deliberately broken live shape without standing up a
 * whole fixture base for each one.
 */
export function choiceFindings(
  table: string,
  field: string,
  spec: FieldSpec,
  live: { name: string; options?: Record<string, unknown> },
): Finding[] {
  const declared = spec.choices;
  if (!declared) return [];

  const fatal = (message: string): Finding[] => [
    { severity: "fatal", table, field, message },
  ];
  const list = (names: readonly string[]) =>
    names.map((n) => `"${n}"`).join(", ");

  const raw = (live.options as { choices?: unknown } | undefined)?.choices;
  if (!Array.isArray(raw)) {
    return fatal(
      `Field "${live.name}" declares choices ${list(declared)} in the registry, but the base reports no choice list for it`,
    );
  }

  const names: string[] = [];
  for (const choice of raw) {
    const name = (choice as { name?: unknown } | null | undefined)?.name;
    if (typeof name !== "string") {
      return fatal(
        `Field "${live.name}" has a choice the base did not name (${JSON.stringify(choice)}) — cannot compare against the registry's ${list(declared)}`,
      );
    }
    names.push(name);
  }

  const liveNames = new Set(names);
  const declaredNames = new Set(declared);
  const missing = declared.filter((c) => !liveNames.has(c));
  const extra = names.filter((n) => !declaredNames.has(n));
  if (missing.length === 0 && extra.length === 0) return [];

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing from the base ${list(missing)}`);
  if (extra.length > 0) parts.push(`present only in the base ${list(extra)}`);
  return fatal(
    `Field "${live.name}" choices disagree with the registry — ${parts.join("; ")}`,
  );
}

/**
 * Airtable does not enforce uniqueness on text or email fields, so a match key
 * being unique is a convention the base cannot uphold by itself.
 *
 * Two rows sharing a key is the failure that produces a member whose
 * attendance count is split across two records and whose dues look unpaid.
 */
export function duplicateKeyFindings(
  spec: TableSpec,
  records: AirtableRecord[],
): Finding[] {
  let key: FieldSpec;
  try {
    key = matchKeyField(spec);
  } catch {
    return [
      {
        severity: "fatal",
        table: spec.name,
        message: "Table does not declare exactly one .matchKey() field",
      },
    ];
  }

  const seen = new Map<string, number>();
  for (const record of records) {
    const value = record.fields[key.id];
    if (typeof value !== "string" || value === "") continue;
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({
      severity: "warn" as const,
      table: spec.name,
      field: key.name,
      message: `${count} records share the match key "${value}"`,
    }));
}

function findById(tables: LiveTable[], id: string): LiveTable | undefined {
  return tables.find((t) => t.id === id);
}

/**
 * Formats the result for a terminal.
 *
 * The push checklist is printed on success as well as failure, because it is
 * the one protection nothing can verify: the base schema response is
 * structural and carries no permission or editing-restriction data, so whether
 * field editing is locked down on each `⚙️` field can only be checked by a
 * human walking the UI.
 */
export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];
  const order: Severity[] = ["fatal", "warn", "report"];

  for (const severity of order) {
    const matching = result.findings.filter((f) => f.severity === severity);
    if (matching.length === 0) continue;
    lines.push(`\n${severity.toUpperCase()} (${matching.length})`);
    for (const finding of matching) {
      const where = finding.field
        ? `${finding.table}.${finding.field}`
        : finding.table;
      lines.push(`  ${where}: ${finding.message}`);
    }
  }

  lines.push(
    `\nMANUAL CHECK — field editing permissions (${result.pushChecklist.length} fields)`,
    "  The base schema API exposes no permission data, so this cannot be verified.",
    "  Confirm each of these is restricted to the sync's token in the Airtable UI:",
  );
  for (const entry of result.pushChecklist) {
    lines.push(`  - ${entry.table} / ${entry.field}`);
  }

  lines.push(`\n${result.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

export { pushFields };
