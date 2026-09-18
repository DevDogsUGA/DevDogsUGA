import { type NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { verifyCronSecret } from "~/lib/cron/auth";
import { detectAvailableTerms } from "~/lib/parsers";
import {
  reconcileTerm,
  type TermReconcileResult,
} from "~/lib/parsers/reconcileTerm";
import { resolvePartsOfTermPerTerm } from "~/lib/parsers/termPartsOfTerm";
import { db } from "~/server/db";

export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  // A semester's CSV fetch failing (non-ok response or a thrown network
  // error) excludes only that semester from this run; it must not fail the
  // whole route the way a single bad fetch silently used to.
  const { terms: availableTerms, failedFetches } = await detectAvailableTerms();
  if (failedFetches.length > 0) {
    console.error("[scrape-registrar] CSV fetch failures:", failedFetches);
  }

  if (availableTerms.length === 0) {
    return NextResponse.json(
      { error: "No terms detected", failedFetches },
      { status: 502 },
    );
  }

  // Fetch part-of-term calendars over HTTP up front, before opening a
  // transaction. These are slow external requests and must not hold a DB
  // connection open while they run. Parts-of-term is required per term (it
  // sets course start/end dates), but the registrar lookup can fail for an
  // individual term (e.g. a missing calendar year); that must exclude only
  // that term from this run, not fail the whole route.
  const { succeeded, failed } = await resolvePartsOfTermPerTerm(availableTerms);

  if (failed.length > 0) {
    console.error("[scrape-registrar] parts-of-term failures:", failed);
  }

  if (succeeded.length === 0) {
    return NextResponse.json(
      { error: "No terms detected", failedFetches, failed },
      { status: 502 },
    );
  }

  // Each term is reconciled in its own transaction, scoped to that term's
  // rows only (see reconcileTerm.ts). One term's DB failure — a bad row, a
  // constraint violation — must not roll back or block siblings that already
  // succeeded, so it's caught here rather than left to abort the loop.
  const results: TermReconcileResult[] = [];
  const reconcileFailures: { academicPeriod: number; error: string }[] = [];

  for (const term of succeeded) {
    try {
      results.push(await reconcileTerm(term, db));
    } catch (err) {
      reconcileFailures.push({
        academicPeriod: term.academicPeriod,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (reconcileFailures.length > 0) {
    console.error("[scrape-registrar] reconcile failures:", reconcileFailures);
  }

  // Ensure indexes and refresh the materialized search view after each scrape.
  // These must be schema-qualified: the postgres-js connection uses the default
  // search_path ("$user", public), which does not include `schedule_builder`.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "offeringSearch_crn_idx"
      ON "schedule_builder"."offeringSearch" (crn)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "offeringSearch_fts_idx"
      ON "schedule_builder"."offeringSearch" USING gin (search_vector)
  `);

  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY "schedule_builder"."offeringSearch"`,
  );

  return NextResponse.json({
    ok: true,
    periods: results.map((r) => r.academicPeriod),
    courses: results.reduce((sum, r) => sum + r.courseCount, 0),
    offerings: results.reduce((sum, r) => sum + r.offeringCount, 0),
    meetings: results.reduce((sum, r) => sum + r.meetingCount, 0),
    failedFetches,
    failed,
    reconcileFailures,
  });
}
