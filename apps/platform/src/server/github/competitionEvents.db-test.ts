// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { competitions } from "~/server/db/schema";
import {
  handleCompetitionIssueEvent,
  handleProjectsV2ItemEvent,
} from "./competitionEvents";

/**
 * The mirror writes the webhook route makes for competitions, against a
 * real database -- the same shape `webhookEvents.db-test.ts` uses for teams.
 *
 * `handleProjectsV2ItemEvent` itself is barely more than a dispatch to
 * `ingestCompetitionItem`, which its own db-tests (`competitions.db-test.ts`)
 * already cover end to end; this file's one case for it is the action
 * filter, proven by an action this handler does not recognize touching
 * nothing. `handleCompetitionIssueEvent` gets the real coverage here: it is
 * the one place `issues` webhook deliveries write, and none of its three
 * branches goes through `competitions.ts` at all.
 */

const ISSUE_NODE_ID = "I_dbtest_events_1";
const COMPETITION_ID = "e5000000-0000-4000-a000-000000000001";

async function cleanup() {
  await db.execute(
    sql`delete from platform.competitions where id = ${COMPETITION_ID}::uuid`,
  );
}

beforeEach(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform.competitions
      (id, slug, "issueNodeId", "issueNumber", repo, url, title, brief, "kickedOffAt")
    values (${COMPETITION_ID}::uuid, 'events-db-test-competition',
            ${ISSUE_NODE_ID}, 1, 'DevDogsUGA/DevDogsUGA',
            'https://github.com/DevDogsUGA/DevDogsUGA/issues/1',
            'Events DB Test Competition', 'Original brief.', now() - interval '1 days')
  `);
});
afterAll(cleanup);

async function currentRow() {
  const [row] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.id, COMPETITION_ID));
  return row ?? null;
}

describe("handleCompetitionIssueEvent", () => {
  it("closes the mirror row on 'closed', using the payload's closed_at", async () => {
    await handleCompetitionIssueEvent(db, {
      action: "closed",
      issue: {
        node_id: ISSUE_NODE_ID,
        body: "Original brief.",
        closed_at: "2026-09-28T12:00:00Z",
      },
    });
    const row = await currentRow();
    expect(row?.closedAt).toEqual(new Date("2026-09-28T12:00:00Z"));
  });

  it("falls back to now() when 'closed' carries no closed_at", async () => {
    const before = new Date();
    await handleCompetitionIssueEvent(db, {
      action: "closed",
      issue: {
        node_id: ISSUE_NODE_ID,
        body: "Original brief.",
        closed_at: null,
      },
    });
    const row = await currentRow();
    expect(row?.closedAt).not.toBeNull();
    expect(row!.closedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("reopens the mirror row on 'reopened', clearing closedAt", async () => {
    await db.execute(sql`
      update platform.competitions set "closedAt" = now()
      where id = ${COMPETITION_ID}::uuid
    `);
    await handleCompetitionIssueEvent(db, {
      action: "reopened",
      issue: {
        node_id: ISSUE_NODE_ID,
        body: "Original brief.",
        closed_at: null,
      },
    });
    expect((await currentRow())?.closedAt).toBeNull();
  });

  it("updates only the brief on 'edited', leaving title untouched", async () => {
    await handleCompetitionIssueEvent(db, {
      action: "edited",
      issue: {
        node_id: ISSUE_NODE_ID,
        body: "Updated brief from the issue body.",
        closed_at: null,
      },
    });
    const row = await currentRow();
    expect(row?.brief).toBe("Updated brief from the issue body.");
    expect(row?.title).toBe("Events DB Test Competition");
  });

  it("ignores an action this handler does not recognize", async () => {
    await handleCompetitionIssueEvent(db, {
      action: "assigned",
      issue: {
        node_id: ISSUE_NODE_ID,
        body: "Should not land.",
        closed_at: "2026-09-28T12:00:00Z",
      },
    });
    const row = await currentRow();
    expect(row?.brief).toBe("Original brief.");
    expect(row?.closedAt).toBeNull();
  });

  it("no-ops for an issue this table does not mirror", async () => {
    // Not a throw, not a row created -- see this handler's own doc comment:
    // an issue that never went through the Competitions Project, or has not
    // been converted-and-ingested yet, is simply not this handler's business.
    await expect(
      handleCompetitionIssueEvent(db, {
        action: "closed",
        issue: {
          node_id: "I_dbtest_events_unmirrored",
          body: null,
          closed_at: "2026-09-28T12:00:00Z",
        },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("handleProjectsV2ItemEvent", () => {
  it("ignores an action other than 'converted' or 'edited'", async () => {
    // No Project id is configured in this file's real `~/env`, so a
    // `converted`/`edited` delivery would itself be a no-op through
    // `ingestCompetitionItem` -- this proves the ACTION filter runs before
    // that, not merely that nothing observable happened.
    await expect(
      handleProjectsV2ItemEvent(db, {
        action: "archived",
        projects_v2_item: { node_id: "PVTI_dbtest_ignored" },
      }),
    ).resolves.toBeUndefined();
  });
});
