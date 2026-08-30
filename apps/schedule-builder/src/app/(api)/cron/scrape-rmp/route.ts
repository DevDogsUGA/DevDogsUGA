import { type NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { instructors } from "~/server/db/schema";
import { verifyCronSecret } from "~/lib/cron/auth";

const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const TARGET_SCHOOL = "University of Georgia";

/**
 * One RMP request per instructor, spaced out to stay polite, does not fit in a
 * single Workers invocation: the full instructor table takes the better part of
 * an hour. The table is swept in daily slices instead, so every instructor is
 * refreshed once per rotation, with a wall-clock budget as a backstop.
 */
const ROTATION_DAYS = 30;
const REQUEST_SPACING_MS = 250;
const TIME_BUDGET_MS = 3 * 60 * 1000;

interface RmpEdge {
  node: {
    firstName: string;
    lastName: string;
    school: { name: string };
    avgRating: number;
    avgDifficulty: number;
    wouldTakeAgainPercent: number;
    numRatings: number;
  };
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Picks the RMP record for this instructor, or nothing.
 *
 * A surname is not an identity: UGA has many instructors per common surname,
 * and taking the first hit gave them all one professor's rating. A first-name
 * match is required, and a first-initial match is accepted only when it is
 * unambiguous. No confident match means no rating rather than a wrong one.
 */
function pickMatch(
  edges: RmpEdge[],
  firstName: string | null,
  lastName: string,
): RmpEdge["node"] | null {
  const candidates = edges
    .map((e) => e.node)
    .filter(
      (n) =>
        sameName(n.school.name, TARGET_SCHOOL) &&
        sameName(n.lastName, lastName),
    );
  if (candidates.length === 0) return null;

  // With no first name on our side there is nothing to disambiguate with, so
  // only a lone candidate is safe.
  if (!firstName?.trim()) {
    return candidates.length === 1 ? candidates[0]! : null;
  }

  const exact = candidates.filter((n) => sameName(n.firstName, firstName));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  // "Rob" vs "Robert", or a bare initial. Accepted only when one candidate fits.
  const initial = firstName.trim()[0]!.toLowerCase();
  const byInitial = candidates.filter(
    (n) => n.firstName.trim()[0]?.toLowerCase() === initial,
  );
  return byInitial.length === 1 ? byInitial[0]! : null;
}

async function fetchRmpRating(
  firstName: string | null,
  lastName: string,
): Promise<{
  averageRating: number;
  difficultyRating: number;
  wouldTakeAgainRating: number;
  totalReviews: number;
} | null> {
  const query = `{
    searchTeachers(query: "${lastName.replace(/"/g, '\\"')}") {
      edges {
        node {
          firstName lastName
          school { name }
          avgRating avgDifficulty wouldTakeAgainPercent numRatings
        }
      }
    }
  }`;

  try {
    const res = await fetch(RMP_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      data: { searchTeachers: { edges: RmpEdge[] } };
    };
    const edges = json.data?.searchTeachers?.edges ?? [];

    const match = pickMatch(edges, firstName, lastName);
    if (!match) return null;

    return {
      averageRating: match.avgRating,
      difficultyRating: match.avgDifficulty,
      wouldTakeAgainRating: Math.round(match.wouldTakeAgainPercent),
      totalReviews: match.numRatings,
    };
  } catch {
    return null;
  }
}

/** Which slice of the rotation today's run owns. */
function todaysSlice(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear) / 86_400_000);
  return dayOfYear % ROTATION_DAYS;
}

export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const slice = todaysSlice(new Date());

  const batch = await db
    .select({
      id: instructors.id,
      firstName: instructors.firstName,
      lastName: instructors.lastName,
    })
    .from(instructors)
    .where(sql`${instructors.id} % ${ROTATION_DAYS} = ${slice}`);

  const startedAt = Date.now();
  let updated = 0;
  let processed = 0;

  for (const instructor of batch) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const rating = await fetchRmpRating(
      instructor.firstName,
      instructor.lastName,
    );
    processed++;

    if (rating) {
      await db
        .update(instructors)
        .set(rating)
        .where(eq(instructors.id, instructor.id));
      updated++;
    }

    await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS));
  }

  return NextResponse.json({
    ok: true,
    slice,
    rotationDays: ROTATION_DAYS,
    batchSize: batch.length,
    processed,
    updated,
    truncated: processed < batch.length,
  });
}
