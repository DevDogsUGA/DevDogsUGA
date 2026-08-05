// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getUpcomingMeetings,
  getPastMeetings,
  getMeetingBySlug,
  getWorkshopDetail,
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
} from "./elections";

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
  it("elections", async () => {
    await getOpenElections();
    await getElectionBySlug("nope");
    await getBallotOptions(NIL);
    await getMyBallot(NIL, NIL);
    await getElectionResults(NIL);
    await getTiebreakDisclosures(NIL);
    expect(true).toBe(true);
  });
});
