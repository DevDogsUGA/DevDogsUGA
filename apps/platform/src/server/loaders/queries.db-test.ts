// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getUpcomingMeetings,
  getPastMeetings,
  getMeetingBySlug,
  getWorkshopDetail,
  getCompetitionBySlug,
  getMeetingWorkshops,
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
 * Not an assertion suite — the expectations are trivial on purpose. What this
 * catches is the class of bug typechecking cannot: a Drizzle expression that
 * compiles and generates invalid SQL. That has already happened once in this
 * codebase (a tuple `notInArray` rendered a subquery with too few columns and
 * would have thrown on the first cron run), and a loader has no cron to fail
 * loudly in — it fails on the page, for a member.
 *
 * Nil UUIDs and nonexistent slugs throughout: the point is that the statement
 * PARSES and PLANS, and an empty result proves that just as well as a
 * populated one while needing no fixtures.
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
    // The export is a generator, so nothing runs until it is drained — an
    // untouched `streamStarRows(...)` would prove nothing at all.
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
