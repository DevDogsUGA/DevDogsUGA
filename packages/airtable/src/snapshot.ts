/**
 * A committed copy of the base's shape, so the registry can be checked without
 * a credential.
 *
 * `verify` answers "does the live base still match the registry", which needs a
 * token and so cannot run in pull-request CI -- on `pull_request` GitHub runs
 * the workflow from the pull request, making any secret readable by its author.
 * This answers the adjacent question that *can* be asked offline: does the
 * registry in this diff still agree with the base as it was last observed.
 *
 * The two catch different things and neither replaces the other. Drift in the
 * base is not caused by any commit and no pull request can fix it, so it
 * belongs on a schedule; a hand-edited field id in a diff is caused by exactly
 * one commit, and belongs on that commit.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LiveTable } from "./client.js";
import { planScaffold } from "./scaffold.js";

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
 * so nothing else is load-bearing. Field `options` is dropped deliberately --
 * it carries choice lists and colours that change without the shape changing,
 * and every such edit would otherwise show up as a diff in a file whose whole
 * value is that a diff means something.
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
        .map((field) => ({ id: field.id, name: field.name, type: field.type })),
    }));
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
      `No schema snapshot at ${file}. Create one with \`pnpm airtable:snapshot\`.`,
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
}

/**
 * What the registry declares that the snapshot does not have.
 *
 * Deliberately one-directional. Fields the base has and the registry does not
 * are routine -- Airtable creates the reverse side of every link automatically
 * -- so reporting them here would fail builds for something nobody did.
 */
export function snapshotDrift(snapshot: SchemaSnapshot): SnapshotDrift[] {
  return planScaffold(snapshot.tables)
    .filter((plan) => !plan.exists || plan.missing.length > 0)
    .map((plan) => ({
      table: plan.table,
      absent: !plan.exists,
      missing: plan.missing.map((field) => field.name),
    }));
}
