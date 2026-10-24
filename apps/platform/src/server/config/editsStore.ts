import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { configEdits } from "~/server/db/schema";
import { isCollection, type Collection, type Item } from "./editFields";
import type { SavedEdit } from "./edits";

/**
 * An officer's saved config edits (`platform."configEdits"`): one row per
 * item, holding only the fields that differ from the official config. Rows are
 * private to the officer and deleted with their account (ON DELETE CASCADE).
 * Nothing here checks who the caller is: the actions gate on `isOfficer`.
 */

/** Rows one officer can hold at once. Far above any real use; bounds the table. */
export const EDITS_PER_OFFICER_MAX = 200;

export async function listEdits(userId: string): Promise<SavedEdit[]> {
  const rows = await db
    .select()
    .from(configEdits)
    .where(eq(configEdits.userId, userId))
    .orderBy(configEdits.createdAt);
  return rows.flatMap((row) =>
    isCollection(row.collection)
      ? [
          {
            collection: row.collection,
            key: row.itemKey,
            isNew: row.isNew,
            fields: row.fields as Item,
          },
        ]
      : [],
  );
}

export type SaveResult = "saved" | "cleared" | "too_many";

/**
 * Saves one item's edit, replacing any earlier one. An edit to an existing
 * item with nothing left to change clears the row: the item is official again.
 */
export async function saveEdit(
  userId: string,
  edit: SavedEdit,
): Promise<SaveResult> {
  if (!edit.isNew && Object.keys(edit.fields).length === 0) {
    await resetEdit(userId, edit.collection, edit.key);
    return "cleared";
  }
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: configEdits.id })
      .from(configEdits)
      .where(
        and(
          eq(configEdits.userId, userId),
          eq(configEdits.collection, edit.collection),
          eq(configEdits.itemKey, edit.key),
        ),
      );
    if (!existing) {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(configEdits)
        .where(eq(configEdits.userId, userId));
      if (n >= EDITS_PER_OFFICER_MAX) return "too_many";
    }
    await tx
      .insert(configEdits)
      .values({
        userId,
        collection: edit.collection,
        itemKey: edit.key,
        isNew: edit.isNew,
        fields: edit.fields,
      })
      .onConflictDoUpdate({
        target: [
          configEdits.userId,
          configEdits.collection,
          configEdits.itemKey,
        ],
        set: { isNew: edit.isNew, fields: edit.fields, updatedAt: sql`now()` },
      });
    return "saved";
  });
}

/** Reset to official for one item. */
export async function resetEdit(
  userId: string,
  collection: Collection,
  key: string,
): Promise<void> {
  await db
    .delete(configEdits)
    .where(
      and(
        eq(configEdits.userId, userId),
        eq(configEdits.collection, collection),
        eq(configEdits.itemKey, key),
      ),
    );
}

/** Reset to official for everything the officer has saved. */
export async function resetAllEdits(userId: string): Promise<number> {
  const rows = await db
    .delete(configEdits)
    .where(eq(configEdits.userId, userId))
    .returning({ id: configEdits.id });
  return rows.length;
}
