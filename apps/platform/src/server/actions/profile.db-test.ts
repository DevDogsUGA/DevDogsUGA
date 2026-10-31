// @vitest-environment node
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { profileLinks } from "~/server/db/schema";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * The profile field actions against a real database: that each one writes only
 * the session's own row, that the links save is one transaction (including two
 * links trading places under the `(userId, sortOrder)` unique index), and that
 * a refused save leaves the list as it was.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
  authenticate: () => Promise.reject(new Error("unauthenticated")),
}));

// The board is invalidated only for an officer's save; these members hold no
// role, so it must stay untouched.
const boardRevalidations = vi.hoisted(() => ({ count: 0 }));
vi.mock("~/server/loaders/officers", () => ({
  revalidateOfficers: () => void boardRevalidations.count++,
}));

// A link saved without a title would otherwise fetch its page over the network.
vi.mock("~/server/profileLinkTitle", () => ({
  resolveLinkTitle: (_url: string, supplied: string | null) =>
    Promise.resolve(supplied ?? "Fetched title"),
}));

const { updateBio, updateIdentity, updateProfileLinks } =
  await import("~/server/actions/profile");

const A = "fc000000-0000-4000-a000-000000000001";
const B = "fc000000-0000-4000-a000-000000000002";
const ALL = [A, B] as const;

beforeEach(async () => {
  await deleteMembers(ALL);
  boardRevalidations.count = 0;
  session.userId = A;
});
afterAll(() => deleteMembers(ALL));

const profileOf = async (id: string) => {
  const [row] = await db.execute<{
    preferredName: string;
    bio: string | null;
    pronouns: string[] | null;
  }>(
    sql`select "preferredName", bio, pronouns from platform.profile where "userId" = ${id}::uuid`,
  );
  return row;
};

const linksOf = (id: string) =>
  db
    .select({
      id: profileLinks.id,
      url: profileLinks.url,
      title: profileLinks.title,
      sortOrder: profileLinks.sortOrder,
    })
    .from(profileLinks)
    .where(eq(profileLinks.userId, id))
    .orderBy(asc(profileLinks.sortOrder));

const seedLinks = async (id: string, count: number) => {
  await db.insert(profileLinks).values(
    Array.from({ length: count }, (_, i) => ({
      userId: id,
      url: `https://example.com/${i + 1}`,
      title: `Link ${i + 1}`,
      sortOrder: i + 1,
    })),
  );
  return linksOf(id);
};

describe("updateIdentity and updateBio", () => {
  it("writes the sent fields to the session's own profile only", async () => {
    await insertMember({ id: A });
    await insertMember({ id: B, preferredName: "Bee" });

    expect(
      await updateIdentity({ preferredName: "  Ada  ", pronouns: ["she"] }),
    ).toEqual({ ok: true, data: { preferredName: "Ada", pronouns: ["she"] } });
    expect(await updateBio("  a  \n\n b ")).toEqual({
      ok: true,
      data: "a\nb",
    });

    expect(await profileOf(A)).toMatchObject({
      preferredName: "Ada",
      pronouns: ["she"],
      bio: "a\nb",
    });
    expect((await profileOf(B))?.preferredName).toBe("Bee");
  });

  it("leaves the pronouns alone when only the name is sent", async () => {
    await insertMember({ id: A });
    await updateIdentity({ pronouns: ["they"] });
    await updateIdentity({ preferredName: "Ada" });
    expect((await profileOf(A))?.pronouns).toEqual(["they"]);
  });

  it("refuses a suspended member and writes nothing", async () => {
    await insertMember({ id: A, preferredName: "Before" });
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    expect(await updateIdentity({ preferredName: "After" })).toMatchObject({
      ok: false,
    });
    expect(await updateBio("After")).toMatchObject({ ok: false });
    expect((await profileOf(A))?.preferredName).toBe("Before");
  });
});

describe("updateProfileLinks", () => {
  it("adds links with the title that was given or fetched, and returns the list in order", async () => {
    await insertMember({ id: A });
    const result = await updateProfileLinks({
      remove: [],
      update: [],
      add: [
        { url: "https://b.example", title: null, sortOrder: 2 },
        { url: "https://a.example", title: "  Mine  ", sortOrder: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    const saved = result.ok ? result.data : [];
    expect(saved?.map((l) => [l.url, l.title, l.sortOrder])).toEqual([
      ["https://a.example", "Mine", 1],
      ["https://b.example", "Fetched title", 2],
    ]);
    expect((await linksOf(A)).map((l) => l.title)).toEqual([
      "Mine",
      "Fetched title",
    ]);
  });

  it("lets two links trade places despite the unique position index", async () => {
    await insertMember({ id: A });
    const [one, two] = await seedLinks(A, 2);

    const result = await updateProfileLinks({
      remove: [],
      update: [
        { id: one!.id, url: one!.url, title: one!.title, sortOrder: 2 },
        { id: two!.id, url: two!.url, title: two!.title, sortOrder: 1 },
      ],
      add: [],
    });
    expect(result.ok).toBe(true);
    expect((await linksOf(A)).map((l) => l.id)).toEqual([two!.id, one!.id]);
  });

  it("swaps one link for another on a full list", async () => {
    await insertMember({ id: A });
    const links = await seedLinks(A, 5);

    const result = await updateProfileLinks({
      remove: [links[4]!.id],
      update: [
        {
          id: links[0]!.id,
          url: "https://renamed.example",
          title: null,
          sortOrder: 1,
        },
      ],
      add: [{ url: "https://new.example", title: "New", sortOrder: 5 }],
    });
    expect(result.ok).toBe(true);
    expect((await linksOf(A)).map((l) => [l.url, l.title])).toEqual([
      ["https://renamed.example", "renamed.example"],
      ["https://example.com/2", "Link 2"],
      ["https://example.com/3", "Link 3"],
      ["https://example.com/4", "Link 4"],
      ["https://new.example", "New"],
    ]);
  });

  it("refuses a sixth link and writes nothing", async () => {
    await insertMember({ id: A });
    const before = await seedLinks(A, 5);

    const result = await updateProfileLinks({
      remove: [],
      update: [],
      add: [{ url: "https://six.example", title: null, sortOrder: 6 }],
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { links: expect.stringMatching(/up to 5 links/) as unknown },
    });
    expect(await linksOf(A)).toEqual(before);
  });

  it("refuses two links at one position and writes nothing", async () => {
    await insertMember({ id: A });
    const before = await seedLinks(A, 2);

    const result = await updateProfileLinks({
      remove: [before[1]!.id],
      update: [],
      add: [{ url: "https://dupe.example", title: null, sortOrder: 1 }],
    });
    expect(result).toMatchObject({ ok: false });
    expect(await linksOf(A)).toEqual(before);
  });

  it("refuses a javascript: address and writes nothing", async () => {
    await insertMember({ id: A });
    const result = await updateProfileLinks({
      remove: [],
      update: [],
      add: [{ url: "javascript:alert(1)", title: null, sortOrder: 1 }],
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { links: expect.stringMatching(/http/) as unknown },
    });
    expect(await linksOf(A)).toEqual([]);
  });

  it("will not remove or rewrite another member's link, and writes nothing", async () => {
    await insertMember({ id: A });
    await insertMember({ id: B });
    const mine = await seedLinks(A, 2);
    const theirs = await seedLinks(B, 1);

    const result = await updateProfileLinks({
      remove: [mine[0]!.id],
      update: [
        {
          id: theirs[0]!.id,
          url: "https://stolen.example",
          title: "Stolen",
          sortOrder: 1,
        },
      ],
      add: [],
    });
    expect(result).toMatchObject({ ok: false });
    expect(await linksOf(A)).toEqual(mine);
    expect(await linksOf(B)).toEqual(theirs);
  });

  it("refuses a suspended member and writes nothing", async () => {
    await insertMember({ id: A });
    const before = await seedLinks(A, 1);
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    const result = await updateProfileLinks({
      remove: [before[0]!.id],
      update: [],
      add: [],
    });
    expect(result).toMatchObject({ ok: false });
    expect(await linksOf(A)).toEqual(before);
  });

  it("does not invalidate the officer board for a member who holds no role", async () => {
    await insertMember({ id: A });
    await updateProfileLinks({
      remove: [],
      update: [],
      add: [{ url: "https://a.example", title: "A", sortOrder: 1 }],
    });
    expect(boardRevalidations.count).toBe(0);
  });
});
