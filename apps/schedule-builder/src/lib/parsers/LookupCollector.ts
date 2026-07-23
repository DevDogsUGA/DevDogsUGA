import type { PgTable } from "drizzle-orm/pg-core";
import { bulkUpsert } from "./bulkUpsert";
import type { DrizzleTransaction, Row } from "./types";

/**
 * Collects rows for a simple lookup table keyed by a natural business key
 * (e.g. subject abbreviation), deduplicating in memory across every CSV row
 * seen. `flush` issues a single chunked bulk upsert and returns a map from
 * the natural key to the table's serial id, for dependent collectors to
 * resolve foreign keys against.
 */
export class LookupCollector<TData extends Record<string, unknown>> {
  private readonly pending = new Map<string, TData>();

  constructor(
    private readonly table: PgTable & { $inferInsert: TData },
    private readonly extract: (row: Row) => TData | null,
    private readonly keyFn: (data: TData) => string,
    private readonly options?: { set?: string[] },
  ) {}

  collect(row: Row): void {
    const data = this.extract(row);
    if (!data) return;
    this.pending.set(this.keyFn(data), data);
  }

  async flush(tx: DrizzleTransaction): Promise<Map<string, number>> {
    const rows = [...this.pending.values()];
    const returned = await bulkUpsert(tx, this.table, rows, this.options);
    const map = new Map<string, number>();
    for (const r of returned) map.set(this.keyFn(r as TData), r.id as number);
    return map;
  }
}
