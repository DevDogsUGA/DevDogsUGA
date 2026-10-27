// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
  type MemberFixture,
} from "./publicProfileFixtures";
import {
  getPublicProfileByHandle,
  searchPublicProfiles,
  type DirectorySearch,
} from "./publicProfiles";

/**
 * The `/community` directory against a real database: search (including
 * wildcard escaping), the leadership, major and graduation-year filters,
 * pagination, the view's new columns, and that members who are not public
 * never appear however they are searched. Fixture ids are all `fa...` and
 * swept before and after every test.
 */

const id = (n: number) =>
  `fa000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const ALL = Array.from({ length: 12 }, (_, i) => id(i + 1));
const OFFICER_ROLE = "fa000000-0000-4000-d000-000000000001";

async function cleanup() {
  await deleteMembers(ALL);
  await db.execute(
    sql`delete from platform.roles where id = ${OFFICER_ROLE}::uuid`,
  );
  await db.execute(
    sql`delete from platform."academicPrograms" where id in (9900001, 9900002, 9900003)`,
  );
}

beforeEach(async () => {
  await cleanup();
  await db.execute(sql`
    insert into platform."academicPrograms" (id, name, credential, "bulletinUrl", "lastSeenAt", category)
    values
      (9900001, 'Dbtest Computer Science', 'BS', 'https://example.test/1', now(), 'undergraduate_major'),
      (9900002, 'Dbtest Computer Science', 'BA', 'https://example.test/2', now(), 'undergraduate_major'),
      (9900003, 'Dbtest Linguistics', 'Minor', 'https://example.test/3', now(), 'undergraduate_minor')
  `);
});
afterAll(cleanup);

// Verification needs the preferred name to equal the roster name, so a test
// that sets only `preferredName` gets a roster name to match ("Alice Dir" →
// first "Alice", last "Dir"); otherwise nobody is listed at all.
async function member(o: Partial<MemberFixture> & { id: string }) {
  const [first, ...rest] = (o.preferredName ?? "").split(" ");
  const roster =
    o.preferredName && rest.length > 0 && o.first === undefined
      ? { first, last: rest.join(" ") }
      : {};
  await insertMember({ handle: `dir-${o.id.slice(-2)}`, ...roster, ...o });
}

async function setYear(userId: string, year: number) {
  await db.execute(
    sql`update platform.profile set "graduationYear" = ${year} where "userId" = ${userId}::uuid`,
  );
}

async function addProgram(userId: string, programId: number, order: number) {
  await db.execute(sql`
    insert into platform."profileAcademicPrograms" ("userId", "programId", "sortOrder")
    values (${userId}::uuid, ${programId}, ${order})
  `);
}

async function makeOfficer(userId: string) {
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${OFFICER_ROLE}::uuid, 'dir officer', 987654.321, true)
    on conflict (id) do nothing
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${userId}::uuid, ${OFFICER_ROLE}::uuid)
  `);
}

const base: DirectorySearch = {
  q: "",
  leadership: false,
  major: null,
  year: null,
  page: 1,
};
const handles = async (o: Partial<DirectorySearch> = {}) =>
  (await searchPublicProfiles({ ...base, ...o })).members
    .map((m) => m.handle)
    .filter((h) => h.startsWith("dir-"));

describe("directory search", () => {
  it("matches the shown name and the handle, case-insensitively", async () => {
    await member({ id: id(1), preferredName: "Quincy Dirtest" });
    await member({
      id: id(2),
      preferredName: "Someone Else",
      handle: "dir-quincy",
    });
    await member({ id: id(3), preferredName: "Unrelated Person" });
    expect(await handles({ q: "QUINCY" })).toEqual(["dir-01", "dir-quincy"]);
    expect(await handles({ q: "dirtest" })).toEqual(["dir-01"]);
  });

  it("treats % _ and backslash literally", async () => {
    await member({ id: id(1), preferredName: "Fifty% Off" });
    await member({ id: id(2), preferredName: "Fiftyx Off" });
    await member({ id: id(3), preferredName: "Under_score Dir" });
    await member({ id: id(4), preferredName: "Underxscore Dir" });
    expect(await handles({ q: "fifty%" })).toEqual(["dir-01"]);
    expect(await handles({ q: "under_s" })).toEqual(["dir-03"]);
    expect(await handles({ q: "%" })).toEqual(["dir-01"]);
    expect(await handles({ q: "\\" })).toEqual([]);
  });

  it("cannot find a member through a name they hide", async () => {
    await member({
      id: id(1),
      preferredName: "Hidden Hannah",
      handle: "dir-shy",
      profile: { showName: false },
    });
    expect(await handles({ q: "hannah" })).toEqual([]);
    expect(await handles({ q: "shy" })).toEqual(["dir-shy"]);
  });
});

describe("directory filters", () => {
  it("filters by leadership role", async () => {
    await member({ id: id(1), preferredName: "Alice Dir" });
    await member({ id: id(2), preferredName: "Bob Dir" });
    await makeOfficer(id(2));
    expect(await handles({ leadership: true })).toEqual(["dir-02"]);
    expect(await handles({ excludeLeadership: true })).toEqual(["dir-01"]);
  });

  it("exposes only major categories, deduplicated, and filters on them", async () => {
    await member({ id: id(1), preferredName: "Alice Dir" });
    await member({ id: id(2), preferredName: "Bob Dir" });
    await addProgram(id(1), 9_900_001, 0);
    await addProgram(id(1), 9_900_002, 1);
    await addProgram(id(1), 9_900_003, 2);
    const alice = await getPublicProfileByHandle("dir-01");
    expect(alice?.majors).toEqual(["Dbtest Computer Science"]);
    expect(await handles({ major: "Dbtest Computer Science" })).toEqual([
      "dir-01",
    ]);
    // A minor is never public, so it is neither shown nor filterable.
    expect(await handles({ major: "Dbtest Linguistics" })).toEqual([]);
  });

  it("filters by graduation year and shows it", async () => {
    await member({ id: id(1), preferredName: "Alice Dir" });
    await member({ id: id(2), preferredName: "Bob Dir" });
    await setYear(id(2), 2031);
    expect(await handles({ year: 2031 })).toEqual(["dir-02"]);
    expect((await getPublicProfileByHandle("dir-02"))?.graduationYear).toBe(
      2031,
    );
  });

  it("combines filters", async () => {
    await member({ id: id(1), preferredName: "Alice Dir" });
    await member({ id: id(2), preferredName: "Alicia Dir" });
    await setYear(id(2), 2031);
    expect(await handles({ q: "ali", year: 2031 })).toEqual(["dir-02"]);
  });
});

describe("directory pagination", () => {
  it("pages alphabetically and clamps an out-of-range page", async () => {
    for (let n = 1; n <= 5; n++)
      await member({ id: id(n), preferredName: `Pg ${"abcde"[n - 1]} Dir` });
    const p1 = await searchPublicProfiles({ ...base, q: "pg " }, 2);
    expect(p1).toMatchObject({ total: 5, page: 1, totalPages: 3 });
    expect(p1.members.map((m) => m.displayName)).toEqual([
      "Pg a Dir",
      "Pg b Dir",
    ]);
    const p3 = await searchPublicProfiles({ ...base, q: "pg ", page: 3 }, 2);
    expect(p3.members.map((m) => m.displayName)).toEqual(["Pg e Dir"]);
    const far = await searchPublicProfiles({ ...base, q: "pg ", page: 99 }, 2);
    expect(far.page).toBe(3);
  });
});

describe("directory privacy", () => {
  it("never lists members who are not public, however searched", async () => {
    await member({ id: id(1), preferredName: "Shown Sam" });
    await member({
      id: id(2),
      preferredName: "Switched Sam",
      profile: { publicProfile: false },
    });
    await member({
      id: id(3),
      preferredName: "Unverified Sam",
      verified: false,
    });
    await member({ id: id(4), preferredName: "Handleless Sam" });
    await member({ id: id(5), preferredName: "Pending Sam" });
    await db.execute(sql`
      insert into platform."accountDeletions" ("userId", "scheduledFor", email)
      values (${id(5)}::uuid, now() + interval '14 days', 'pending@persona.test')
    `);
    await db.execute(sql`
      update platform.profile set handle = null where "userId" = ${id(4)}::uuid
    `);
    expect(await handles({ q: "sam" })).toEqual(["dir-01"]);
    expect(await handles({ q: "sam", year: 2030 })).toEqual(["dir-01"]);
  });
});

describe("account deletion", () => {
  it("takes the member's directory entry with the account", async () => {
    await member({ id: id(1), preferredName: "Gone Gail" });
    await addProgram(id(1), 9_900_001, 0);
    expect(await handles({ q: "gail" })).toEqual(["dir-01"]);
    await db.execute(sql`delete from auth.users where id = ${id(1)}::uuid`);
    expect(await handles({ q: "gail" })).toEqual([]);
    const [left] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."profileAcademicPrograms" where "userId" = ${id(1)}::uuid`,
    );
    expect(left?.n).toBe(0);
  });
});
