// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "~/env";

/**
 * `handlePullRequestEvent` against a real database.
 *
 * `applyPullRequest` itself gets the real coverage in
 * `pullRequest.db-test.ts` -- this handler is barely more than a dispatch to
 * it, the same relationship `competitionEvents.db-test.ts` describes between
 * `handleProjectsV2ItemEvent` and `ingestCompetitionItem`. This file's cases
 * are the action filter, and one end-to-end webhook-shaped payload proving
 * the field mapping from GitHub's `pull_request` shape to
 * `PullRequestFields` is right.
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

const { handlePullRequestEvent } = await import("./prEvent");
const { db } = await import("~/server/db");
const { competitionEntries } = await import("~/server/db/schema");

const IDS = {
  team: "d3000000-0000-4000-a000-000000000001",
  creator: "d3000000-0000-4000-a000-000000000099",
  competition: "d4000000-0000-4000-a000-000000000001",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform."competitionEntries" where "prNodeId" like 'PR_dbtest_event%'`,
  );
  await db.execute(
    sql`delete from platform.competitions where id = ${IDS.competition}::uuid`,
  );
  await db.execute(
    sql`delete from platform.teams where id = ${IDS.team}::uuid`,
  );
}

beforeEach(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'event-db-test-team', 'Event DB Test Team', 'ABC234', ${IDS.creator}::uuid)
  `);
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt")
    values (${IDS.competition}::uuid, 'event-db-test-competition', 'I_dbtest_event', 55,
            ${REPO}, ${`https://github.com/${REPO}/issues/55`},
            'Event DB Test Competition', now() - interval '5 days')
  `);
});
afterAll(cleanup);

function payload(overrides: {
  action: string;
  merged_at?: string | null;
  closed_at?: string | null;
}) {
  return {
    action: overrides.action,
    pull_request: {
      node_id: "PR_dbtest_event_1",
      number: 1,
      html_url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/1",
      title: "Enter the competition",
      body: "Closes #55",
      created_at: "2026-09-20T12:00:00Z",
      merged_at: overrides.merged_at ?? null,
      closed_at: overrides.closed_at ?? null,
      head: { ref: "team/event-db-test-team" },
      base: { ref: "main" },
    },
  };
}

async function entryFor(prNodeId: string) {
  const [row] = await db
    .select()
    .from(competitionEntries)
    .where(eq(competitionEntries.prNodeId, prNodeId));
  return row ?? null;
}

describe("handlePullRequestEvent", () => {
  it("creates an entry on 'opened'", async () => {
    await handlePullRequestEvent(db, payload({ action: "opened" }));
    const row = await entryFor("PR_dbtest_event_1");
    expect(row?.teamId).toBe(IDS.team);
    expect(row?.competitionId).toBe(IDS.competition);
  });

  it("updates the entry on 'reopened'", async () => {
    await handlePullRequestEvent(db, payload({ action: "opened" }));
    await handlePullRequestEvent(db, payload({ action: "reopened" }));
    expect(await entryFor("PR_dbtest_event_1")).not.toBeNull();
  });

  it("sets mergedAt on 'closed' when the payload carries merged_at", async () => {
    await handlePullRequestEvent(db, payload({ action: "opened" }));
    await handlePullRequestEvent(
      db,
      payload({
        action: "closed",
        merged_at: "2026-09-22T12:00:00Z",
        closed_at: "2026-09-22T12:00:00Z",
      }),
    );
    const row = await entryFor("PR_dbtest_event_1");
    expect(row?.mergedAt).toEqual(new Date("2026-09-22T12:00:00Z"));
    expect(row?.closedAt).toBeNull();
  });

  it("sets closedAt on 'closed' without a merge", async () => {
    await handlePullRequestEvent(db, payload({ action: "opened" }));
    await handlePullRequestEvent(
      db,
      payload({ action: "closed", closed_at: "2026-09-22T12:00:00Z" }),
    );
    const row = await entryFor("PR_dbtest_event_1");
    expect(row?.mergedAt).toBeNull();
    expect(row?.closedAt).toEqual(new Date("2026-09-22T12:00:00Z"));
  });

  it("deletes the not-yet-merged entry on 'edited' when the link is removed", async () => {
    await handlePullRequestEvent(db, payload({ action: "opened" }));
    await handlePullRequestEvent(db, {
      action: "edited",
      pull_request: {
        ...payload({ action: "edited" }).pull_request,
        body: "No link any more.",
      },
    });
    expect(await entryFor("PR_dbtest_event_1")).toBeNull();
  });

  it("ignores an action this handler does not recognize", async () => {
    await handlePullRequestEvent(db, payload({ action: "synchronize" }));
    expect(await entryFor("PR_dbtest_event_1")).toBeNull();
  });
});
