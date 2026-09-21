// @vitest-environment node
import { workshops as workshopsSpec } from "@devdogsuga/airtable";
import type { AirtableRecord } from "@devdogsuga/airtable";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { pullWorkshops } from "./sync";

/**
 * The workshops pull, against a real database.
 *
 * A database test rather than a unit test because the bug it guards lived in
 * SQL that typechecking cannot see: `pullWorkshops` opens by selecting the
 * existing rows with a correlated subquery, and the outer key in that subquery
 * was rendered as a bare `"id"` while the joined competitions and teams each
 * carry their own. Postgres rejected the whole statement as ambiguous, so the
 * pass threw before examining a single record — every pass, regardless of
 * input. `platform.workshops` stayed empty in production while meetings synced
 * fine, and every workshop night rendered as "Unscheduled". Only a query run
 * against the real schema catches it.
 */

const F = workshopsSpec.fields;
const MEETING_REC = "recWsTestMeeting";
const PROJECT_REC = "recWsTestProject";

async function cleanup() {
  await db.execute(
    sql`delete from platform.workshops where "airtableRecordId" like 'recWsTest%'`,
  );
  await db.execute(
    sql`delete from platform.meetings where slug like 'ws-test-%'`,
  );
  await db.execute(
    sql`delete from platform.projects where "airtableRecordId" like 'recWsTest%'`,
  );
}

async function seed() {
  const meeting = await db.execute<{ id: string }>(sql`
    insert into platform.meetings (slug, "startsAt", "endsAt")
    values ('ws-test-night', now(), now() + interval '2 hours')
    returning id`);
  const project = await db.execute<{ id: string }>(sql`
    insert into platform.projects (slug, "displayName", "airtableRecordId")
    values ('ws-test-project', 'WS Test Project', ${PROJECT_REC})
    returning id`);
  return {
    meetingIds: new Map([[MEETING_REC, meeting[0]!.id]]),
    projectIds: new Map([[PROJECT_REC, project[0]!.id]]),
  };
}

function workshopRecord(fields: {
  title?: string;
  meeting?: string[];
  project?: string[];
}): AirtableRecord {
  return {
    id: "recWsTestA",
    fields: {
      ...(fields.title === undefined ? {} : { [F.title.id]: fields.title }),
      ...(fields.meeting === undefined
        ? {}
        : { [F.meeting.id]: fields.meeting }),
      ...(fields.project === undefined
        ? {}
        : { [F.project.id]: fields.project }),
    },
  };
}

beforeEach(cleanup);
afterAll(cleanup);

describe("pullWorkshops", () => {
  it("runs its existing-rows query without an ambiguous column error", async () => {
    // The regression: this call examines no records, but the existing-rows
    // query still executes, which is exactly where the ambiguity threw.
    await expect(
      pullWorkshops([], new Map(), new Map()),
    ).resolves.toBeDefined();
  });

  it("inserts a workshop once its meeting and project links resolve", async () => {
    const { meetingIds, projectIds } = await seed();

    const out = await pullWorkshops(
      [
        workshopRecord({
          title: "Supabase",
          meeting: [MEETING_REC],
          project: [PROJECT_REC],
        }),
      ],
      meetingIds,
      projectIds,
    );

    expect(out.upserted).toBe(1);
    expect(out.refusals).toEqual([]);

    const rows = await db.execute<{
      title: string | null;
      meetingId: string;
      projectId: string | null;
    }>(sql`
      select title, "meetingId", "projectId"
      from platform.workshops
      where "airtableRecordId" = 'recWsTestA'`);
    expect(rows[0]!.title).toBe("Supabase");
    expect(rows[0]!.meetingId).toBe(meetingIds.get(MEETING_REC));
    expect(rows[0]!.projectId).toBe(projectIds.get(PROJECT_REC));
  });
});
