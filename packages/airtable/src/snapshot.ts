/**
 * A committed copy of the base's shape, so the registry can be checked without
 * a credential.
 *
 * `verify` asks whether the live base still matches the registry. That needs a
 * token, so it cannot run in pull-request CI: on `pull_request` GitHub runs the
 * workflow from the pull request, making any secret readable by its author.
 * This asks the offline question instead. Does the registry in this diff still
 * agree with the base as it was last observed.
 *
 * Neither replaces the other. Drift in the base is not caused by any commit and
 * no pull request can fix it, so it belongs on a schedule. A hand-edited field
 * id is caused by exactly one commit, and belongs on that commit.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LiveField, LiveTable } from "./client.js";
import type { TableSpec } from "./field.js";
import { registry } from "./registry.js";

/**
 * Package root rather than `src/`: this is data, not source, and nothing
 * imports it at build time.
 */
export const snapshotPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schema-snapshot.json",
);

export interface SchemaSnapshot {
  tables: LiveTable[];
}

/**
 * Reduces a live schema to the parts the checks actually read, in a stable
 * order.
 *
 * `findTable` matches on table id or name and `hasField` on field id or name,
 * so most options are dropped: colours, date formats and precisions can change
 * without changing the integration. Two values survive because the platform
 * assigns them meaning: declared select names and a datetime's timezone.
 *
 * The choice-name exception was added alongside `verify.ts`'s choice check.
 * The platform branches on those strings, so a rename SHOULD show up here.
 * Datetime timezone is the other exception: it controls which instant a typed
 * wall-clock time becomes, rather than merely how the grid presents it.
 *
 * Every other key in the bag, colours included, is still dropped. This is not
 * snapshotting `options` generally.
 *
 * Sorted because the Meta API makes no ordering promise, and an unsorted
 * snapshot would re-order itself on refresh and bury the real change.
 */
export function normalize(tables: LiveTable[]): LiveTable[] {
  return [...tables]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((table) => ({
      id: table.id,
      name: table.name,
      primaryFieldId: table.primaryFieldId,
      fields: [...table.fields]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          ...meaningfulOptions(field),
        })),
    }));
}

/**
 * The surviving sliver of `options`: choice names only, sorted, or nothing.
 *
 * Sorted because choice order is the officer's to arrange in the UI, and an
 * unsorted list would rewrite itself on the next refresh over a change nobody
 * made.
 *
 * A field with no choices emits no `options` key rather than an empty one, so
 * every field the base has ever held keeps the shape it had before this
 * existed. Read defensively, like `verify.ts`'s copy: a refresh that throws on
 * an unfamiliar option bag leaves the committed file stale, the one state in
 * which the offline check silently passes forever.
 */
function meaningfulOptions(
  field: LiveField,
): Pick<LiveField, "options"> | object {
  if (field.type === "dateTime") {
    const timeZone = field.options?.timeZone;
    return typeof timeZone === "string" ? { options: { timeZone } } : {};
  }

  const raw = (field.options as { choices?: unknown } | undefined)?.choices;
  if (!Array.isArray(raw)) return {};

  const names = raw
    .map((choice) => (choice as { name?: unknown } | null | undefined)?.name)
    .filter((name): name is string => typeof name === "string")
    .sort((a, b) => a.localeCompare(b));

  if (names.length === 0) return {};
  return { options: { choices: names.map((name) => ({ name })) } };
}

export function writeSnapshot(
  tables: LiveTable[],
  file: string = snapshotPath,
): void {
  const snapshot: SchemaSnapshot = { tables: normalize(tables) };
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export class SnapshotMissingError extends Error {}

export function readSnapshot(file: string = snapshotPath): SchemaSnapshot {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new SnapshotMissingError(
      `No schema snapshot at ${file}. Create one with \`pnpm devtools airtable apply\`.`,
    );
  }
  return JSON.parse(raw) as SchemaSnapshot;
}

export interface SnapshotDrift {
  table: string;
  /** True when the snapshot has no such table at all. */
  absent: boolean;
  /** Field names the registry declares and the snapshot does not have. */
  missing: string[];
  /** Same-named tables or fields whose Airtable identity has changed. */
  idMismatches: SnapshotIdMismatch[];
}

export interface SnapshotIdMismatch {
  /** Omitted when the mismatch is the table itself. */
  field?: string;
  registryId: string;
  snapshotId: string;
}

/**
 * What in the registry disagrees with the last observed live schema.
 *
 * One-directional on purpose. Fields the base has and the registry does not
 * are routine, since Airtable creates the reverse side of every link
 * automatically, so reporting them would fail builds for something nobody did.
 *
 * Identity is deliberately stricter than scaffolding. The scaffolder falls
 * back to names so it can bootstrap placeholders and adopt recreated fields;
 * this check runs after `apply` and must prove that adoption was written back.
 * A same-named field with a different ID is exactly the state that makes the
 * runtime preflight refuse every sync pass.
 */
export function snapshotDrift(snapshot: SchemaSnapshot): SnapshotDrift[] {
  const specs = Object.values(registry as unknown as Record<string, TableSpec>);

  return specs.flatMap((spec): SnapshotDrift[] => {
    const byId = snapshot.tables.find((table) => table.id === spec.id);
    const byName = snapshot.tables.find((table) => table.name === spec.name);
    const live = byId ?? byName;

    if (!live) {
      return [
        {
          table: spec.name,
          absent: true,
          missing: [],
          idMismatches: [],
        },
      ];
    }

    const idMismatches: SnapshotIdMismatch[] = [];
    if (live.id !== spec.id) {
      idMismatches.push({ registryId: spec.id, snapshotId: live.id });
    }

    const missing: string[] = [];
    for (const field of Object.values(spec.fields)) {
      if (live.fields.some((candidate) => candidate.id === field.id)) continue;

      const sameName = live.fields.find(
        (candidate) => candidate.name === field.name,
      );
      if (sameName) {
        idMismatches.push({
          field: field.name,
          registryId: field.id,
          snapshotId: sameName.id,
        });
      } else {
        missing.push(field.name);
      }
    }

    if (missing.length === 0 && idMismatches.length === 0) return [];
    return [
      {
        table: spec.name,
        absent: false,
        missing,
        idMismatches,
      },
    ];
  });
}
