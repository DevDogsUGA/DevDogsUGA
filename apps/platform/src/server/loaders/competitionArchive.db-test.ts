// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  excerptBrief,
  getCompetitionArchive,
  type ArchivedCompetition,
} from "./competitionArchive";
import { deleteMembers, insertMember } from "./publicProfileFixtures";

/**
 * The archive loader against a real database: public contributors named,
 * private ones only counted, a hidden avatar left null, the winner shown.
 * Fixture ids are all `fa...` and swept before and after every test.
 */

const uid = (n: number) =>
  `fa000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const PUBLIC = uid(1);
const PRIVATE = uid(2);
const LATE = uid(3);
const NO_AVATAR = uid(4);
const ALL = [PUBLIC, PRIVATE, LATE, NO_AVATAR] as const;

const TEAM = "fa000000-0000-4000-b000-000000000001";
const OTHER_TEAM = "fa000000-0000-4000-b000-000000000002";
const COMP = "fa000000-0000-4000-c000-000000000001";
const NEWER_COMP = "fa000000-0000-4000-c000-000000000002";

async function cleanup() {
  await db.execute(
    sql`delete from platform."competitionEntries" where "prNodeId" like 'PR_cadbtest%'`,
  );
  await db.execute(
    sql`delete from platform.competitions where id in (${COMP}::uuid, ${NEWER_COMP}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.teams where id in (${TEAM}::uuid, ${OTHER_TEAM}::uuid)`,
  );
  await deleteMembers(ALL);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from storage.objects where bucket_id = 'avatars' and name in (${PUBLIC}, ${NO_AVATAR})`,
    );
  });
}

beforeEach(cleanup);
afterAll(cleanup);

async function seed() {
  await insertMember({
    id: PUBLIC,
    handle: "cadb-public",
    first: "Pat",
    last: "Public",
  });
  await insertMember({
    id: PRIVATE,
    handle: "cadb-private",
    first: "Priv",
    last: "Secretson",
    profile: { publicProfile: false },
  });
  await insertMember({ id: LATE, handle: "cadb-late" });
  await insertMember({
    id: NO_AVATAR,
    handle: "cadb-noavatar",
    profile: { showAvatar: false },
  });
  await db.execute(sql`
    insert into storage.objects (bucket_id, name, owner_id)
    values ('avatars', ${PUBLIC}, ${PUBLIC}), ('avatars', ${NO_AVATAR}, ${NO_AVATAR})
  `);
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy") values
      (${TEAM}::uuid, 'cadb-team', 'CADB Team', 'ZZZ234', ${PUBLIC}::uuid),
      (${OTHER_TEAM}::uuid, 'cadb-other', 'CADB Other', 'ZZZ235', ${PUBLIC}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role, "joinedAt") values
      (${TEAM}::uuid, ${PUBLIC}::uuid, 'lead', now() - interval '30 days'),
      (${TEAM}::uuid, ${PRIVATE}::uuid, 'member', now() - interval '30 days'),
      (${TEAM}::uuid, ${NO_AVATAR}::uuid, 'member', now() - interval '30 days'),
      (${TEAM}::uuid, ${LATE}::uuid, 'member', now() - interval '1 day')
  `);
  await db.execute(sql`
    insert into platform.competitions (id, slug, "issueNodeId", "issueNumber", repo, url, title, brief, "kickedOffAt")
    values
      (${COMP}::uuid, 'cadb-comp', 'I_cadbtest1', 911, 'o/r', 'https://example.test/i/911', 'CADB Comp', '# Build **it**. See [docs](https://x.test).', now() - interval '20 days'),
      (${NEWER_COMP}::uuid, 'cadb-newer', 'I_cadbtest2', 912, 'o/r', 'https://example.test/i/912', 'CADB Newer', null, now() - interval '2 days')
  `);
  await db.execute(sql`
    insert into platform."competitionEntries" ("competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt", "mergedAt")
    values
      (${COMP}::uuid, ${TEAM}::uuid, 'PR_cadbtest_1', 81, 'https://example.test/pull/81', now() - interval '10 days', now() - interval '9 days'),
      (${COMP}::uuid, ${TEAM}::uuid, 'PR_cadbtest_2', 82, 'https://example.test/pull/82', now() - interval '8 days', null)
  `);
}

async function archived(slug: string): Promise<ArchivedCompetition> {
  const found = (await getCompetitionArchive()).find((c) => c.slug === slug);
  expect(found).toBeDefined();
  return found!;
}

describe("getCompetitionArchive", () => {
  it("names public contributors and only counts private ones", async () => {
    await seed();
    const comp = await archived("cadb-comp");
    expect(comp.contributors.map((c) => c.handle)).toEqual([
      "cadb-public", // "Pat Public" sorts before "Test Member"
      "cadb-noavatar",
    ]);
    // Private is counted; the late joiner is not a contributor at all.
    expect(comp.privateContributorCount).toBe(1);
    expect(comp.contributors.some((c) => c.handle === "cadb-late")).toBe(false);

    const payload = JSON.stringify(comp);
    expect(payload).not.toContain("cadb-private");
    expect(payload).not.toContain("Secretson");
    expect(payload).not.toContain(PRIVATE);
    expect(payload).not.toContain("cadb-late");
  });

  it("gives an avatar only when it is shown", async () => {
    await seed();
    const comp = await archived("cadb-comp");
    const byHandle = new Map(comp.contributors.map((c) => [c.handle, c]));
    expect(byHandle.get("cadb-public")?.avatarUrl).toContain(
      `/avatars/${PUBLIC}`,
    );
    expect(byHandle.get("cadb-noavatar")?.avatarUrl).toBeNull();
    expect(byHandle.get("cadb-public")?.displayName).toBe("Pat Public");
  });

  it("shows the winning team, and none when nothing merged", async () => {
    await seed();
    expect((await archived("cadb-comp")).winner).toEqual({
      teamName: "CADB Team",
      teamSlug: "cadb-team",
    });
    const newer = await archived("cadb-newer");
    expect(newer.winner).toBeNull();
    expect(newer.contributors).toEqual([]);
    expect(newer.privateContributorCount).toBe(0);
  });

  it("lists newest first with a plain-text excerpt", async () => {
    await seed();
    const slugs = (await getCompetitionArchive())
      .map((c) => c.slug)
      .filter((s) => s.startsWith("cadb-"));
    expect(slugs).toEqual(["cadb-newer", "cadb-comp"]);
    expect((await archived("cadb-comp")).briefExcerpt).toBe(
      "Build it. See docs.",
    );
    expect((await archived("cadb-newer")).briefExcerpt).toBeNull();
  });

  it("does not count entries opened after the competition closed", async () => {
    await seed();
    await db.execute(
      sql`update platform.competitions set "closedAt" = now() - interval '9 days' where id = ${COMP}::uuid`,
    );
    await db.execute(sql`
      insert into platform."competitionEntries" ("competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt")
      values (${COMP}::uuid, ${OTHER_TEAM}::uuid, 'PR_cadbtest_3', 83, 'https://example.test/pull/83', now() - interval '1 day')
    `);
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role, "joinedAt")
      values (${OTHER_TEAM}::uuid, ${LATE}::uuid, 'lead', now() - interval '5 days')
    `);
    const comp = await archived("cadb-comp");
    expect(comp.contributors.some((c) => c.handle === "cadb-late")).toBe(false);
  });
});

describe("excerptBrief", () => {
  it("returns null for empty input and truncates on a word boundary", () => {
    expect(excerptBrief(null)).toBeNull();
    expect(excerptBrief("  \n ")).toBeNull();
    const long = excerptBrief("word ".repeat(100), 50)!;
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(51);
  });
});
