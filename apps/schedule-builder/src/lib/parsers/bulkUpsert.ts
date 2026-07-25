import { getColumns, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { detectTarget } from "./schema-introspection";
import type { DrizzleTransaction } from "./types";

// Keeps each statement well under Postgres' 65535-bind-parameter limit
// regardless of how many columns a table has.
const CHUNK_SIZE = 1000;

type AnyRow = Record<string, unknown>;
type AnyPgTable = PgTable & { $inferInsert: AnyRow };

// Minimal structural view of the Drizzle insert builder. The table type here is
// dynamic (resolved at runtime from introspection), which Drizzle's generics
// can't express, so we describe just the fluent methods this file uses. `values`
// is both awaitable (plain INSERT) and chainable (upsert), matching Drizzle.
type ValuesResult = Promise<unknown> & {
  onConflictDoUpdate: (config: {
    target: unknown;
    set: Record<string, unknown>;
  }) => { returning: (cols: Record<string, PgColumn>) => Promise<AnyRow[]> };
};
type InsertableTx = {
  insert: (table: PgTable) => { values: (rows: AnyRow[]) => ValuesResult };
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Bulk INSERT ... ON CONFLICT DO UPDATE ... RETURNING, chunked to stay within
 * Postgres' parameter limit. Mirrors the per-row upsert semantics the old
 * BaseParser used, but issues one statement per chunk instead of one per row.
 *
 * For serial-PK-only tables (no natural unique key), this is a plain chunked
 * INSERT and returns no rows.
 */
export async function bulkUpsert<T extends AnyPgTable>(
  tx: DrizzleTransaction,
  table: T,
  rows: T["$inferInsert"][],
  options?: { set?: string[] },
): Promise<AnyRow[]> {
  if (rows.length === 0) return [];

  const { target, uniqueKeys, isSerialOnly } = detectTarget(table);
  const txTyped = tx as unknown as InsertableTx;

  if (isSerialOnly) {
    for (const part of chunk(rows, CHUNK_SIZE)) {
      await txTyped.insert(table).values(part);
    }
    return [];
  }

  const allCols = getColumns(table) as Record<string, PgColumn>;

  const setCols: string[] =
    options?.set ??
    (() => {
      const excludedKeys = new Set<string>(uniqueKeys);
      for (const uc of getTableConfig(table).uniqueConstraints) {
        for (const ucCol of uc.columns) {
          const k = Object.entries(allCols).find(
            ([, c]) => c.name === ucCol.name,
          )?.[0];
          if (k) excludedKeys.add(k);
        }
      }
      return Object.keys(allCols).filter(
        (k) => !allCols[k]!.primary && !excludedKeys.has(k),
      );
    })();

  // No-op fallback when setCols is empty: update the first unique key with its
  // own EXCLUDED value so the RETURNING clause still fires and returns the id.
  const set: Record<string, unknown> =
    setCols.length > 0
      ? Object.fromEntries(
          setCols.map((k) => [k, sql.raw(`EXCLUDED."${allCols[k]!.name}"`)]),
        )
      : Object.fromEntries(
          uniqueKeys
            .slice(0, 1)
            .map((k) => [k, sql.raw(`EXCLUDED."${allCols[k]!.name}"`)]),
        );

  const pkKey = Object.entries(allCols).find(([, c]) => c.primary)?.[0] ?? "id";
  const returning: Record<string, PgColumn> = { [pkKey]: allCols[pkKey]! };
  for (const k of uniqueKeys) returning[k] = allCols[k]!;

  const results: AnyRow[] = [];
  for (const part of chunk(rows, CHUNK_SIZE)) {
    const returned = await txTyped
      .insert(table)
      .values(part)
      .onConflictDoUpdate({ target, set })
      .returning(returning);
    results.push(...returned);
  }
  return results;
}
