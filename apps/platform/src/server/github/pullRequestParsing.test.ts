import { describe, expect, it } from "vitest";
import { referencedIssueNumbers, teamSlugForHead } from "./pullRequestParsing";

/**
 * `teamSlugForHead` and `referencedIssueNumbers`, pure -- no database, no
 * network, no `env`. Everything past recognition -- resolving a team slug
 * and referenced issue numbers to real rows, the upsert, idempotency,
 * `mergedAt`/`closedAt` from a PR's current state -- needs a real database
 * and lives in `pullRequest.db-test.ts` instead, the same split
 * `competitionParsing.ts`/`competitions.ts` draws.
 */

const REPO = "DevDogsUGA/DevDogsUGA";

describe("teamSlugForHead", () => {
  it("resolves a team branch targeting main", () => {
    expect(teamSlugForHead("team/sicem", "main")).toBe("sicem");
  });

  it("is null when the base is not main", () => {
    expect(teamSlugForHead("team/sicem", "production")).toBeNull();
  });

  it("is null when the head is not a team branch", () => {
    expect(teamSlugForHead("fix-typo", "main")).toBeNull();
  });

  it("normalizes refs/heads/ off either ref", () => {
    expect(teamSlugForHead("refs/heads/team/sicem", "refs/heads/main")).toBe(
      "sicem",
    );
  });
});

describe("referencedIssueNumbers", () => {
  it("matches a bare #123 as the competition repo", () => {
    expect(referencedIssueNumbers("Closes #42", REPO)).toEqual([42]);
  });

  it("matches a full issue URL in the competition repo", () => {
    expect(
      referencedIssueNumbers(
        `See https://github.com/${REPO}/issues/7 for the brief.`,
        REPO,
      ),
    ).toEqual([7]);
  });

  it("matches the owner/repo#123 shorthand", () => {
    expect(referencedIssueNumbers(`Closes ${REPO}#9`, REPO)).toEqual([9]);
  });

  it("ignores a reference to a different repo", () => {
    expect(
      referencedIssueNumbers("Closes DevDogsUGA/some-other-repo#9", REPO),
    ).toEqual([]);
  });

  it("ignores a full issue URL for a different repo", () => {
    expect(
      referencedIssueNumbers(
        "See https://github.com/DevDogsUGA/some-other-repo/issues/9",
        REPO,
      ),
    ).toEqual([]);
  });

  it("does not double-count an owner/repo#123 reference as a bare one too", () => {
    expect(referencedIssueNumbers(`Closes ${REPO}#9`, REPO)).toEqual([9]);
  });

  it("does not double-count a URL as a bare reference too", () => {
    expect(
      referencedIssueNumbers(`https://github.com/${REPO}/issues/9`, REPO),
    ).toEqual([9]);
  });

  it("dedupes a number referenced more than once, keeping first-seen order", () => {
    expect(
      referencedIssueNumbers("Closes #9. Also #9. Then #3.", REPO),
    ).toEqual([9, 3]);
  });

  it("returns an empty list for a PR that links nothing", () => {
    expect(referencedIssueNumbers("Bumps a dependency.", REPO)).toEqual([]);
  });

  it("reads both title and body when the caller joins them", () => {
    const text = ["Add the feature", "Closes #5"].join("\n");
    expect(referencedIssueNumbers(text, REPO)).toEqual([5]);
  });
});
