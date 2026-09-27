import { sql } from "drizzle-orm";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { canUserExportStars } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { csvStream } from "~/server/export/csv";
import {
  REFLECTIONS_COLUMNS,
  type ReflectionsFilters,
  parseReflectionsFilters,
  projectReflectionRow,
  streamReflectionRows,
} from "~/server/export/reflections";

/**
 * GET /export/reflections
 *
 * One row per reflection, across every semester, carrying the member's
 * current text -- reflections have no review status to export instead, so
 * this is the whole surface. Query parameters: `from`, `to` (ISO dates, on
 * when the reflection was created).
 *
 * Gated on `canExportStars`, the same flag `/export/stars` and
 * `/export/attendance` use. A reflection is EL evidence with a member's name
 * on it, the same category of PII as a roster export, so it gets the same
 * flag rather than a bespoke one.
 *
 * Every download is audited, the same as the other exports.
 */
export async function GET(request: Request) {
  await connection();

  const callerId = await expectSession().catch(() => null);
  if (!callerId) unauthorized();
  if (!(await canUserExportStars(callerId))) unauthorized();

  const filters = parseReflectionsFilters(new URL(request.url));

  // Written BEFORE the stream, not after -- see `/export/stars` for why: a
  // download that fails halfway still put rows in front of somebody.
  await recordDownload(callerId, filters);

  const stream = csvStream(
    [...REFLECTIONS_COLUMNS],
    streamReflectionRows(filters),
    projectReflectionRow,
  );

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(filters)}"`,
      // The response is a snapshot of live data and carries member emails
      // and reflection text. Neither a browser nor an intermediary should
      // keep a copy.
      "Cache-Control": "no-store, private",
    },
  });
}

async function recordDownload(
  userId: string,
  filters: ReflectionsFilters,
): Promise<void> {
  await db.execute(sql`
    insert into "platform"."exportAudit" ("userId", "kind", "filters")
    values (${userId}, 'reflections', ${JSON.stringify(serialize(filters))}::jsonb)
  `);
}

/**
 * The filters as recorded. See `/export/stars`'s `serialize`: an unfiltered
 * download is recorded as an explicit empty object rather than as an absent
 * field, so it is distinguishable from a slice.
 */
function serialize(filters: ReflectionsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.from) out.from = filters.from.toISOString();
  if (filters.to) out.to = filters.to.toISOString();
  return out;
}

function filename(filters: ReflectionsFilters): string {
  const parts = ["reflections"];
  if (filters.from) parts.push(filters.from.toISOString().slice(0, 10));
  if (filters.to) parts.push(filters.to.toISOString().slice(0, 10));
  return `${parts.join("-")}.csv`;
}
