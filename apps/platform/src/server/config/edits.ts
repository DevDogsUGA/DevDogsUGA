import {
  COLLECTION_LABELS,
  COLLECTIONS,
  fieldLabel,
  keyOrder,
  unsettableFields,
  type Collection,
  type Item,
} from "./editFields";

/**
 * Personal edits and how they become a proposed config. Pure: the config files
 * come in as parsed JSON, nothing is read or written.
 *
 * An officer's saved edit for one item holds only the fields that differ from
 * the official config. Everything else follows whatever the official config
 * says today, so a merged change by someone else shows up in the officer's view
 * without being overwritten. A new item stores all of its fields.
 */

/** The three files a proposal can change. */
export interface ConfigFiles {
  meetings: { meetings: Item[]; [other: string]: unknown };
  workshops: { workshops: Item[]; [other: string]: unknown };
  venues: { venues: Item[]; [other: string]: unknown };
}

/** All five authored files; a proposal edits three and carries the rest. */
export interface AuthoredConfig extends ConfigFiles {
  series: unknown;
  questions: unknown;
  semesters?: unknown;
  badges?: unknown;
}

export interface SavedEdit {
  collection: Collection;
  key: string;
  isNew: boolean;
  fields: Item;
}

function listOf(files: ConfigFiles, collection: Collection): Item[] {
  switch (collection) {
    case "meeting":
      return files.meetings.meetings;
    case "workshop":
      return files.workshops.workshops;
    case "venue":
      return files.venues.venues;
  }
}

export function keyField(collection: Collection): string {
  return COLLECTION_LABELS[collection].key;
}

export function findItem(
  files: ConfigFiles,
  collection: Collection,
  key: string,
): Item | undefined {
  return listOf(files, collection).find(
    (item) => item[keyField(collection)] === key,
  );
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Puts an item's keys in the schema's order; unknown keys keep their place after. */
export function orderKeys(collection: Collection, item: Item): Item {
  const order = keyOrder(collection);
  const known = order.filter((name) => name in item);
  const rest = Object.keys(item).filter((name) => !order.includes(name));
  return Object.fromEntries([...known, ...rest].map((k) => [k, item[k]]));
}

/**
 * The fields of `submitted` that differ from `official`, in the shape a saved
 * edit stores. A field `submitted` lacks but `official` has is stored as null
 * (remove the key). A new item stores everything.
 */
export function changedFields(
  collection: Collection,
  official: Item | undefined,
  submitted: Item,
): Item {
  if (official === undefined) return { ...submitted };
  const changed: Item = {};
  const names = new Set([...Object.keys(official), ...Object.keys(submitted)]);
  for (const name of names) {
    if (name === keyField(collection)) continue;
    if (deepEqual(official[name], submitted[name])) continue;
    changed[name] = submitted[name] === undefined ? null : submitted[name];
  }
  return changed;
}

/** The official item with a saved edit's fields laid over it. */
export function applyFields(
  collection: Collection,
  official: Item,
  fields: Item,
): Item {
  const unset = unsettableFields(collection);
  const next: Item = { ...official };
  const added: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === null && unset.has(name)) delete next[name];
    else {
      if (!(name in next)) added.push(name);
      next[name] = value;
    }
  }
  // Existing keys keep the official file's order so the PR diff touches only
  // the lines that changed; new keys follow in schema order.
  const order = keyOrder(collection);
  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i === -1 ? order.length : i;
  };
  const fresh = added
    .filter((name) => name in next)
    .sort((a, b) => rank(a) - rank(b));
  const result: Item = {};
  for (const name of Object.keys(next)) {
    if (!fresh.includes(name)) result[name] = next[name];
  }
  for (const name of fresh) result[name] = next[name];
  return result;
}

export interface Orphan {
  edit: SavedEdit;
  reason: "gone" | "exists";
}

/**
 * Lays saved edits over the official files. An edit that no longer fits is
 * returned in `orphans` and left out: one for an item the official config no
 * longer has, or a "new" item the official config has since gained (somebody
 * else's proposal merged first).
 */
export function applyEdits<T extends ConfigFiles>(
  official: T,
  edits: readonly SavedEdit[],
): { files: T; orphans: Orphan[] } {
  const files = structuredClone(official);
  const orphans: Orphan[] = [];
  for (const edit of edits) {
    const list = listOf(files, edit.collection);
    const index = list.findIndex(
      (item) => item[keyField(edit.collection)] === edit.key,
    );
    if (edit.isNew) {
      if (index !== -1) {
        orphans.push({ edit, reason: "exists" });
        continue;
      }
      list.push(
        orderKeys(edit.collection, {
          [keyField(edit.collection)]: edit.key,
          ...edit.fields,
        }),
      );
      continue;
    }
    if (index === -1) {
      orphans.push({ edit, reason: "gone" });
      continue;
    }
    list[index] = applyFields(edit.collection, list[index]!, edit.fields);
  }
  return { files, orphans };
}

// ── The diff ─────────────────────────────────────────────────────────────────

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface ItemChange {
  collection: Collection;
  key: string;
  kind: "added" | "changed";
  fields: FieldChange[];
}

/** One item's change, or undefined when `after` equals `before`. */
export function diffItem(
  collection: Collection,
  key: string,
  before: Item | undefined,
  after: Item,
): ItemChange | undefined {
  const name = keyField(collection);
  if (before === undefined) {
    return {
      collection,
      key,
      kind: "added",
      fields: Object.keys(after)
        .filter((field) => field !== name)
        .map((field) => ({
          field,
          label: fieldLabel(collection, field),
          before: undefined,
          after: after[field],
        })),
    };
  }
  const fields: FieldChange[] = [];
  for (const field of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    if (deepEqual(before[field], after[field])) continue;
    fields.push({
      field,
      label: fieldLabel(collection, field),
      before: before[field],
      after: after[field],
    });
  }
  return fields.length > 0
    ? { collection, key, kind: "changed", fields }
    : undefined;
}

/** What a proposal changes against the official config, item by item. */
export function diffConfig(
  official: ConfigFiles,
  proposed: ConfigFiles,
): ItemChange[] {
  const changes: ItemChange[] = [];
  for (const collection of COLLECTIONS) {
    const name = keyField(collection);
    for (const after of listOf(proposed, collection)) {
      const key = String(after[name]);
      const change = diffItem(
        collection,
        key,
        findItem(official, collection, key),
        after,
      );
      if (change) changes.push(change);
    }
  }
  return changes;
}

/** A value as one line of a diff. */
export function showValue(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (value === null) return "(none)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** The edits that still change something against `official`, with their fields trimmed to the ones that differ. */
export function effectiveEdits(
  official: ConfigFiles,
  edits: readonly SavedEdit[],
): SavedEdit[] {
  const out: SavedEdit[] = [];
  for (const edit of edits) {
    if (edit.isNew) {
      out.push(edit);
      continue;
    }
    const base = findItem(official, edit.collection, edit.key);
    if (!base) {
      // Its official item is gone: kept so the preview reports it as an orphan
      // the officer can reset, rather than hiding a row they cannot reach.
      out.push(edit);
      continue;
    }
    const merged = applyFields(edit.collection, base, edit.fields);
    const fields = changedFields(edit.collection, base, merged);
    if (Object.keys(fields).length > 0) out.push({ ...edit, fields });
  }
  return out;
}

/** The changed files' paths in the repository. */
export const CONFIG_DIRECTORY = "packages/events/src/data";

export function configPath(collection: Collection): string {
  return `${CONFIG_DIRECTORY}/${COLLECTION_LABELS[collection].file}`;
}
