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
import type { LiveField, LiveTable } from "./client.js";
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
 * it carries colours, date formats and precisions that change without the
 * shape changing, and every such edit would otherwise show up as a diff in a
 * file whose whole value is that a diff means something.
 *
 * ONE exception, added alongside `verify.ts`'s choice check: the NAMES of a
 * select field's choices survive. Those are strings the platform branches on
 * rather than styling, so they are schema in the sense this file cares about,
 * and a choice renamed in the UI SHOULD show up here as a diff.
 *
 * Keeping them is a precondition, not the check itself: `snapshotDrift` still
 * compares presence only, and adding an offline choice comparison to it is a
 * one-function change once the data is in the file. It is here because the
 * file can only be refreshed with a live credential -- so a snapshot written
 * without the names would make that later change need a base run first, which
 * is exactly the dependency the snapshot exists to remove.
 *
 * Colours are still dropped, and so is every other key in the bag; this is not
 * the start of snapshotting `options` generally.
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
          ...choiceOptions(field),
        })),
    }));
}

/**
 * The surviving sliver of `options`: choice names only, sorted, or nothing.
 *
 * Sorted for the same reason the tables and fields are -- choice order is the
 * officer's to arrange in the UI, and an unsorted list would rewrite itself on
 * the next refresh over a change nobody made.
 *
 * A field with no choices at all emits no `options` key rather than an empty
 * one, so every field the base has ever held keeps the exact shape it had
 * before this existed. Read defensively, like `verify.ts`'s copy: a snapshot
 * refresh that throws on an unfamiliar option bag would leave the committed
 * file stale, which is the one state in which the offline check silently
 * passes forever.
 */
function choiceOptions(field: LiveField): Pick<LiveField, "options"> | object {
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
      `No schema snapshot at ${file}. Create one with \`pnpm devtools airtable snapshot\`.`,
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
