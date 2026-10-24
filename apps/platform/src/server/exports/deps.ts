import {
  EXPORTS,
  exportParams,
  type ExportKind,
} from "@devdogsuga/events/exports";
import { eq } from "drizzle-orm";
import { MAX_EXPORT_ROWS } from "~/lib/exports";
import { db } from "~/server/db";
import { exportAudit, meetings } from "~/server/db/schema";
import type { ExportDeps } from "./types";

/**
 * The export queries are the CLI's, run as they are over the platform's
 * Postgres client: positional parameters (`$1` from, `$2` to, `$3` meeting).
 * Read through a cursor so a range that is too large stops at the ceiling
 * instead of holding it all.
 */
export const exportDeps: ExportDeps = {
  audit: async (userId, kind, filters) => {
    const [row] = await db
      .insert(exportAudit)
      .values({ userId, kind, filters })
      .returning({ id: exportAudit.id });
    return row!.id;
  },
  rows: async (kind: ExportKind, filters) => {
    const { sql: query, transform } = EXPORTS[kind];
    const out: Record<string, unknown>[] = [];
    for await (const page of db.$client
      .unsafe(query, exportParams(filters))
      .cursor(500)) {
      for (const row of page) {
        out.push(transform ? transform(row) : row);
      }
      if (out.length > MAX_EXPORT_ROWS) {
        throw new RangeError(
          `That is more than ${MAX_EXPORT_ROWS.toLocaleString("en-US")} rows. Choose a shorter range or one meeting.`,
        );
      }
    }
    return out;
  },
  finish: async (auditId, rowCount) => {
    await db
      .update(exportAudit)
      .set({ rowCount })
      .where(eq(exportAudit.id, auditId));
  },
  meetingSlug: async (meetingId) => {
    const [row] = await db
      .select({ slug: meetings.slug })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    return row?.slug ?? null;
  },
};
