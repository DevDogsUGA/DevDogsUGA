import { describe, expect, it } from "vitest";
import {
  archiveRulesetName,
  archiveRulesetPayload,
  teamRulesetName,
  teamRulesetPayload,
} from "./rulesets";

/**
 * The ruleset shapes, untestable anywhere else.
 *
 * Every property asserted here is invisible at runtime: GitHub returns 201 for
 * a ruleset that protects the wrong ref, carries the wrong bypass actor, or
 * enforces nothing at all. The failure shows up as a team pushing to another
 * team's branch, which nothing reports and nobody looks for.
 */

const COMP = "2026-fall/w02/study-group-finder";
const TEAM_ID = 4815162;

describe("per-team ruleset", () => {
  it("restricts exactly the team's own branch", () => {
    const payload = teamRulesetPayload(COMP, "lantern", TEAM_ID);

    expect(payload.conditions.ref_name.include).toEqual([
      "refs/heads/team/2026-fall/w02/study-group-finder/lantern",
    ]);
    expect(payload.enforcement).toBe("active");
    expect(payload.target).toBe("branch");
  });

  it("names the team as the only actor allowed past it", () => {
    const payload = teamRulesetPayload(COMP, "lantern", TEAM_ID);

    expect(payload.bypass_actors).toEqual([
      { actor_id: TEAM_ID, actor_type: "Team", bypass_mode: "always" },
    ]);
  });

  it("restricts updates, which is the rule the isolation rests on", () => {
    // Without `update` the ruleset enforces nothing that matters: the team grant
    // is repository-wide, so every other competition team can already push here.
    const types = teamRulesetPayload(COMP, "lantern", TEAM_ID).rules.map(
      (r) => r.type,
    );
    expect(types).toContain("update");
    expect(types).toContain("deletion");
  });

  it("carries no rule the team would only bypass, or that blocks re-provisioning", () => {
    // `creation` would be inert (the branch is cut first) and would break the
    // recovery path. `non_fast_forward` and `pull_request` aggregate across
    // rulesets, so they belong on the integration branch, not here.
    const types = teamRulesetPayload(COMP, "lantern", TEAM_ID).rules.map(
      (r) => r.type,
    );
    expect(types).not.toContain("creation");
    expect(types).not.toContain("non_fast_forward");
    expect(types).not.toContain("pull_request");
  });

  it("uses an exact ref, so one team's ruleset cannot govern another's branch", () => {
    // The regression this exists for: `team/<comp>/lantern` is a prefix of
    // `team/<comp>/lantern-2`. Under a glob, lantern's ruleset would match
    // lantern-2's branch AND name lantern as its bypass actor, handing one team
    // push access to another's work, with both rulesets reading correctly in
    // isolation.
    const include = teamRulesetPayload(COMP, "lantern", TEAM_ID).conditions
      .ref_name.include;

    expect(include).toHaveLength(1);
    expect(include[0]).not.toContain("*");
    expect(include[0]).not.toBe(
      "refs/heads/team/2026-fall/w02/study-group-finder/lantern-2",
    );
  });

  it("is named so it can be found again without storing an id", () => {
    // Rulesets are addressed by numeric id, which nothing persists, and
    // createRepoRuleset does not reject a duplicate name. A name that cannot be
    // recomputed makes re-provisioning create a second ruleset over one branch.
    expect(teamRulesetName(COMP, "lantern")).toBe(
      "team/2026-fall/w02/study-group-finder/lantern",
    );
    expect(teamRulesetPayload(COMP, "lantern", TEAM_ID).name).toBe(
      teamRulesetName(COMP, "lantern"),
    );
  });
});

describe("archive ruleset", () => {
  it("covers every team branch of the competition", () => {
    expect(archiveRulesetPayload(COMP).conditions.ref_name.include).toEqual([
      "refs/heads/team/2026-fall/w02/study-group-finder/**",
    ]);
  });

  it("has an empty bypass list", () => {
    // The whole point. Deleting a per-team ruleset does not freeze its branch,
    // it opens it: every team holds repository-wide push. A frozen branch is one
    // covered by a ruleset nobody bypasses.
    expect(archiveRulesetPayload(COMP).bypass_actors).toEqual([]);
    expect(archiveRulesetPayload(COMP).enforcement).toBe("active");
  });

  it("does not collide with the per-team names it replaces", () => {
    // Teardown deletes by the `team/<comp>/` name prefix. An archive ruleset
    // named under that prefix would delete itself on the next archive run,
    // reopening every branch it was created to freeze.
    expect(archiveRulesetName(COMP)).not.toMatch(/^team\//);
    expect(archiveRulesetName(COMP).startsWith(teamRulesetName(COMP, ""))).toBe(
      false,
    );
  });
});
