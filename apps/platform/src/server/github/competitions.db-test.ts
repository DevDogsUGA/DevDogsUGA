// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "~/env";
import type { CompetitionsGithubClient, ProjectIdentity } from "./competitions";
import type { ProjectFieldConfig } from "./competitionParsing";
import type { RawProjectItemFields } from "./queries";

/**
 * `ingestCompetitionItem` and `reconcileCompetitions` against a real
 * database, with a FAKE GitHub client rather than a mock of this module --
 * the point under test is what each writes given a GitHub state it did not
 * produce itself, the same reasoning `reconcileTeams.db-test.ts` gives for
 * teams.
 *
 * `~/env` is mocked (spreading the real module and overriding three keys)
 * so `GH_COMPETITIONS_PROJECT_ID` reads as configured here regardless of
 * what this checkout's own `.env` happens to leave it as, and so
 * `GITHUB_ORG`/`GITHUB_COMPETITION_REPO` are fixed values this file's own
 * fixtures can target rather than whatever a real deployment's `.env`
 * names. `../alerts`'s `postAlert` is mocked too, so drift assertions do not
 * depend on Sentry being configured.
 */

const PROJECT_ID = "PVT_competitions_db_test";
const REPO = "DevDogsUGA/DevDogsUGA";

vi.mock("~/env", async () => {
  const actual = await vi.importActual<typeof EnvModule>("~/env");
  return {
    ...actual,
    env: {
      ...actual.env,
      GH_COMPETITIONS_PROJECT_ID: PROJECT_ID,
      GITHUB_ORG: "DevDogsUGA",
      GITHUB_COMPETITION_REPO: "DevDogsUGA",
    },
  };
});

const alerts = vi.hoisted(() => ({
  postAlert: vi.fn(
    (_title: string, _lines: string[], _footer?: string): Promise<void> =>
      Promise.resolve(),
  ),
}));
vi.mock("../alerts", () => alerts);

const { ingestCompetitionItem, reconcileCompetitions } =
  await import("./competitions");
const { db } = await import("~/server/db");
const { competitions } = await import("~/server/db/schema");

const GOOD_FIELDS: ProjectFieldConfig = {
  titleField: { __typename: "ProjectV2Field", name: "Title", dataType: "TEXT" },
  plannedEndDateField: {
    __typename: "ProjectV2Field",
    name: "Judging/End Date",
    dataType: "DATE",
  },
};

const GOOD_PROJECT: ProjectIdentity = { id: PROJECT_ID, ...GOOD_FIELDS };

function issue(
  id: string,
  number: number,
  overrides: Partial<RawProjectItemFields> = {},
): RawProjectItemFields {
  return {
    titleValue: null,
    plannedEndDateValue: null,
    content: {
      __typename: "Issue",
      id,
      number,
      title: `Test Competition ${number}`,
      body: "Brief.",
      url: `https://github.com/${REPO}/issues/${number}`,
      createdAt: "2026-09-20T18:00:00Z",
      closedAt: null,
      repository: { nameWithOwner: REPO },
    },
    ...overrides,
  };
}

// Standalone functions, not a throwaway object's methods torn off it -- the
// latter (`someObject().projectItem`, detached from the object literal that
// declared it) is exactly the "unbound method" shape this codebase's lint
// config refuses, since a real implementation could close over `this`.
// Every fixture below that only exercises one of `CompetitionsGithubClient`'s
// two methods passes one of these two for the other.
const unreachableProjectItem: CompetitionsGithubClient["projectItem"] = () => {
  throw new Error("should not fetch a single item");
};
const unreachableProjectItems: CompetitionsGithubClient["projectItems"] =
  () => {
    throw new Error("should not page the Project");
  };

async function cleanup() {
  await db.execute(
    sql`delete from platform.competitions where "issueNodeId" like 'I_dbtest%'`,
  );
}

beforeEach(cleanup);
afterAll(cleanup);

async function rowFor(issueNodeId: string) {
  const [row] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.issueNodeId, issueNodeId));
  return row ?? null;
}

describe("ingestCompetitionItem", () => {
  it("upserts a converted issue into the mirror", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: GOOD_PROJECT,
          item: issue("I_dbtest_upsert", 101),
        }),
      projectItems: unreachableProjectItems,
    };

    const report = await ingestCompetitionItem("PVTI_1", db, client);
    expect(report).toEqual({ upserted: 1, skipped: 0, drift: [] });

    const row = await rowFor("I_dbtest_upsert");
    expect(row).not.toBeNull();
    expect(row?.title).toBe("Test Competition 101");
    expect(row?.slug).toBe("test-competition-101-101");
    expect(row?.closedAt).toBeNull();
  });

  it("is idempotent: re-ingesting the same item updates rather than duplicates", async () => {
    const firstFetch = () =>
      Promise.resolve({
        project: GOOD_PROJECT,
        item: issue("I_dbtest_idempotent", 102),
      });
    await ingestCompetitionItem("PVTI_2", db, {
      projectItem: firstFetch,
      projectItems: unreachableProjectItems,
    });

    // Re-ingested with a changed brief and a closed issue -- the second
    // delivery an `edited` or `closed` webhook would carry.
    const secondFetch = () =>
      Promise.resolve({
        project: GOOD_PROJECT,
        item: issue("I_dbtest_idempotent", 102, {
          content: {
            ...issue("I_dbtest_idempotent", 102).content!,
            body: "Updated brief.",
            closedAt: "2026-09-28T00:00:00Z",
          },
        }),
      });
    const report = await ingestCompetitionItem("PVTI_2", db, {
      projectItem: secondFetch,
      projectItems: unreachableProjectItems,
    });
    expect(report).toEqual({ upserted: 1, skipped: 0, drift: [] });

    const rows = await db
      .select()
      .from(competitions)
      .where(eq(competitions.issueNodeId, "I_dbtest_idempotent"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.brief).toBe("Updated brief.");
    expect(rows[0]?.closedAt).toEqual(new Date("2026-09-28T00:00:00Z"));
  });

  it("keeps the slug stable across a title change", async () => {
    const item = issue("I_dbtest_slug", 103, {
      titleValue: { text: "Original Title" },
    });
    await ingestCompetitionItem("PVTI_3", db, {
      projectItem: () => Promise.resolve({ project: GOOD_PROJECT, item }),
      projectItems: unreachableProjectItems,
    });
    const first = await rowFor("I_dbtest_slug");

    await ingestCompetitionItem("PVTI_3", db, {
      projectItem: () =>
        Promise.resolve({
          project: GOOD_PROJECT,
          item: { ...item, titleValue: { text: "Renamed Title" } },
        }),
      projectItems: unreachableProjectItems,
    });
    const second = await rowFor("I_dbtest_slug");

    expect(second?.title).toBe("Renamed Title");
    expect(second?.slug).toBe(first?.slug);
  });

  it("ignores an item from a different Project (not our membership)", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: { ...GOOD_PROJECT, id: "PVT_some_other_project" },
          item: issue("I_dbtest_wrong_project", 104),
        }),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_4", db, client);
    expect(report).toEqual({ upserted: 0, skipped: 1, drift: [] });
    expect(await rowFor("I_dbtest_wrong_project")).toBeNull();
  });

  it("ignores an item whose node does not resolve to a Project item at all", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: () => Promise.resolve(null),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_stale", db, client);
    expect(report).toEqual({ upserted: 0, skipped: 1, drift: [] });
  });

  it("skips a still-draft item without creating a row", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: GOOD_PROJECT,
          item: { titleValue: null, plannedEndDateValue: null, content: null },
        }),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_5", db, client);
    expect(report).toEqual({ upserted: 0, skipped: 1, drift: [] });
  });

  it("skips an issue from outside the competition repo", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: GOOD_PROJECT,
          item: issue("I_dbtest_wrong_repo", 105, {
            content: {
              ...issue("I_dbtest_wrong_repo", 105).content!,
              repository: { nameWithOwner: "DevDogsUGA/some-other-repo" },
            },
          }),
        }),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_6", db, client);
    expect(report).toEqual({ upserted: 0, skipped: 1, drift: [] });
    expect(await rowFor("I_dbtest_wrong_repo")).toBeNull();
  });

  it("reports drift and skips rather than guessing, on a retyped field", async () => {
    alerts.postAlert.mockClear();
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: {
            ...GOOD_PROJECT,
            titleField: { __typename: "ProjectV2SingleSelectField" },
          },
          item: issue("I_dbtest_drift", 106),
        }),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_7", db, client);
    expect(report.upserted).toBe(0);
    expect(report.drift.length).toBeGreaterThan(0);
    expect(await rowFor("I_dbtest_drift")).toBeNull();
    expect(alerts.postAlert).toHaveBeenCalledOnce();
    expect(alerts.postAlert).toHaveBeenCalledWith(
      expect.stringMatching(/no longer matches the expected shape/),
      expect.arrayContaining([expect.stringMatching(/Title/)]),
      expect.any(String),
    );
  });

  it("skips and alerts, rather than throwing, on a title over the column's length cap", async () => {
    // A real GitHub issue title (up to 256 characters) or Project "Title"
    // field value can exceed the `competitions_title_length` check
    // constraint's 160-character cap -- nothing upstream of that constraint
    // enforces one. This has to be caught before the write, not surfaced as
    // an unhandled webhook 500 GitHub would just retry forever.
    alerts.postAlert.mockClear();
    const client: CompetitionsGithubClient = {
      projectItem: () =>
        Promise.resolve({
          project: GOOD_PROJECT,
          item: issue("I_dbtest_long_title", 107, {
            titleValue: { text: "T".repeat(200) },
          }),
        }),
      projectItems: unreachableProjectItems,
    };
    const report = await ingestCompetitionItem("PVTI_8", db, client);
    expect(report).toEqual({ upserted: 0, skipped: 1, drift: [] });
    expect(await rowFor("I_dbtest_long_title")).toBeNull();
    expect(alerts.postAlert).toHaveBeenCalledOnce();
    expect(alerts.postAlert).toHaveBeenCalledWith(
      "Competitions ingest failed to apply an item",
      expect.arrayContaining([
        expect.stringMatching(/107.*over the 160-character cap/),
      ]),
      expect.any(String),
    );
  });
});

describe("reconcileCompetitions", () => {
  it("upserts every converted item on the page and skips the rest", async () => {
    const client: CompetitionsGithubClient = {
      projectItem: unreachableProjectItem,
      projectItems: () =>
        Promise.resolve({
          fields: GOOD_FIELDS,
          items: [
            issue("I_dbtest_page_a", 201),
            // Still a draft -- no content.
            { titleValue: null, plannedEndDateValue: null, content: null },
            issue("I_dbtest_page_b", 202, {
              content: {
                ...issue("I_dbtest_page_b", 202).content!,
                repository: { nameWithOwner: "DevDogsUGA/wrong-repo" },
              },
            }),
          ],
        }),
    };
    const report = await reconcileCompetitions(db, client);
    expect(report).toEqual({ upserted: 1, skipped: 2, drift: [] });
    expect(await rowFor("I_dbtest_page_a")).not.toBeNull();
    expect(await rowFor("I_dbtest_page_b")).toBeNull();
  });

  it("reports drift when the configured Project id does not resolve", async () => {
    alerts.postAlert.mockClear();
    const client: CompetitionsGithubClient = {
      projectItem: unreachableProjectItem,
      projectItems: () => Promise.resolve(null),
    };
    const report = await reconcileCompetitions(db, client);
    expect(report.upserted).toBe(0);
    expect(report.drift.length).toBeGreaterThan(0);
    expect(alerts.postAlert).toHaveBeenCalledOnce();
  });

  it("reports drift on the whole page rather than upserting any of it", async () => {
    alerts.postAlert.mockClear();
    const client: CompetitionsGithubClient = {
      projectItem: unreachableProjectItem,
      projectItems: () =>
        Promise.resolve({
          fields: { titleField: null, plannedEndDateField: null },
          items: [issue("I_dbtest_page_drift", 203)],
        }),
    };
    const report = await reconcileCompetitions(db, client);
    expect(report.upserted).toBe(0);
    expect(report.drift.length).toBeGreaterThan(0);
    expect(await rowFor("I_dbtest_page_drift")).toBeNull();
  });

  it("keeps applying later items on the page after one throws", async () => {
    // Regression: applyItem() used to write straight to the database with no
    // containment, so one bad row (here, an over-length title) would abort
    // this `for` loop and silently skip every other competition on the page.
    alerts.postAlert.mockClear();
    const client: CompetitionsGithubClient = {
      projectItem: unreachableProjectItem,
      projectItems: () =>
        Promise.resolve({
          fields: GOOD_FIELDS,
          items: [
            issue("I_dbtest_page_bad_title", 204, {
              titleValue: { text: "T".repeat(200) },
            }),
            issue("I_dbtest_page_after", 205),
          ],
        }),
    };
    const report = await reconcileCompetitions(db, client);
    expect(report).toEqual({ upserted: 1, skipped: 1, drift: [] });
    expect(await rowFor("I_dbtest_page_bad_title")).toBeNull();
    expect(await rowFor("I_dbtest_page_after")).not.toBeNull();
    expect(alerts.postAlert).toHaveBeenCalledOnce();
  });
});
