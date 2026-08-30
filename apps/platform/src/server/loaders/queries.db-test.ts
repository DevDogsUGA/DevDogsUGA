// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  getUpcomingMeetings,
  getPastMeetings,
  getMeetingBySlug,
  getWorkshopDetail,
  getCompetitionBySlug,
  getMeetingWorkshops,
  getMeetingsInRange,
} from "./meetings";
import {
  getTeamsForCompetition,
  getTeamDetail,
  getPendingForUser,
  getMyTeam,
} from "./teams";
import { getStarsForUser, getStarsForWorkshop } from "./stars";
import {
  getStandings,
  getMemberPointsLeaderboard,
  getMemberPoints,
} from "./points";
import {
  getOpenElections,
  getElectionBySlug,
  getBallotOptions,
  getMyBallot,
  getElectionResults,
  getTiebreakDisclosures,
  getPointsElections,
} from "./elections";
import { readSyncState } from "~/server/airtable/lease";
import { streamStarRows } from "~/server/export/stars";

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Every loader query, executed against a real database.
 *
 * Not an assertion suite. The expectations are trivial on purpose. What this
 * catches is the class of bug typechecking cannot: a Drizzle expression that
 * compiles and generates invalid SQL. That has already happened once here (a
 * tuple `notInArray` rendered a subquery with too few columns and would have
 * thrown on the first cron run), and a loader has no cron to fail loudly in.
 * It fails on the page, for a member.
 *
 * Nil UUIDs and nonexistent slugs throughout: the point is that the statement
 * PARSES and PLANS, and an empty result proves that as well as a populated one
 * while needing no fixtures.
 *
 * Separate from `pnpm test` because it needs the local stack up. Run with
 * `pnpm test:db`.
 */
describe("every loader is valid SQL", () => {
  it("meetings", async () => {
    await getUpcomingMeetings();
    await getPastMeetings();
    await getMeetingBySlug("nope");
    await getWorkshopDetail("nope", "nope");
    await getCompetitionBySlug("nope");
    await getMeetingWorkshops(NIL);
    expect(true).toBe(true);
  });

  it("the calendar's range query, on an empty window and a populated one", async () => {
    // Two calls, because the loader has two code paths and only one reaches
    // the child statements. A window with no meetings returns before the
    // workshop and judging queries run, so a far-future range on its own would
    // never prove those parse. The judging join is the riskiest expression in
    // the file: it joins ON two timestamp comparisons rather than on a key.
    const far = new Date("2999-01-01T00:00:00Z");
    await getMeetingsInRange(far, new Date("2999-04-01T00:00:00Z"));

    // Three months either side of now, the shape the page asks for and the one
    // that will have rows in a seeded database.
    const now = new Date();
    const from = new Date(now);
    from.setUTCMonth(from.getUTCMonth() - 3);
    const to = new Date(now);
    to.setUTCMonth(to.getUTCMonth() + 3);
    await getMeetingsInRange(from, to);
    expect(true).toBe(true);
  });
  it("teams", async () => {
    await getTeamsForCompetition("nope");
    await getTeamDetail("nope", "nope", NIL);
    await getPendingForUser(NIL);
    await getMyTeam("nope", NIL);
    expect(true).toBe(true);
  });
  it("stars", async () => {
    await getStarsForUser(NIL);
    await getStarsForWorkshop(NIL);
    expect(true).toBe(true);
  });
  it("points", async () => {
    await getStandings("nope");
    await getMemberPointsLeaderboard();
    await getMemberPoints(NIL);
    expect(true).toBe(true);
  });
  it("the airtable sync state the console renders", async () => {
    // The console page is the only reader, and a page that throws on load is
    // indistinguishable from the sync being broken.
    await readSyncState();
    expect(true).toBe(true);
  });

  it("the stars export, including its filters", async () => {
    // The export is a generator, so nothing runs until it is drained. An
    // untouched `streamStarRows(...)` would prove nothing.
    for await (const _ of streamStarRows({}, 10)) break;
    for await (const _ of streamStarRows(
      { from: new Date("2020-01-01"), to: new Date(), projectSlug: "nope" },
      10,
    ))
      break;
    expect(true).toBe(true);
  });

  it("elections", async () => {
    await getOpenElections();
    await getElectionBySlug("nope");
    await getBallotOptions(NIL);
    await getMyBallot(NIL, NIL);
    await getElectionResults(NIL);
    await getTiebreakDisclosures(NIL);
    await getPointsElections(NIL);
    expect(true).toBe(true);
  });
});

const COUNTS = {
  meeting: "11111111-2222-4000-8000-000000000001",
  project: "11111111-2222-4000-8000-000000000002",
  project2: "11111111-2222-4000-8000-000000000003",
  workshop: "11111111-2222-4000-8000-000000000004",
  workshop2: "11111111-2222-4000-8000-000000000005",
} as const;

async function cleanupCounts() {
  await db.execute(
    sql`delete from platform.meetings where slug = 'counts-test-meeting'`,
  );
  await db.execute(
    sql`delete from platform.projects where slug like 'counts-test-%'`,
  );
}

/**
 * The one place in this file that asserts a VALUE, and it earns the exception.
 *
 * Everything above proves a statement parses and plans, which is the failure
 * mode Drizzle expressions usually have. This covers the one that slipped past
 * exactly that net: a correlated subquery whose column references rendered
 * unqualified, so `where "meetingId" = "id"` resolved both sides against the
 * INNER table and compared `workshops.meetingId` to `workshops.id`. Perfectly
 * valid SQL. Postgres plans it happily. It returns zero for every row, forever.
 *
 * It shipped unnoticed because `attendanceCount` and `workshopCount` had no
 * consumer until the events page was rebuilt on them, and zero is what a
 * brand-new meeting should report, so the bug and the correct answer are
 * indistinguishable until something has more than none.
 *
 * That is why this needs fixtures: the only assertion that can catch it is a
 * non-zero one.
 */
describe("correlated counts on a meeting", () => {
  beforeAll(async () => {
    await cleanupCounts();
    await db.execute(sql`
      insert into platform.projects (id, slug, "displayName")
      values (${COUNTS.project}::uuid, 'counts-test-a', 'Counts Test A'),
             (${COUNTS.project2}::uuid, 'counts-test-b', 'Counts Test B')`);
    await db.execute(sql`
      insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
      values (${COUNTS.meeting}::uuid, 'counts-test-meeting', 'Counts Test',
              now() + interval '1 day', now() + interval '1 day 2 hours')`);
    await db.execute(sql`
      insert into platform.workshops (id, "meetingId", "projectId")
      values (${COUNTS.workshop}::uuid, ${COUNTS.meeting}::uuid, ${COUNTS.project}::uuid),
             (${COUNTS.workshop2}::uuid, ${COUNTS.meeting}::uuid, ${COUNTS.project2}::uuid)`);
  });

  afterAll(cleanupCounts);

  it("counts the workshops that belong to it, not zero", async () => {
    const meeting = await getMeetingBySlug("counts-test-meeting");
    expect(meeting).not.toBeNull();
    expect(meeting!.workshopCount).toBe(2);
    // No attendance rows were inserted, so zero here is the honest answer.
    // Asserted anyway, because the broken form returned zero for BOTH and a
    // future regression could break only one.
    expect(meeting!.attendanceCount).toBe(0);
  });

  it("counts them the same way through the range query", async () => {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 7 * 86_400_000);
    const rows = await getMeetingsInRange(from, to);
    const mine = rows.find((r) => r.slug === "counts-test-meeting");
    expect(mine).toBeDefined();
    // The scalar subquery and the separately-fetched array are two routes to
    // the same fact and must agree. A mismatch means one of them is filtering
    // differently from the other.
    expect(mine!.workshopCount).toBe(2);
    expect(mine!.workshops).toHaveLength(2);
  });
});
