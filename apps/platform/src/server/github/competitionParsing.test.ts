import { describe, expect, it } from "vitest";
import {
  checkProjectShape,
  parseProjectItem,
  slugForCompetition,
  type ProjectFieldConfig,
} from "./competitionParsing";
import type { RawFieldConfig, RawProjectItemFields } from "./queries";

/**
 * `checkProjectShape` and `parseProjectItem`, pure -- no database, no
 * network, no `env`. Fixtures below are shaped exactly like the two GraphQL
 * queries' responses (`CompetitionProjectItem.gql` /
 * `CompetitionsProjectItems.gql`), narrowed to the one item shape
 * `RawProjectItemFields` both resolve to, so these fixtures double as
 * documentation of what a real Project item looks like on the wire.
 *
 * Everything past parsing -- the GitHub read seam, the upsert, idempotency,
 * drift reporting against a real `CompetitionsGithubClient` -- needs a real
 * database (and `~/env` fully configured) and lives in
 * `competitions.db-test.ts` instead.
 */

const TEXT_FIELD: RawFieldConfig = {
  __typename: "ProjectV2Field",
  name: "Title",
  dataType: "TEXT",
};
const DATE_FIELD: RawFieldConfig = {
  __typename: "ProjectV2Field",
  name: "Judging/End Date",
  dataType: "DATE",
};
const GOOD_FIELDS: ProjectFieldConfig = {
  titleField: TEXT_FIELD,
  plannedEndDateField: DATE_FIELD,
};

describe("checkProjectShape", () => {
  it("passes a Project whose fields match by name and type", () => {
    expect(checkProjectShape(GOOD_FIELDS)).toEqual([]);
  });

  it("reports a missing title field", () => {
    const findings = checkProjectShape({
      ...GOOD_FIELDS,
      titleField: null,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/"Title".*missing/);
  });

  it("reports a title field retyped to a single-select", () => {
    const findings = checkProjectShape({
      ...GOOD_FIELDS,
      titleField: {
        __typename: "ProjectV2SingleSelectField",
        name: "Title",
      },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/"Title".*not a text field/);
  });

  it("reports a missing planned end date field", () => {
    const findings = checkProjectShape({
      ...GOOD_FIELDS,
      plannedEndDateField: null,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/"Judging\/End Date".*missing/);
  });

  it("reports a planned end date field retyped to text", () => {
    const findings = checkProjectShape({
      ...GOOD_FIELDS,
      plannedEndDateField: { ...DATE_FIELD, dataType: "TEXT" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/"Judging\/End Date".*not a date field/);
  });

  it("reports both fields at once, never just the first", () => {
    expect(
      checkProjectShape({ titleField: null, plannedEndDateField: null }),
    ).toHaveLength(2);
  });
});

const REPO = "DevDogsUGA/DevDogsUGA";

function issueItem(
  overrides: Partial<RawProjectItemFields["content"]> = {},
): RawProjectItemFields {
  return {
    titleValue: { text: "  Recreate Pong  " },
    plannedEndDateValue: { date: "2026-10-05" },
    content: {
      __typename: "Issue",
      id: "I_kwDOissue1",
      number: 42,
      title: "Recreate Pong (issue title)",
      body: "Build the classic in your framework of choice.",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/issues/42",
      createdAt: "2026-09-20T18:05:00Z",
      closedAt: null,
      repository: { nameWithOwner: REPO },
      ...overrides,
    },
  };
}

describe("parseProjectItem", () => {
  it("parses a converted, correctly-repo'd issue into a competition", () => {
    const outcome = parseProjectItem(issueItem(), REPO);
    expect(outcome.kind).toBe("competition");
    if (outcome.kind !== "competition") return;
    expect(outcome.competition).toEqual({
      issueNodeId: "I_kwDOissue1",
      issueNumber: 42,
      repo: REPO,
      url: "https://github.com/DevDogsUGA/DevDogsUGA/issues/42",
      // The Project's Title field, trimmed -- not the issue's own title.
      title: "Recreate Pong",
      brief: "Build the classic in your framework of choice.",
      plannedEndAt: new Date("2026-10-05T00:00:00Z"),
      kickedOffAt: new Date("2026-09-20T18:05:00Z"),
      closedAt: null,
    });
  });

  it("falls back to the issue's own title when the Title field is unset", () => {
    const outcome = parseProjectItem(
      { ...issueItem(), titleValue: null },
      REPO,
    );
    expect(outcome.kind).toBe("competition");
    if (outcome.kind !== "competition") return;
    expect(outcome.competition.title).toBe("Recreate Pong (issue title)");
  });

  it("falls back to the issue's own title when the Title field is blank", () => {
    const outcome = parseProjectItem(
      { ...issueItem(), titleValue: { text: "   " } },
      REPO,
    );
    expect(outcome.kind).toBe("competition");
    if (outcome.kind !== "competition") return;
    expect(outcome.competition.title).toBe("Recreate Pong (issue title)");
  });

  it("leaves plannedEndAt null when the date field is unset", () => {
    const outcome = parseProjectItem(
      { ...issueItem(), plannedEndDateValue: null },
      REPO,
    );
    expect(outcome.kind).toBe("competition");
    if (outcome.kind !== "competition") return;
    expect(outcome.competition.plannedEndAt).toBeNull();
  });

  it("carries closedAt through when the issue has already closed", () => {
    const outcome = parseProjectItem(
      issueItem({ closedAt: "2026-09-27T23:00:00Z" }),
      REPO,
    );
    expect(outcome.kind).toBe("competition");
    if (outcome.kind !== "competition") return;
    expect(outcome.competition.closedAt).toEqual(
      new Date("2026-09-27T23:00:00Z"),
    );
  });

  it("is not_converted for a draft item with no content", () => {
    expect(parseProjectItem({ ...issueItem(), content: null }, REPO).kind).toBe(
      "not_converted",
    );
  });

  it("is not_converted for an item whose content is a pull request", () => {
    const item = issueItem();
    expect(
      parseProjectItem(
        { ...item, content: { ...item.content!, __typename: "PullRequest" } },
        REPO,
      ).kind,
    ).toBe("not_converted");
  });

  it("is wrong_repo for a converted issue outside the competition repo", () => {
    expect(
      parseProjectItem(
        issueItem({ repository: { nameWithOwner: "DevDogsUGA/other-repo" } }),
        REPO,
      ).kind,
    ).toBe("wrong_repo");
  });
});

describe("slugForCompetition", () => {
  it("lowercases, hyphenates, and appends the issue number", () => {
    expect(slugForCompetition("Recreate Pong", 42)).toBe("recreate-pong-42");
  });

  it("falls back to a bare 'competition' for a title with no letters or digits", () => {
    expect(slugForCompetition("!!!", 7)).toBe("competition-7");
  });

  it("caps the title portion at 60 characters", () => {
    const long = "x".repeat(100);
    const slug = slugForCompetition(long, 3);
    expect(slug).toBe(`${"x".repeat(60)}-3`);
  });
});
