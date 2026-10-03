// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
  type MemberFixture,
} from "./publicProfileFixtures";
import {
  getHandleOptions,
  getPublicProfileActivity,
  getPublicHandlesByUserId,
  getPublicProfileByHandle,
  listPublicProfiles,
  searchPublicProfiles,
} from "./publicProfiles";

/**
 * `platform."publicProfiles"`, `platform.handle_options`, `platform.set_handle`
 * and the loaders over them, against a real database.
 *
 * The view is where the "who is public" rule lives, so most cases here select
 * through a loader and assert a member appears or does not. Fixture ids are
 * all `f9...` and swept before and after every test.
 */

const id = (n: number) =>
  `f9000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);
const MODERATOR = id(90);
const ALL = [A, B, C, D, MODERATOR] as const;

const TEAM = "f9000000-0000-4000-b000-000000000001";
const COMP = "f9000000-0000-4000-c000-000000000001";

async function cleanup() {
  await db.execute(
    sql`delete from platform."competitionEntries" where "prNodeId" like 'PR_ppdbtest%'`,
  );
  await db.execute(
    sql`delete from platform.competitions where id = ${COMP}::uuid`,
  );
  await db.execute(sql`delete from platform.teams where id = ${TEAM}::uuid`);
  await deleteMembers(ALL);
}

beforeEach(cleanup);
afterAll(cleanup);

const names = async () => (await listPublicProfiles()).map((p) => p.handle);

/** Run `fn` inside a transaction as a PostgREST-style role, always rolled back. */
async function asRole<T>(
  role: "anon" | "authenticated",
  sub: string | null,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; code: string | undefined }> {
  const rollback = new Error("rollback");
  let out:
    | { ok: true; value: T }
    | { ok: false; code: string | undefined }
    | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify(sub ? { sub, role } : { role })}, true)`,
      );
      await tx.execute(sql`set local role ${sql.raw(role)}`);
      try {
        out = { ok: true, value: await fn(tx) };
      } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause;
        out = { ok: false, code: cause?.code };
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return out!;
}

async function quarantine(userId: string) {
  const [app] = await db.execute<{ id: string }>(
    sql`select id from platform.apps where slug = 'platform'`,
  );
  const [report] = await db.execute<{ id: string }>(sql`
    insert into platform.reports ("appId", "reporterUserId", "reportedUserId", "contentType", "contentRef", "contentSnapshot", reason)
    values (${app!.id}::uuid, ${MODERATOR}::uuid, ${userId}::uuid, 'profile', ${userId}, 'x', 'spam')
    returning id
  `);
  const [resolution] = await db.execute<{ id: string }>(sql`
    insert into platform."reportResolutions" ("reportId", "moderatorUserId", "subjectAction", "filerAction", "contentAction")
    values (${report!.id}::uuid, ${MODERATOR}::uuid, 'no_action', 'no_action', 'quarantine')
    returning id
  `);
  await db.execute(
    sql`update platform.profile set "quarantinedBy" = ${resolution!.id}::uuid where "userId" = ${userId}::uuid`,
  );
}

async function member(overrides: Partial<MemberFixture> & { id: string }) {
  await insertMember({
    handle: `ppdb-${overrides.id.slice(-2)}`,
    ...overrides,
  });
}

describe("publicProfiles: who is public", () => {
  it("includes a verified member with a handle", async () => {
    await member({ id: A, first: "Ada", last: "Lovelace", handle: "ppdb-ada" });
    expect(await names()).toContain("ppdb-ada");
    expect((await getPublicProfileByHandle("ppdb-ada"))?.displayName).toBe(
      "Ada Lovelace",
    );
  });

  it("maps user ids to handles for public members only", async () => {
    await member({ id: A, handle: "ppdb-mapped" });
    await member({
      id: B,
      handle: "ppdb-mapped-off",
      profile: { publicProfile: false },
    });
    const map = await getPublicHandlesByUserId([A, B, C]);
    expect(map.get(A)).toBe("ppdb-mapped");
    expect(map.has(B)).toBe(false);
    expect(map.has(C)).toBe(false);
    expect((await getPublicHandlesByUserId([])).size).toBe(0);
  });

  it("excludes unverified accounts", async () => {
    await member({ id: A, handle: "ppdb-unverified", verified: false });
    await member({ id: B, handle: "ppdb-nogithub", github: null });
    expect(await names()).not.toContain("ppdb-unverified");
    expect(await names()).not.toContain("ppdb-nogithub");
    expect(await getPublicProfileByHandle("ppdb-unverified")).toBeNull();
  });

  it("excludes publicProfile = false", async () => {
    await member({
      id: A,
      handle: "ppdb-off",
      profile: { publicProfile: false },
    });
    expect(await names()).not.toContain("ppdb-off");
    expect(await getPublicProfileByHandle("ppdb-off")).toBeNull();
    expect(await getPublicProfileActivity("ppdb-off")).toBeNull();
  });

  it("excludes a null handle", async () => {
    await member({ id: A, handle: null });
    const rows = await db.execute(
      sql`select 1 from platform."publicProfiles" where "userId" = ${A}::uuid`,
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes quarantined members", async () => {
    await insertMember({ id: MODERATOR, handle: null });
    await member({ id: A, handle: "ppdb-quarantined" });
    expect(await names()).toContain("ppdb-quarantined");
    await quarantine(A);
    expect(await names()).not.toContain("ppdb-quarantined");
    expect(await getPublicProfileByHandle("ppdb-quarantined")).toBeNull();
  });

  it("excludes suspended members", async () => {
    await member({ id: A, handle: "ppdb-suspended" });
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    expect(await names()).not.toContain("ppdb-suspended");
  });

  it("matches the handle case-insensitively", async () => {
    await member({ id: A, handle: "ppdb-case" });
    expect((await getPublicProfileByHandle("PPDB-Case"))?.handle).toBe(
      "ppdb-case",
    );
  });
});

describe("publicProfiles: hidden fields come back null", () => {
  it("nulls name, avatar, bio, role description and connected accounts when hidden", async () => {
    await member({
      id: A,
      handle: "ppdb-hide",
      bio: "hello",
      roleDescription: "I run things",
      linkedin: "Ada L",
      profile: { showGithub: true, showDiscord: true, showLinkedin: true },
    });
    const shown = await getPublicProfileByHandle("ppdb-hide");
    expect(shown).toMatchObject({
      displayName: "Test Member",
      bio: "hello",
      roleDescription: "I run things",
      githubHandle: expect.stringContaining("gh-") as string,
      discordHandle: expect.stringContaining("dc-") as string,
      linkedinName: "Ada L",
    });

    await db.execute(sql`
      update platform.profile set "showName" = false, "showAvatar" = false, "showBio" = false,
        "showGithub" = false, "showDiscord" = false, "showLinkedin" = false
      where "userId" = ${A}::uuid
    `);
    const hidden = await getPublicProfileByHandle("ppdb-hide");
    expect(hidden).toMatchObject({
      handle: "ppdb-hide",
      displayName: null,
      avatarUrl: null,
      bio: null,
      roleDescription: null,
      githubHandle: null,
      discordHandle: null,
      linkedinName: null,
    });
    expect(hidden?.visibility).toMatchObject({
      name: false,
      avatar: false,
      bio: false,
    });
  });

  it("keeps connected accounts private by default (the existing show* defaults)", async () => {
    await member({ id: A, handle: "ppdb-default" });
    const p = await getPublicProfileByHandle("ppdb-default");
    expect(p).toMatchObject({
      githubHandle: null,
      discordHandle: null,
      linkedinName: null,
    });
    expect(p?.visibility).toEqual({
      name: true,
      avatar: true,
      bio: true,
      links: true,
      competitions: true,
      contributions: true,
      stars: true,
    });
  });

  it("only offers an avatar URL when the object exists and the flag is on", async () => {
    await member({ id: A, handle: "ppdb-avatar" });
    expect(
      (await getPublicProfileByHandle("ppdb-avatar"))?.avatarUrl,
    ).toBeNull();
    await db.execute(sql`
      insert into storage.objects (bucket_id, name, owner_id)
      values ('avatars', ${A}, ${A})
    `);
    try {
      expect(
        (await getPublicProfileByHandle("ppdb-avatar"))?.avatarUrl,
      ).toContain(`/avatars/${A}`);
      await db.execute(
        sql`update platform.profile set "showAvatar" = false where "userId" = ${A}::uuid`,
      );
      expect(
        (await getPublicProfileByHandle("ppdb-avatar"))?.avatarUrl,
      ).toBeNull();
    } finally {
      // storage.objects refuses direct deletes; the guard is a trigger, which
      // the replica role skips.
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.execute(
          sql`delete from storage.objects where bucket_id = 'avatars' and name = ${A}`,
        );
      });
    }
  });

  it("never exposes private columns", async () => {
    await member({
      id: A,
      handle: "ppdb-private",
      first: "Zed",
      last: "Zzyzx",
      legalFirst: "Zedediah",
      legalLast: "Zzyzxian",
      ugaEmail: "zz99999@uga.edu",
    });
    const cols = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'platform' and table_name = 'publicProfiles'
    `);
    const columnNames = cols.map((c) => c.column_name);
    for (const banned of [
      "legalFirstName",
      "legalLastName",
      "ugaEmail",
      "involvementFirstName",
      "involvementLastName",
      "email",
      "pronouns",
      "graduationYear",
      "quarantinedBy",
      "identitySourcedAt",
    ]) {
      expect(columnNames).not.toContain(banned);
    }
    const everything = JSON.stringify([
      await getPublicProfileByHandle("ppdb-private"),
      await getPublicProfileActivity("ppdb-private"),
      await listPublicProfiles(),
    ]);
    expect(everything).not.toContain("Zedediah");
    expect(everything).not.toContain("Zzyzxian");
    expect(everything).not.toContain("zz99999");
  });
});

describe("publicProfiles: access", () => {
  it("is unreadable by anon and authenticated", async () => {
    await member({ id: A, handle: "ppdb-acl" });
    for (const role of ["anon", "authenticated"] as const) {
      const r = await asRole(role, role === "anon" ? null : A, (tx) =>
        tx.execute(sql`select * from platform."publicProfiles"`),
      );
      expect(r).toEqual({ ok: false, code: "42501" });
    }
  });

  it("cannot be used to read handle internals directly", async () => {
    for (const fn of [
      "handle_candidates(gen_random_uuid())",
      "handle_slug('x')",
    ]) {
      const r = await asRole("authenticated", A, (tx) =>
        tx.execute(sql.raw(`select platform.${fn}`)),
      );
      expect(r).toEqual({ ok: false, code: "42501" });
    }
  });
});

describe("handle uniqueness", () => {
  it("is case-insensitive and format-checked", async () => {
    await member({ id: A, handle: "ppdb-unique" });
    await insertMember({ id: B, handle: null });
    await expect(
      db.execute(
        sql`update platform.profile set handle = 'PPDB-UNIQUE' where "userId" = ${B}::uuid`,
      ),
    ).rejects.toThrow();
    for (const bad of [
      "a",
      "-ab",
      "ab-",
      "a b",
      "Ab",
      "x".repeat(40),
      ".ab",
      "ab_",
    ]) {
      await expect(
        db.execute(
          sql`update platform.profile set handle = ${bad} where "userId" = ${B}::uuid`,
        ),
      ).rejects.toThrow();
    }
    await db.execute(
      sql`update platform.profile set handle = 'a.b_c-d' where "userId" = ${B}::uuid`,
    );
  });

  it("is not writable by a member's own browser session", async () => {
    await member({ id: A, handle: null });
    const r = await asRole("authenticated", A, (tx) =>
      tx.execute(
        sql`update platform.profile set handle = 'ppdb-sneaky' where "userId" = ${A}::uuid`,
      ),
    );
    expect(r).toEqual({ ok: false, code: "42501" });
    const ok = await asRole("authenticated", A, (tx) =>
      tx.execute(
        sql`update platform.profile set "showStars" = false where "userId" = ${A}::uuid returning "userId"`,
      ),
    );
    expect(ok.ok).toBe(true);
  });
});

describe("handle_options", () => {
  it("offers each source, normalized, deduplicated in kind order", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "José",
      last: "Núñez-Ångström",
      legalFirst: "Joseph",
      legalLast: "Nunez",
      ugaEmail: "jn12345@uga.edu",
      github: "Jose-N",
      discord: "jose.n",
    });
    const { options, current } = await getHandleOptions(A);
    expect(current).toBeNull();
    expect(options).toEqual([
      { kind: "github", handle: "jose-n", available: true },
      { kind: "discord", handle: "jose.n", available: true },
      { kind: "myid", handle: "jn12345", available: true },
      // involvementLastName wins over legalLastName.
      { kind: "legal_full", handle: "josephnunezangstrom", available: true },
      { kind: "legal_initial", handle: "josephn", available: true },
      { kind: "preferred_full", handle: "josenunezangstrom", available: true },
      { kind: "preferred_initial", handle: "josen", available: true },
    ]);
  });

  it("collapses identical handles into the first kind and skips invalid ones", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "Sam",
      last: "Lee",
      ugaEmail: "samlee@uga.edu",
      github: "samlee",
      discord: "!!",
      legalFirst: "Sam",
    });
    const { options } = await getHandleOptions(A);
    // myid, legal_full and preferred_full all equal "samlee" and fold into
    // github; preferred_initial equals legal_initial and folds into it.
    expect(options.map((o) => [o.kind, o.handle])).toEqual([
      ["github", "samlee"],
      ["legal_initial", "saml"],
    ]);
  });

  it("marks another member's handle unavailable and counts your own as available", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "Sam",
      last: "Lee",
      github: null,
      discord: null,
    });
    await insertMember({
      id: B,
      handle: "samlee",
      first: "Other",
      last: "Person",
    });
    let { options } = await getHandleOptions(A);
    expect(options.find((o) => o.handle === "samlee")).toMatchObject({
      available: false,
    });
    expect(options.find((o) => o.handle === "saml")).toMatchObject({
      available: true,
    });
    await db.execute(
      sql`update platform.profile set handle = null where "userId" = ${B}::uuid`,
    );
    await db.execute(
      sql`update platform.profile set handle = 'samlee' where "userId" = ${A}::uuid`,
    );
    ({ options } = await getHandleOptions(A));
    expect(options.find((o) => o.handle === "samlee")).toMatchObject({
      available: true,
    });
  });

  it("falls back to the smallest free numeric suffix when everything is taken", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "Sam",
      last: "Lee",
      github: null,
      discord: null,
      ugaEmail: null,
    });
    await insertMember({ id: B, handle: "samlee", first: "B", last: "B" });
    await insertMember({ id: C, handle: "saml", first: "C", last: "C" });
    await insertMember({ id: D, handle: "saml2", first: "D", last: "D" });
    const { options } = await getHandleOptions(A);
    expect(options.filter((o) => o.available)).toEqual([
      { kind: "suffixed", handle: "saml3", available: true },
    ]);
    expect(options.slice(0, -1).every((o) => !o.available)).toBe(true);
  });

  it("is empty for a profile with nothing to derive from", async () => {
    await insertMember({
      id: A,
      handle: null,
      first: "",
      last: "",
      legalFirst: "",
      legalLast: "",
      github: null,
      discord: null,
    });
    expect((await getHandleOptions(A)).options).toEqual([]);
  });

  it("is only readable for yourself", async () => {
    await insertMember({ id: A, handle: null, github: "ppdb-a" });
    await insertMember({ id: B, handle: null, github: "ppdb-b" });
    const own = await asRole("authenticated", A, (tx) =>
      tx.execute(sql`select * from platform.handle_options(${A}::uuid)`),
    );
    expect(own.ok).toBe(true);
    const other = await asRole("authenticated", A, (tx) =>
      tx.execute(sql`select * from platform.handle_options(${B}::uuid)`),
    );
    expect(other).toEqual({ ok: false, code: "42501" });
    const asAnon = await asRole("anon", null, (tx) =>
      tx.execute(sql`select * from platform.handle_options(${B}::uuid)`),
    );
    expect(asAnon).toEqual({ ok: false, code: "42501" });
    const setOther = await asRole("authenticated", A, (tx) =>
      tx.execute(sql`select platform.set_handle(${B}::uuid, 'ppdb-b')`),
    );
    expect(setOther).toEqual({ ok: false, code: "42501" });
  });
});

describe("set_handle", () => {
  const setHandle = async (uid: string, handle: string) => {
    const [row] = await db.execute<{ r: string }>(
      sql`select platform.set_handle(${uid}::uuid, ${handle}) as r`,
    );
    return row!.r;
  };

  it("sets a handle that is in the options", async () => {
    await insertMember({ id: A, handle: null, github: "ppdb-setme" });
    expect(await setHandle(A, "PPDB-SetMe ")).toBe("set");
    expect((await getPublicProfileByHandle("ppdb-setme"))?.handle).toBe(
      "ppdb-setme",
    );
  });

  it("rejects a handle that is not in the options", async () => {
    await insertMember({ id: A, handle: null, github: "ppdb-real" });
    expect(await setHandle(A, "totally-made-up")).toBe("not_offered");
    expect(await setHandle(A, "ppdb-real-2")).toBe("not_offered");
    expect(await setHandle(A, "")).toBe("not_offered");
    const [row] = await db.execute<{ handle: string | null }>(
      sql`select handle from platform.profile where "userId" = ${A}::uuid`,
    );
    expect(row!.handle).toBeNull();
  });

  it("rejects a handle another member already holds, even if it is one of your options", async () => {
    await insertMember({ id: A, handle: null, github: "ppdb-contested" });
    await insertMember({ id: B, handle: "ppdb-contested" });
    expect(await setHandle(A, "ppdb-contested")).toBe("taken");
  });

  it("reports 'taken' when it loses a race on the unique index", async () => {
    await insertMember({ id: A, handle: null, github: "ppdb-race" });
    await insertMember({ id: B, handle: null, github: "ppdb-race" });
    let loser!: Promise<string>;
    // A's write is uncommitted while B reads its options, so B still sees the
    // handle as free and blocks on the index until A commits.
    await db.transaction(async (tx) => {
      const [first] = await tx.execute<{ r: string }>(
        sql`select platform.set_handle(${A}::uuid, 'ppdb-race') as r`,
      );
      expect(first!.r).toBe("set");
      loser = setHandle(B, "ppdb-race");
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(await loser).toBe("taken");
  });

  it("refuses quarantined and suspended members, and unknown profiles", async () => {
    await insertMember({ id: MODERATOR, handle: null });
    await insertMember({ id: A, handle: null, github: "ppdb-blocked" });
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    expect(await setHandle(A, "ppdb-blocked")).toBe("blocked");
    await db.execute(
      sql`delete from platform."userSuspensions" where "userId" = ${A}::uuid`,
    );
    await quarantine(A);
    expect(await setHandle(A, "ppdb-blocked")).toBe("blocked");
    expect(await setHandle("f9000000-0000-4000-a000-000000009999", "x")).toBe(
      "no_profile",
    );
  });
});

describe("backfill", () => {
  it("gives verified members preferred_full, then initial, then a suffix, oldest account first", async () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../../../supabase/migrations/20261003000000_49_platform_public_profiles.sql",
      ),
      "utf8",
    );
    const block = /\ndo \$\$[\s\S]*?\n\$\$;/.exec(migration)?.[0];
    expect(block).toBeDefined();
    const scoped = block!.replace(
      `where v.verified and p."handle" is null`,
      `where v.verified and p."handle" is null and p."userId" in ('${A}', '${B}', '${C}', '${D}')`,
    );
    expect(scoped).not.toBe(block);

    const base = { first: "Sam", last: "Lee", handle: null };
    // Inserted newest-first to prove the order is by account age, not insertion.
    await insertMember({ ...base, id: C, createdAt: "2026-03-01T00:00:00Z" });
    await insertMember({ ...base, id: B, createdAt: "2026-02-01T00:00:00Z" });
    await insertMember({ ...base, id: A, createdAt: "2026-01-01T00:00:00Z" });
    await insertMember({
      ...base,
      id: D,
      createdAt: "2026-01-01T00:00:00Z",
      verified: false,
    });

    await db.execute(sql.raw(scoped));
    const rows = await db.execute<{
      userId: string;
      handle: string | null;
    }>(sql`
      select "userId", handle from platform.profile where "userId" in (${A}::uuid, ${B}::uuid, ${C}::uuid, ${D}::uuid)
    `);
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r.handle]));
    expect(byId).toEqual({
      [A]: "samlee",
      [B]: "saml",
      [C]: "saml2",
      [D]: null,
    });
  });
});

describe("searchPublicProfiles", () => {
  it("matches handle and name prefixes, only public, never a hidden name", async () => {
    await member({
      id: A,
      handle: "ppdb-grace",
      first: "Grace",
      last: "Hopper",
    });
    await member({
      id: B,
      handle: "ppdb-hidden",
      first: "Grace",
      last: "Murray",
      profile: { showName: false },
    });
    await member({
      id: C,
      handle: "ppdb-off",
      first: "Grace",
      last: "Off",
      profile: { publicProfile: false },
    });
    await member({
      id: D,
      handle: "ppdb-unver",
      first: "Grace",
      last: "Unver",
      verified: false,
    });

    const byHandle = await searchPublicProfiles("@ppdb-gr");
    expect(byHandle.map((m) => m.handle)).toEqual(["ppdb-grace"]);
    expect(byHandle[0]!.userId).toBe(A);

    const byWord = (await searchPublicProfiles("hopp")).map((m) => m.handle);
    expect(byWord).toEqual(["ppdb-grace"]);

    const byFirst = (await searchPublicProfiles("grace")).map((m) => m.handle);
    expect(byFirst).toContain("ppdb-grace");
    expect(byFirst).not.toContain("ppdb-hidden"); // name hidden, handle doesn't match
    expect(byFirst).not.toContain("ppdb-off");
    expect(byFirst).not.toContain("ppdb-unver");

    expect(
      (await searchPublicProfiles("ppdb-hid")).map((m) => m.handle),
    ).toEqual(["ppdb-hidden"]);
    expect(await searchPublicProfiles("")).toEqual([]);
    expect(await searchPublicProfiles("%")).toEqual([]);
    expect((await searchPublicProfiles("ppdb", 1)).length).toBe(1);
  });
});

describe("getPublicProfileActivity", () => {
  async function seedActivity() {
    await member({ id: A, handle: "ppdb-active" });
    await member({ id: B, handle: "ppdb-late" });
    await db.execute(
      sql`insert into platform.teams (id, slug, name, "joinCode", "createdBy") values (${TEAM}::uuid, 'ppdb-team', 'PPDB Team', 'ZZZ234', ${A}::uuid)`,
    );
    await db.execute(
      sql`insert into platform."teamMembers" ("teamId", "userId", role, "joinedAt") values (${TEAM}::uuid, ${A}::uuid, 'lead', now() - interval '30 days')`,
    );
    await db.execute(
      sql`insert into platform."teamMembers" ("teamId", "userId", role, "joinedAt") values (${TEAM}::uuid, ${B}::uuid, 'member', now() - interval '1 day')`,
    );
    await db.execute(sql`
      insert into platform.competitions (id, slug, "issueNodeId", "issueNumber", repo, url, title, "kickedOffAt")
      values (${COMP}::uuid, 'ppdb-comp', 'I_ppdbtest', 901, 'o/r', 'https://example.test/i/901', 'PPDB Comp', now() - interval '20 days')
    `);
    await db.execute(sql`
      insert into platform."competitionEntries" ("competitionId", "teamId", "prNodeId", "prNumber", url, "openedAt", "mergedAt")
      values (${COMP}::uuid, ${TEAM}::uuid, 'PR_ppdbtest_1', 77, 'https://example.test/pull/77', now() - interval '10 days', now() - interval '9 days')
    `);
    await db.execute(sql`
      insert into platform."profileLinks" ("userId", url, title, "sortOrder")
      values (${A}::uuid, 'https://example.test/a', 'Site', 1)
    `);
  }

  it("returns links, competitions, merged contributions and star totals", async () => {
    await seedActivity();
    const activity = await getPublicProfileActivity("ppdb-active");
    expect(activity?.links).toEqual([
      { title: "Site", url: "https://example.test/a" },
    ]);
    expect(activity?.competitions).toMatchObject([
      {
        competitionSlug: "ppdb-comp",
        teamSlug: "ppdb-team",
        teamName: "PPDB Team",
        won: true,
      },
    ]);
    expect(activity?.contributions).toMatchObject([
      {
        prNumber: 77,
        url: "https://example.test/pull/77",
        teamSlug: "ppdb-team",
      },
    ]);
    expect(activity?.stars).toMatchObject({ competitionStars: 1, wins: 1 });
  });

  it("does not credit a member who joined after the entry opened", async () => {
    await seedActivity();
    const activity = await getPublicProfileActivity("ppdb-late");
    expect(activity?.competitions).toEqual([]);
    expect(activity?.contributions).toEqual([]);
    expect(activity?.stars).toMatchObject({ competitionStars: 0, wins: 0 });
  });

  it("returns null for each section its flag hides", async () => {
    await seedActivity();
    await db.execute(sql`
      update platform.profile set "showLinks" = false, "showCompetitions" = false,
        "showContributions" = false, "showStars" = false where "userId" = ${A}::uuid
    `);
    expect(await getPublicProfileActivity("ppdb-active")).toEqual({
      links: null,
      competitions: null,
      contributions: null,
      stars: null,
    });
  });
});
