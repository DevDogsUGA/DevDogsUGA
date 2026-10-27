// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getWeeklyParticipation } from "./weeklyParticipation";

/**
 * The weekly streak loader against a real database: workshop attendance and
 * merged pull requests light weeks, a plain meeting does not, and a member with
 * nothing has an empty (but valid) streak. Fixture ids are all `a3...`.
 */

const WORKSHOP_MEETING = "a3000000-0000-4000-a000-000000000001";
const PLAIN_MEETING = "a3000000-0000-4000-a000-000000000002";
const PR_ONLY_MEETING = "a3000000-0000-4000-a000-000000000003";
const MEMBER = "a3000000-0000-4000-a000-0000000000ff";
const NOBODY = "a3000000-0000-4000-a000-0000000000fe";
const REPO = "DevDogsUGA/weekly-loader-dbtest";

async function cleanup() {
  await db.execute(
    sql`delete from platform.contributions where repo = ${REPO}`,
  );
  await db.execute(sql`
    delete from platform.attendance where "userId" in (${MEMBER}::uuid, ${NOBODY}::uuid)
  `);
  await db.execute(sql`
    delete from auth.users where id in (${MEMBER}::uuid, ${NOBODY}::uuid)
  `);
  await db.execute(sql`
    delete from platform.meetings
    where id in (${WORKSHOP_MEETING}::uuid, ${PLAIN_MEETING}::uuid, ${PR_ONLY_MEETING}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();
  // Week of Sep 14, a workshop night; week of Sep 21, a night with no
  // workshop; week of Sep 28, a night nobody attends (a PR will light it).
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt") values
      (${WORKSHOP_MEETING}::uuid, 'weekly-loader-workshop', '2026-09-16T22:00:00Z', '2026-09-16T23:30:00Z'),
      (${PLAIN_MEETING}::uuid, 'weekly-loader-plain', '2026-09-23T22:00:00Z', '2026-09-23T23:30:00Z'),
      (${PR_ONLY_MEETING}::uuid, 'weekly-loader-pr', '2026-09-30T22:00:00Z', '2026-09-30T23:30:00Z')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${WORKSHOP_MEETING}::uuid, 'weekly-loader-workshop')
  `);
  for (const id of [MEMBER, NOBODY]) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`weekly-${id.slice(-2)}@uga.edu`})
    `);
  }
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt") values
      (gen_random_uuid(), ${MEMBER}::uuid, ${WORKSHOP_MEETING}::uuid, 'qr', '2026-09-16T22:30:00Z'),
      (gen_random_uuid(), ${MEMBER}::uuid, ${PLAIN_MEETING}::uuid, 'qr', '2026-09-23T22:30:00Z')
  `);
  // A merged PR in a PRIVATE repository: any merged PR counts (Q97).
  await db.execute(sql`
    insert into platform.contributions
      (repo, "repoPrivate", "prNumber", title, url, "mergedAt", "authorGithubId", "authorLogin", "userId")
    values (${REPO}, true, 1, 'A change', 'https://github.com/DevDogsUGA/weekly-loader-dbtest/pull/1',
            '2026-10-01T15:00:00Z', '424242', 'weekly-loader', ${MEMBER}::uuid)
  `);
});

afterAll(cleanup);

function stateOf(
  result: Awaited<ReturnType<typeof getWeeklyParticipation>>,
  week: string,
) {
  return result.semesters
    .flatMap((semester) => semester.weeks)
    .find((cell) => cell.week === week)?.state;
}

describe("getWeeklyParticipation", () => {
  it("lights a week for workshop attendance and a private-repo merged PR, but not a plain meeting", async () => {
    const result = await getWeeklyParticipation(MEMBER);
    expect(stateOf(result, "2026-09-14")).toBe("lit");
    expect(stateOf(result, "2026-09-21")).toBe("dark");
    expect(stateOf(result, "2026-09-28")).toBe("lit");
    expect(Number.isInteger(result.longest)).toBe(true);
    expect(result.longest).toBeGreaterThanOrEqual(1);
  });

  it("reads real rows without throwing on timestamps", async () => {
    const result = await getWeeklyParticipation(NOBODY);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
    expect(stateOf(result, "2026-09-14")).toBe("dark");
    const fall = result.semesters.find((s) => s.id === "fall-2026");
    expect(fall?.text).toMatch(/^Fall 2026: 0 of \d+ weeks$/);
  });
});
