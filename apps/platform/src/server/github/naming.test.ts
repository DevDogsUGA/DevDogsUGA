import { describe, expect, it } from "vitest";
import {
  githubTeamSlug,
  normalizeRef,
  platformSlugFromGithubTeamSlug,
  teamBranch,
  teamSlugFromBranch,
} from "./naming";

/**
 * The naming rules. They fail silently: a mismatched branch name means a
 * team's push grant and its branch stop agreeing with each other, invisible
 * until somebody cannot push.
 */

describe("team branch", () => {
  it("derives the branch from the team slug, off main", () => {
    expect(teamBranch("study-group-finder")).toBe("team/study-group-finder");
  });
});

describe("github team slug", () => {
  it("survives GitHub's own slugification unchanged", () => {
    const slug = githubTeamSlug("study-group-finder");
    expect(slug).toBe("team-study-group-finder");
    // What GitHub does to a team name. If this were not already a fixed point,
    // the API would have to be asked what slug it chose before anything could
    // address the team.
    expect(slug.toLowerCase().replace(/[^a-z0-9]+/g, "-")).toBe(slug);
  });
});

describe("normalizeRef", () => {
  it("normalizes refs/heads/ off either form", () => {
    expect(normalizeRef("refs/heads/main")).toBe("main");
    expect(normalizeRef("main")).toBe("main");
  });
});

describe("teamSlugFromBranch", () => {
  it("is the exact inverse of teamBranch", () => {
    expect(teamSlugFromBranch(teamBranch("sicem"))).toBe("sicem");
  });

  it("normalizes refs/heads/ the same as normalizeRef", () => {
    expect(teamSlugFromBranch("refs/heads/team/sicem")).toBe("sicem");
  });

  it("is null for a branch that is not a team branch", () => {
    expect(teamSlugFromBranch("main")).toBeNull();
    expect(teamSlugFromBranch("production")).toBeNull();
  });
});

describe("platformSlugFromGithubTeamSlug", () => {
  it("is the exact inverse of githubTeamSlug for a slug already in slug form", () => {
    expect(platformSlugFromGithubTeamSlug(githubTeamSlug("sicem"))).toBe(
      "sicem",
    );
  });

  it("strips only the leading team- literal, even from a slug that itself starts with it", () => {
    expect(platformSlugFromGithubTeamSlug(githubTeamSlug("team-awesome"))).toBe(
      "team-awesome",
    );
  });

  it("is null for a GitHub team slug this platform never made", () => {
    expect(platformSlugFromGithubTeamSlug("some-other-team")).toBeNull();
  });
});
