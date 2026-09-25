// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "~/env";
import type { PullRequestFields } from "./pullRequest";

/**
 * `applyPullRequest` and `reconcileEntries` against a real database.
 *
 * `~/env` is mocked the same way `competitions.db-test.ts` mocks it, so
 * `GITHUB_ORG`/`GITHUB_COMPETITION_REPO` are fixed values this file's own
 * fixtures can target. `../alerts`' `postAlert` is mocked so
 * `reconcileEntries`'s anomaly reporting does not depend on Sentry being
 * configured.
 */

const REPO = "DevDogsUGA/DevDogsUGA";

vi.mock("~/env", async () => {
  const actual = await vi.importActual<typeof EnvModule>("~/env");
  return {
    ...actual,
    env: {
      ...actual.env,
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

const { applyPullRequest, reconcileEntries } = await import("./pullRequest");
const { db } = await import("~/server/db");
const { competitionEntries } = await import("~/server/db/schema");

const IDS = {
  team: "d1000000-0000-4000-a000-000000000001",
  otherTeam: "d1000000-0000-4000-a000-000000000002",
  creator: "d1000000-0000-4000-a000-000000000099",
  openCompetition: "d2000000-0000-4000-a000-000000000001",
  closedCompetition: "d2000000-0000-4000-a000-000000000002",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform."competitionEntries" where "prNodeId" like 'PR_dbtest%'`,
  );
  await db.execute(
    sql`delete from platform.competitions where id in (${IDS.openCompetition}::uuid, ${IDS.closedCompetition}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.teams where id in (${IDS.team}::uuid, ${IDS.otherTeam}::uuid)`,
  );
}

beforeEach(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values
      (${IDS.team}::uuid, 'pr-db-test-team', 'PR DB Test Team', 'ABC234', ${IDS.creator}::uuid),
      (${IDS.otherTeam}::uuid, 'pr-db-test-other', 'PR DB Test Other', 'DEF234', ${IDS.creator}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt", "closedAt")
    values
      (${IDS.openCompetition}::uuid, 'pr-db-test-open', 'I_dbtest_pr_open', 101,
       ${REPO}, ${`https://github.com/${REPO}/issues/101`}, 'Open Competition',
       now() - interval '10 days', null),
      (${IDS.closedCompetition}::uuid, 'pr-db-test-closed', 'I_dbtest_pr_closed', 102,
       ${REPO}, ${`https://github.com/${REPO}/issues/102`}, 'Closed Competition',
       now() - interval '20 days', now() - interval '2 days')
  `);
});
afterAll(cleanup);

function pr(overrides: Partial<PullRequestFields> = {}): PullRequestFields {
  return {
    nodeId: "PR_dbtest_1",
    number: 1,
    url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/1",
    title: "Enter the competition",
    body: "Closes #101",
    headRef: "team/pr-db-test-team",
    baseRef: "main",
    createdAt: "2026-09-20T12:00:00Z",
    mergedAt: null,
    closedAt: null,
    ...overrides,
  };
}

async function entryFor(prNodeId: string) {
  const [row] = await db
    .select()
    .from(competitionEntries)
    .where(eq(competitionEntries.prNodeId, prNodeId));
  return row ?? null;
}

describe("applyPullRequest", () => {
  it("creates an entry for a team branch that links a mirrored open competition", async () => {
    await applyPullRequest(db, pr());
    const row = await entryFor("PR_dbtest_1");
    expect(row?.teamId).toBe(IDS.team);
    expect(row?.competitionId).toBe(IDS.openCompetition);
    expect(row?.mergedAt).toBeNull();
    expect(row?.closedAt).toBeNull();
  });

  it("is idempotent: applying the same state twice is a no-op the second time", async () => {
    await applyPullRequest(db, pr());
    await applyPullRequest(db, pr());
    const rows = await db
      .select()
      .from(competitionEntries)
      .where(eq(competitionEntries.prNodeId, "PR_dbtest_1"));
    expect(rows).toHaveLength(1);
  });

  it("sets mergedAt and clears closedAt on a merged PR", async () => {
    await applyPullRequest(db, pr());
    await applyPullRequest(
      db,
      pr({
        mergedAt: "2026-09-22T12:00:00Z",
        closedAt: "2026-09-22T12:00:00Z",
      }),
    );
    const row = await entryFor("PR_dbtest_1");
    expect(row?.mergedAt).toEqual(new Date("2026-09-22T12:00:00Z"));
    expect(row?.closedAt).toBeNull();
  });

  it("sets closedAt, not mergedAt, on a PR closed without merging", async () => {
    await applyPullRequest(db, pr());
    await applyPullRequest(
      db,
      pr({ mergedAt: null, closedAt: "2026-09-22T12:00:00Z" }),
    );
    const row = await entryFor("PR_dbtest_1");
    expect(row?.mergedAt).toBeNull();
    expect(row?.closedAt).toEqual(new Date("2026-09-22T12:00:00Z"));
  });

  it("does not create an entry for a head that is not a team branch", async () => {
    await applyPullRequest(db, pr({ headRef: "fix-typo" }));
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("does not create an entry whose base is not main", async () => {
    await applyPullRequest(db, pr({ baseRef: "production" }));
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("does not create an entry for a team this platform does not mirror", async () => {
    await applyPullRequest(db, pr({ headRef: "team/not-a-real-team" }));
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("does not create an entry that links nothing", async () => {
    await applyPullRequest(db, pr({ title: "Bump a dependency", body: null }));
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("does not create an entry opened after the competition already closed", async () => {
    await applyPullRequest(
      db,
      pr({
        body: "Closes #102",
        // After closedCompetition's closedAt (`now() - 2 days`); relative,
        // because a fixed date stops being "after" once the clock passes it.
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("deletes an unmerged entry when an edit removes the issue link", async () => {
    await applyPullRequest(db, pr());
    expect(await entryFor("PR_dbtest_1")).not.toBeNull();

    await applyPullRequest(db, pr({ title: "Retitled", body: null }));
    expect(await entryFor("PR_dbtest_1")).toBeNull();
  });

  it("keeps a merged entry even if a later edit removes the issue link", async () => {
    await applyPullRequest(db, pr());
    await applyPullRequest(
      db,
      pr({
        mergedAt: "2026-09-21T12:00:00Z",
        closedAt: "2026-09-21T12:00:00Z",
      }),
    );
    await applyPullRequest(db, pr({ title: "Retitled", body: null }));

    const row = await entryFor("PR_dbtest_1");
    expect(row).not.toBeNull();
    expect(row?.mergedAt).not.toBeNull();
  });
});

describe("reconcileEntries", () => {
  it("applies every PR a fake GitHub client reports", async () => {
    const report = await reconcileEntries(db, {
      pullRequestsIntoMain: () =>
        Promise.resolve([
          pr(),
          pr({
            nodeId: "PR_dbtest_2",
            number: 2,
            headRef: "team/pr-db-test-other",
          }),
        ]),
    });
    expect(report.checked).toBe(2);
    expect(report.anomalies).toEqual([]);
    expect(await entryFor("PR_dbtest_1")).not.toBeNull();
    expect(await entryFor("PR_dbtest_2")).not.toBeNull();
  });
});
