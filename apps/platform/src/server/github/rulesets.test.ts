import { describe, expect, it } from "vitest";
import { teamRulesetName, teamRulesetPayload } from "./rulesets";

/**
 * The ruleset shape, untestable anywhere else.
 *
 * Every property asserted here is invisible at runtime: GitHub returns 201 for
 * a ruleset that protects the wrong ref, carries the wrong bypass actor, or
 * enforces nothing at all. The failure shows up as a team pushing to another
 * team's branch, which nothing reports and nobody looks for.
 */

const TEAM_ID = 4815162;

describe("per-team ruleset", () => {
  it("restricts exactly the team's own branch", () => {
    const payload = teamRulesetPayload("sicem", TEAM_ID);

    expect(payload.conditions.ref_name.include).toEqual([
      "refs/heads/team/sicem",
    ]);
    expect(payload.enforcement).toBe("active");
    expect(payload.target).toBe("branch");
  });

  it("names the team as the only actor allowed past it", () => {
    const payload = teamRulesetPayload("sicem", TEAM_ID);

    expect(payload.bypass_actors).toEqual([
      { actor_id: TEAM_ID, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("restricts updates, which is the rule the isolation rests on", () => {
    // Without `update` the ruleset enforces nothing that matters: the team grant
    // is repository-wide, so every other team can already push here.
    const types = teamRulesetPayload("sicem", TEAM_ID).rules.map((r) => r.type);
    expect(types).toContain("update");
    expect(types).toContain("deletion");
  });

  it("carries no rule the team would only bypass, or that blocks re-provisioning", () => {
    // `creation` would be inert (the branch is cut first) and would break the
    // recovery path. `non_fast_forward` and `pull_request` have no shared
    // integration branch to belong to any more.
    const types = teamRulesetPayload("sicem", TEAM_ID).rules.map((r) => r.type);
    expect(types).not.toContain("creation");
    expect(types).not.toContain("non_fast_forward");
    expect(types).not.toContain("pull_request");
  });

  it("uses an exact ref, so one team's ruleset cannot govern another's branch", () => {
    // The regression this exists for: `team/sicem` is a prefix of
    // `team/sicem-2`. Under a glob, sicem's ruleset would match sicem-2's
    // branch AND name sicem as its bypass actor, handing one team push access
    // to another's work, with both rulesets reading correctly in isolation.
    const include = teamRulesetPayload("sicem", TEAM_ID).conditions.ref_name
      .include;

    expect(include).toHaveLength(1);
    expect(include[0]).not.toContain("*");
    expect(include[0]).not.toBe("refs/heads/team/sicem-2");
  });

  it("is named so it can be found again without storing an id", () => {
    // Rulesets are addressed by numeric id, which nothing persists, and
    // createRepoRuleset does not reject a duplicate name. A name that cannot be
    // recomputed makes re-provisioning create a second ruleset over one branch.
    expect(teamRulesetName("sicem")).toBe("team/sicem");
    expect(teamRulesetPayload("sicem", TEAM_ID).name).toBe(
      teamRulesetName("sicem"),
    );
  });
});
