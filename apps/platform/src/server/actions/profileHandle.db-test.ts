// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * The `setHandle` server action against a real database. The validation
 * itself is `platform.set_handle`'s and is covered in
 * loaders/publicProfiles.db-test.ts; this file covers what the action adds:
 * the session, the typed outcomes, cache invalidation and the rate limit.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
  authenticate: () => Promise.reject(new Error("unauthenticated")),
}));

const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => void revalidated.push(path),
}));

const { default: setHandle } = await import("~/server/actions/profileHandle");

const A = "fa000000-0000-4000-a000-000000000001";
const B = "fa000000-0000-4000-a000-000000000002";
const ALL = [A, B] as const;

beforeEach(async () => {
  await deleteMembers(ALL);
  revalidated.length = 0;
  session.userId = A;
});
afterAll(() => deleteMembers(ALL));

const stored = async (id: string) => {
  const [row] = await db.execute<{ handle: string | null }>(
    sql`select handle from platform.profile where "userId" = ${id}::uuid`,
  );
  return row?.handle;
};

describe("setHandle", () => {
  it("sets an offered handle and revalidates the old and new pages", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "Pat",
      last: "Doe",
      github: "pp-pat",
    });
    expect(await setHandle("PP-Pat")).toEqual({
      status: "set",
      handle: "pp-pat",
    });
    expect(await stored(A)).toBe("pp-pat");
    expect(revalidated).toEqual(
      expect.arrayContaining(["/community", "/community/@pp-pat"]),
    );

    revalidated.length = 0;
    expect(await setHandle("patd")).toEqual({ status: "set", handle: "patd" });
    expect(revalidated).toContain("/community/@pp-pat");
    expect(revalidated).toContain("/community/@patd");
  });

  it("returns not_offered for a handle outside the options", async () => {
    await insertMember({ id: A, handle: null, github: "pp-real" });
    expect(await setHandle("someone-elses-idea")).toEqual({
      status: "not_offered",
    });
    expect(await stored(A)).toBeNull();
    expect(revalidated).toEqual([]);
  });

  it("returns taken when another member holds it", async () => {
    await insertMember({ id: A, handle: null, github: "pp-clash" });
    await insertMember({ id: B, handle: "pp-clash" });
    expect(await setHandle("pp-clash")).toEqual({ status: "taken" });
  });

  it("cannot act for anyone but the session's member", async () => {
    await insertMember({ id: A, handle: null, github: "pp-a" });
    await insertMember({ id: B, handle: null, github: "pp-b" });
    // B's handle is not in A's options, whatever the caller sends.
    expect(await setHandle("pp-b")).toEqual({ status: "not_offered" });
    expect(await stored(B)).toBeNull();
  });

  it("rate-limits after ten attempts", async () => {
    await insertMember({ id: A, handle: null, github: "pp-rl" });
    for (let i = 0; i < 10; i++) {
      expect((await setHandle("nope")).status).toBe("not_offered");
    }
    expect(await setHandle("pp-rl")).toEqual({ status: "rate_limited" });
    expect(await stored(A)).toBeNull();
  });
});
