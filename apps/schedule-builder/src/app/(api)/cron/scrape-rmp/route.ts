import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { instructors } from "~/server/db/schema";
import { verifyCronSecret } from "~/lib/cron/auth";

const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const TARGET_SCHOOL = "University of Georgia";

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

async function fetchRmpRating(lastName: string): Promise<{
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

    const match = edges.find(
      (e) => e.node.school.name.toLowerCase() === TARGET_SCHOOL.toLowerCase(),
    );
    if (!match) return null;

    return {
      averageRating: match.node.avgRating,
      difficultyRating: match.node.avgDifficulty,
      wouldTakeAgainRating: Math.round(match.node.wouldTakeAgainPercent),
      totalReviews: match.node.numRatings,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  const allInstructors = await db
    .select({
      id: instructors.id,
      firstName: instructors.firstName,
      lastName: instructors.lastName,
    })
    .from(instructors);

  let updated = 0;
  // Rate-limit: process sequentially with a small delay to avoid hammering RMP
  for (const instructor of allInstructors) {
    const rating = await fetchRmpRating(instructor.lastName);
    if (rating) {
      await db
        .update(instructors)
        .set(rating)
        .where(eq(instructors.id, instructor.id));
      updated++;
    }
    // 250 ms between requests
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({ ok: true, total: allInstructors.length, updated });
}
