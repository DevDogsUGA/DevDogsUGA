import { describe, expect, it } from "vitest";
import {
  githubTeamSlug,
  integrationBranch,
  isEntryBase,
  isTeamHead,
  normalizeRef,
  teamBranch,
  teamBranchPattern,
} from "./naming";
import { parseTeamBranch, stateFor } from "./prEvent";

/**
 * The naming rules and the PR state mapping, both of which are silent when
 * wrong: a mismatched branch name means the PR never registers as an entry,
 * and a mis-mapped close costs a team its star. Neither produces an error
 * anywhere.
 */

const COMP = "2026-fall/w02/study-group-finder";

describe("branch names", () => {
  it("derives the layout from the competition slug", () => {
    expect(integrationBranch(COMP)).toBe(
      "comp/2026-fall/w02/study-group-finder",
    );
    expect(teamBranch(COMP, "lantern")).toBe(
      "team/2026-fall/w02/study-group-finder/lantern",
    );
    expect(teamBranchPattern(COMP)).toBe(
      "team/2026-fall/w02/study-group-finder/*",
    );
  });

  it("keeps the week segment, so a recurring project does not collide", () => {
    // The whole reason the branch is named from the slug rather than from the
    // project: the same project runs again next week.
    const week2 = integrationBranch("2026-fall/w02/study-group-finder");
    const week3 = integrationBranch("2026-fall/w03/study-group-finder");
    expect(week2).not.toBe(week3);
  });
});

describe("github team slug", () => {
  it("survives GitHub's own slugification unchanged", () => {
    const slug = githubTeamSlug(COMP, "lantern");
    expect(slug).toBe("comp-2026-fall-w02-study-group-finder-lantern");
    // What GitHub does to a team name. If this were not already a fixed point,
    // the API would have to be asked what slug it chose before anything could
    // address the team.
    expect(slug.toLowerCase().replace(/[^a-z0-9]+/g, "-")).toBe(slug);
  });
});

describe("entry matching", () => {
  it("accepts a PR into the competition's integration branch", () => {
    expect(isEntryBase("comp/2026-fall/w02/study-group-finder", COMP)).toBe(
      true,
    );
    expect(
      isEntryBase("refs/heads/comp/2026-fall/w02/study-group-finder", COMP),
    ).toBe(true);
  });

  it("rejects a PR opened against main by mistake", () => {
    // A perfectly valid team/... head with the wrong base. Checking the head
    // alone would accept it and register an entry that was never submitted.
    expect(isEntryBase("main", COMP)).toBe(false);
  });

  it("rejects another week's integration branch", () => {
    expect(isEntryBase("comp/2026-fall/w03/study-group-finder", COMP)).toBe(
      false,
    );
  });

  it("rejects a base that merely shares a prefix", () => {
    // `comp/…/study-group` is a prefix of `comp/…/study-group-finder`, so a
    // startsWith check would let one competition's PR count for another.
    expect(isEntryBase("comp/2026-fall/w02/study-group", COMP)).toBe(false);
  });

  it("matches a team's own head branch and not a sibling's", () => {
    expect(
      isTeamHead(
        "team/2026-fall/w02/study-group-finder/lantern",
        COMP,
        "lantern",
      ),
    ).toBe(true);
    expect(
      isTeamHead(
        "team/2026-fall/w02/study-group-finder/marble",
        COMP,
        "lantern",
      ),
    ).toBe(false);
  });

  it("normalizes refs/heads/ off either form", () => {
    expect(normalizeRef("refs/heads/main")).toBe("main");
    expect(normalizeRef("main")).toBe("main");
  });
});

describe("parseTeamBranch", () => {
  it("splits a competition slug containing slashes from the team slug", () => {
    expect(
      parseTeamBranch("team/2026-fall/w02/study-group-finder/lantern"),
    ).toEqual({
      competitionSlug: "2026-fall/w02/study-group-finder",
      teamSlug: "lantern",
    });
  });

  it("round-trips with teamBranch", () => {
    const parsed = parseTeamBranch(teamBranch(COMP, "marble"));
    expect(parsed).toEqual({ competitionSlug: COMP, teamSlug: "marble" });
  });

  it("ignores branches outside the team namespace", () => {
    expect(parseTeamBranch("main")).toBeNull();
    expect(parseTeamBranch("comp/2026-fall/w02/study-group-finder")).toBeNull();
    expect(parseTeamBranch("team/lantern")).toBeNull();
  });
});

describe("stateFor", () => {
  const base = { number: 1, htmlUrl: "", baseRef: "", headRef: "" };

  it("maps opened and reopened to open", () => {
    expect(stateFor({ ...base, action: "opened", merged: false })).toBe("open");
    expect(stateFor({ ...base, action: "reopened", merged: false })).toBe(
      "open",
    );
  });

  it("distinguishes merged from closed", () => {
    // `pull_request.closed` fires for both. Treating every close alike costs a
    // team its star silently, because closed unlocks the roster and merged
    // does not.
    expect(stateFor({ ...base, action: "closed", merged: true })).toBe(
      "merged",
    );
    expect(stateFor({ ...base, action: "closed", merged: false })).toBe(
      "closed",
    );
  });

  it("ignores actions that do not change whether the PR is an entry", () => {
    for (const action of ["edited", "synchronize", "labeled", "assigned"]) {
      expect(stateFor({ ...base, action, merged: false })).toBeNull();
    }
  });
});
