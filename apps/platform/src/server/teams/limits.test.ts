import { describe, expect, it } from "vitest";
import {
  MAX_CONCURRENT_TEAMS_PER_USER,
  MAX_TEAM_SIZE,
  hasRoomOnTeam,
  underConcurrentTeamCap,
} from "./limits";

/**
 * The boundary conditions on both caps, unit-tested independently of the
 * database counts that feed them in `requireCanJoin`. The interesting case for
 * each is exactly at the cap -- a `>` where a `>=` belongs lets one too many
 * through and nothing short of a fifth member or a third team would surface
 * it.
 */

describe("hasRoomOnTeam", () => {
  it("has room below the cap", () => {
    expect(hasRoomOnTeam(MAX_TEAM_SIZE - 1)).toBe(true);
  });

  it("has no room exactly at the cap", () => {
    expect(hasRoomOnTeam(MAX_TEAM_SIZE)).toBe(false);
  });

  it("has no room over the cap", () => {
    expect(hasRoomOnTeam(MAX_TEAM_SIZE + 1)).toBe(false);
  });
});

describe("underConcurrentTeamCap", () => {
  it("is under the cap below it", () => {
    expect(underConcurrentTeamCap(MAX_CONCURRENT_TEAMS_PER_USER - 1)).toBe(
      true,
    );
  });

  it("is not under the cap exactly at it", () => {
    expect(underConcurrentTeamCap(MAX_CONCURRENT_TEAMS_PER_USER)).toBe(false);
  });

  it("is not under the cap over it", () => {
    expect(underConcurrentTeamCap(MAX_CONCURRENT_TEAMS_PER_USER + 1)).toBe(
      false,
    );
  });
});
