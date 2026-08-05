import { sql } from "drizzle-orm";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { canUserExportStars } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { csvStream } from "~/server/export/csv";
import {
  parseStarsFilters,
  projectStarRow,
  STARS_COLUMNS,
  streamStarRows,
  type StarsFilters,
} from "~/server/export/stars";

/**
 * GET /export/stars
 *
 * One row per `(member, workshop)`, across every semester. Query parameters:
 * `from`, `to` (ISO dates, on the meeting start) and `project` (a slug).
 *
 * Gated on `canExportStars`, which is deliberately separate from
 * `canEditAttendance`: correcting one member's check-in and downloading every
 * member's email are different powers, and the officer who needs the first
 * rarely needs the second.
 *
 * Every download is audited. That is the protection the design noted was LOST
 * by exporting attendance from Airtable instead — anybody with base access can
 * export a view silently — so keeping the one export that survived detectable
 * is what stops the loss from spreading to the file with the most PII in it.
 */
export async function GET(request: Request) {
  await connection();

  const callerId = await expectSession().catch(() => null);
  if (!callerId) unauthorized();
  if (!(await canUserExportStars(callerId))) unauthorized();

  const filters = parseStarsFilters(new URL(request.url));

  // Written BEFORE the stream, not after. A download that fails halfway still
  // put rows in front of somebody, and an audit row that only lands on clean
  // completion is one an aborted request can be used to avoid entirely.
  await recordDownload(callerId, filters);

  const stream = csvStream(
    [...STARS_COLUMNS],
    streamStarRows(filters),
    projectStarRow,
  );

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(filters)}"`,
      // The response is a snapshot of live data and carries member emails —
      // neither a browser nor an intermediary should keep a copy.
      "Cache-Control": "no-store, private",
    },
  });
}

async function recordDownload(
  userId: string,
  filters: StarsFilters,
): Promise<void> {
  await db.execute(sql`
    insert into "platform"."exportAudit" ("userId", "kind", "filters")
    values (${userId}, 'stars', ${JSON.stringify(serialize(filters))}::jsonb)
  `);
}

/**
 * The filters as recorded.
 *
 * Two officers exporting different slices is a different fact from two
 * exporting the whole roster, and only the parameters distinguish them — so an
 * unfiltered download is recorded as an explicit empty object rather than as
 * an absent field.
 */
function serialize(filters: StarsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.from) out.from = filters.from.toISOString();
  if (filters.to) out.to = filters.to.toISOString();
  if (filters.projectSlug) out.project = filters.projectSlug;
  return out;
}

function filename(filters: StarsFilters): string {
  const parts = ["stars"];
  if (filters.projectSlug) parts.push(filters.projectSlug);
  if (filters.from) parts.push(filters.from.toISOString().slice(0, 10));
  if (filters.to) parts.push(filters.to.toISOString().slice(0, 10));
  return `${parts.join("-")}.csv`;
}
