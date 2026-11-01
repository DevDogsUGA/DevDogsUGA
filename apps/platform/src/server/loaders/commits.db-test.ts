// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { deleteMembers, insertMember } from "./publicProfileFixtures";
import { getCommitsForUser } from "./commits";

/**
 * The commit reader against a real database: a member's own list names every
 * repository, the public list leaves out commits whose repositories are
 * unavailable, a commit stored under two repositories is listed once, and a
 * commit with no default-branch provenance is not listed at all. Fixture ids
 * are all `c5...`.
 */

const MEMBER = "c5000000-0000-4000-a000-000000000001";
const OTHER = "c5000000-0000-4000-a000-000000000002";
const OPEN_REPO = "950000001";
const GONE_REPO = "950000002";
const SHA = (n: number) => `c5${String(n).padStart(2, "0")}${"0".repeat(36)}`;

async function cleanup() {
  await db.execute(
    sql`delete from platform."repoCommits" where "githubRepoId" in (${OPEN_REPO}::bigint, ${GONE_REPO}::bigint)`,
  );
  await db.execute(
    sql`delete from platform.commits where "githubRepoId" in (${OPEN_REPO}::bigint, ${GONE_REPO}::bigint)`,
  );
  await deleteMembers([MEMBER, OTHER]);
  await db.execute(
    sql`delete from platform."githubRepos" where "githubRepoId" in (${OPEN_REPO}::bigint, ${GONE_REPO}::bigint)`,
  );
}

async function commit(
  n: number,
  userId: string,
  committedAt: string,
  message: string,
  repos: readonly string[],
) {
  await db.execute(sql`
    insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${SHA(n)}, ${OPEN_REPO}::bigint, 9500000001, 'c5-a', ${userId}::uuid,
            ${committedAt}::timestamptz, ${message})
  `);
  for (const repo of repos) {
    await db.execute(sql`
      insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
      values (${repo}::bigint, ${SHA(n)}, 'main')
    `);
  }
}

beforeAll(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, handle: "c5-member", github: null });
  await insertMember({ id: OTHER, handle: "c5-other", github: null });
  await db.execute(sql`
    insert into platform."githubRepos"
      ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", health, "unavailableSince")
    values (${OPEN_REPO}::bigint, 950, 'DevDogsUGA', 'open-repo', 'Organization', 'main', 'available', null),
           (${GONE_REPO}::bigint, 951, 'DevDogsUGA', 'gone-repo', 'Organization', 'main', 'unavailable', now())
  `);
  // 1: newest, public only. 2: only in the unavailable repository. 3: stored
  // under both, so listed once, under the available one. 4: no provenance.
  // 5: someone else's.
  await commit(1, MEMBER, "2026-10-20T16:00:00Z", "Newest\n\nbody text", [
    OPEN_REPO,
  ]);
  await commit(2, MEMBER, "2026-10-15T16:00:00Z", "Hidden publicly", [
    GONE_REPO,
  ]);
  await commit(3, MEMBER, "2026-10-10T16:00:00Z", "Both", [
    GONE_REPO,
    OPEN_REPO,
  ]);
  await commit(4, MEMBER, "2026-10-05T16:00:00Z", "No provenance", []);
  await commit(5, OTHER, "2026-10-18T16:00:00Z", "Not yours", [OPEN_REPO]);
});

afterAll(cleanup);

describe("getCommitsForUser", () => {
  it("lists a member's own commits newest first, whatever their repository's health", async () => {
    const own = await getCommitsForUser(MEMBER, { publicOnly: false });
    expect(own.map((c) => c.sha)).toEqual([SHA(1), SHA(2), SHA(3)]);
    expect(own.map((c) => c.repo)).toEqual([
      "DevDogsUGA/open-repo",
      "DevDogsUGA/gone-repo",
      "DevDogsUGA/open-repo",
    ]);
  });

  it("leaves out, publicly, every commit with no available repository", async () => {
    const shown = await getCommitsForUser(MEMBER, { publicOnly: true });
    expect(shown.map((c) => c.sha)).toEqual([SHA(1), SHA(3)]);
    expect(shown.every((c) => c.repo === "DevDogsUGA/open-repo")).toBe(true);
  });

  it("titles a commit by its first line and links it on GitHub", async () => {
    const [first] = await getCommitsForUser(MEMBER, { publicOnly: true });
    expect(first).toMatchObject({
      title: "Newest",
      url: `https://github.com/DevDogsUGA/open-repo/commit/${SHA(1)}`,
    });
    expect(first?.committedAt).toEqual(new Date("2026-10-20T16:00:00Z"));
  });

  it("never lists another member's commit", async () => {
    const other = await getCommitsForUser(OTHER, { publicOnly: false });
    expect(other.map((c) => c.sha)).toEqual([SHA(5)]);
  });
});
