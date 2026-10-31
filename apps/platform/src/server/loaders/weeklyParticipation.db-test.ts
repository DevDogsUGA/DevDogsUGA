// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { getWeeklyParticipation } from "./weeklyParticipation";

/**
 * The weekly streak loader against a real database: workshop attendance and
 * stored default-branch commits light weeks, a plain meeting does not, and a
 * member with nothing has an empty (but valid) streak. Fixture ids are all
 * `a3...`.
 */

const WORKSHOP_MEETING = "a3000000-0000-4000-a000-000000000001";
const PLAIN_MEETING = "a3000000-0000-4000-a000-000000000002";
const COMMIT_ONLY_MEETING = "a3000000-0000-4000-a000-000000000003";
const MEMBER = "a3000000-0000-4000-a000-0000000000ff";
const NOBODY = "a3000000-0000-4000-a000-0000000000fe";
const REPO_ID = "930000001";
const SHA = (n: number) => `a3${String(n).padStart(2, "0")}${"0".repeat(36)}`;

async function cleanup() {
  await db.execute(
    sql`delete from platform."repoCommits" where "githubRepoId" = ${REPO_ID}::bigint`,
  );
  await db.execute(
    sql`delete from platform.commits where "githubRepoId" = ${REPO_ID}::bigint`,
  );
  await db.execute(sql`
    delete from platform.attendance where "userId" in (${MEMBER}::uuid, ${NOBODY}::uuid)
  `);
  await db.execute(sql`
    delete from auth.users where id in (${MEMBER}::uuid, ${NOBODY}::uuid)
  `);
  await db.execute(sql`
    delete from platform.meetings
    where id in (${WORKSHOP_MEETING}::uuid, ${PLAIN_MEETING}::uuid, ${COMMIT_ONLY_MEETING}::uuid)
  `);
  await db.execute(
    sql`delete from platform."githubRepos" where "githubRepoId" = ${REPO_ID}::bigint`,
  );
}

beforeAll(async () => {
  await cleanup();
  // Week of Sep 14, a workshop night; week of Sep 21, a night with no
  // workshop; week of Sep 28, a night nobody attends (a commit will light it).
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt") values
      (${WORKSHOP_MEETING}::uuid, 'weekly-loader-workshop', '2026-09-16T22:00:00Z', '2026-09-16T23:30:00Z'),
      (${PLAIN_MEETING}::uuid, 'weekly-loader-plain', '2026-09-23T22:00:00Z', '2026-09-23T23:30:00Z'),
      (${COMMIT_ONLY_MEETING}::uuid, 'weekly-loader-commit', '2026-09-30T22:00:00Z', '2026-09-30T23:30:00Z')
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
  // A commit in a repository that has since gone UNAVAILABLE still lights its
  // week (Q42), and a commit with no default-branch provenance lights nothing.
  await db.execute(sql`
    insert into platform."githubRepos"
      ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", health, "unavailableSince")
    values (${REPO_ID}::bigint, 930, 'DevDogsUGA', 'weekly-loader-dbtest', 'Organization', 'main', 'unavailable', now())
  `);
  await db.execute(sql`
    insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${SHA(1)}, ${REPO_ID}::bigint, 424242, 'weekly-loader', ${MEMBER}::uuid, '2026-10-01T15:00:00Z', 'A change'),
           (${SHA(2)}, ${REPO_ID}::bigint, 424242, 'weekly-loader', ${MEMBER}::uuid, '2026-09-24T15:00:00Z', 'No provenance')
  `);
  await db.execute(sql`
    insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
    values (${REPO_ID}::bigint, ${SHA(1)}, 'main')
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
  it("lights a week for workshop attendance and a commit (even in an unavailable repository), but not a plain meeting or a commit without provenance", async () => {
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
