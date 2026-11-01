// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * The public-profile settings actions against a real database: the typed
 * outcomes, what each one revalidates, and that a switch written here is what
 * the `publicProfiles` view reads. Who counts as public is covered in
 * loaders/publicProfiles.db-test.ts.
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

const {
  getMyHandleChoices,
  getPublicProfileSettings,
  setPublicProfileField,
  updateAccountVisibility,
} = await import("~/server/actions/publicProfile");

const A = "fb000000-0000-4000-a000-000000000001";
const B = "fb000000-0000-4000-a000-000000000002";
const ALL = [A, B] as const;

beforeEach(async () => {
  await deleteMembers(ALL);
  revalidated.length = 0;
  session.userId = A;
});
afterAll(() => deleteMembers(ALL));

const listed = async (handle: string) => {
  const rows = await db.execute(
    sql`select 1 from platform."publicProfiles" where handle = ${handle}`,
  );
  return rows.length > 0;
};

describe("setPublicProfileField", () => {
  it("turns the master switch off, delists the member and revalidates their pages", async () => {
    await insertMember({ id: A, handle: "ppact-a" });
    expect(await listed("ppact-a")).toBe(true);

    expect(await setPublicProfileField("publicProfile", false)).toEqual({
      status: "set",
    });
    expect(await listed("ppact-a")).toBe(false);
    expect(revalidated).toEqual(
      expect.arrayContaining([
        "/community",
        "/community/@ppact-a",
        "/dashboard/profile",
      ]),
    );

    await setPublicProfileField("publicProfile", true);
    expect(await listed("ppact-a")).toBe(true);
  });

  it("writes a per-field switch the view reads", async () => {
    await insertMember({ id: A, handle: "ppact-b", bio: "hello" });
    await setPublicProfileField("showBio", false);
    const [row] = await db.execute<{ bio: string | null; showBio: boolean }>(
      sql`select bio, "showBio" from platform."publicProfiles" where handle = 'ppact-b'`,
    );
    expect(row).toEqual({ bio: null, showBio: false });
  });

  it("revalidates the directory without a profile page when there is no handle", async () => {
    await insertMember({ id: A, handle: null });
    expect(await setPublicProfileField("showContributions", false)).toEqual({
      status: "set",
    });
    expect(revalidated).toEqual(["/community", "/dashboard/profile"]);
  });

  it("only touches the session's own profile", async () => {
    await insertMember({ id: A, handle: "ppact-own" });
    await insertMember({ id: B, handle: "ppact-other" });
    await setPublicProfileField("publicProfile", false);
    expect(await listed("ppact-other")).toBe(true);
  });

  it("refuses a suspended member and changes nothing", async () => {
    await insertMember({ id: A, handle: "ppact-susp" });
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    expect(await setPublicProfileField("showName", false)).toEqual({
      status: "blocked",
    });
    const [row] = await db.execute<{ showName: boolean }>(
      sql`select "showName" from platform.profile where "userId" = ${A}::uuid`,
    );
    expect(row?.showName).toBe(true);
    expect(revalidated).toEqual([]);
  });

  it("rejects a field that is not a public-profile switch", async () => {
    await insertMember({ id: A, handle: "ppact-bad" });
    await expect(
      setPublicProfileField("showEmail" as never, true),
    ).rejects.toThrow(/Unknown public profile field/);
  });

  it("rate-limits after thirty changes", async () => {
    await insertMember({ id: A, handle: "ppact-rl" });
    for (let i = 0; i < 30; i++) {
      expect((await setPublicProfileField("showBio", i % 2 === 0)).status).toBe(
        "set",
      );
    }
    expect(await setPublicProfileField("showBio", true)).toEqual({
      status: "rate_limited",
    });
  });
});

describe("getPublicProfileSettings", () => {
  it("reports verification, switches, handle and options", async () => {
    await insertMember({
      id: A,
      handle: "ppact-s",
      github: "ppact-s",
      profile: { showLinks: false, showContributions: false },
    });
    const settings = (await getPublicProfileSettings())!;
    expect(settings.isVerified).toBe(true);
    expect(settings.current).toBe("ppact-s");
    expect(settings.switches.showLinks).toBe(false);
    expect(settings.switches.showContributions).toBe(false);
    expect(settings.switches.publicProfile).toBe(true);
    expect(settings.options.map((o) => o.handle)).toContain("ppact-s");
  });

  it("reports an unverified member as such", async () => {
    await insertMember({ id: A, handle: null, verified: false });
    expect((await getPublicProfileSettings())?.isVerified).toBe(false);
  });

  it("answers null in production, where public profiles are off", async () => {
    await insertMember({ id: A, handle: "ppact-off" });
    vi.stubEnv("DEPLOY_ENV", "production");
    try {
      expect(await getPublicProfileSettings()).toBeNull();
      await expect(
        setPublicProfileField("showContributions", false),
      ).rejects.toThrow("Public profiles are off");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("getMyHandleChoices", () => {
  it("returns the session member's options only", async () => {
    await insertMember({ id: A, handle: null, github: "ppact-mine" });
    await insertMember({ id: B, handle: null, github: "ppact-theirs" });
    const handles = (await getMyHandleChoices()).options.map((o) => o.handle);
    expect(handles).toContain("ppact-mine");
    expect(handles).not.toContain("ppact-theirs");
  });
});

describe("updateAccountVisibility", () => {
  const shown = async (id: string) => {
    const [row] = await db.execute<{
      showGithub: boolean;
      showDiscord: boolean;
      showLinkedin: boolean;
    }>(
      sql`select "showGithub", "showDiscord", "showLinkedin" from platform.profile where "userId" = ${id}::uuid`,
    );
    return row;
  };

  it("writes the switches that were sent in one go and revalidates the member's pages", async () => {
    await insertMember({ id: A, handle: "ppact-av" });
    expect(
      await updateAccountVisibility({ showGithub: true, showLinkedin: true }),
    ).toEqual({ ok: true });
    expect(await shown(A)).toEqual({
      showGithub: true,
      showDiscord: false,
      showLinkedin: true,
    });
    expect(revalidated).toEqual(
      expect.arrayContaining(["/community", "/community/@ppact-av"]),
    );
  });

  it("only touches the session's own profile", async () => {
    await insertMember({ id: A, handle: "ppact-av-own" });
    await insertMember({ id: B, handle: "ppact-av-other" });
    await updateAccountVisibility({ showDiscord: true });
    expect((await shown(B))?.showDiscord).toBe(false);
  });

  it("refuses a suspended member and changes nothing", async () => {
    await insertMember({ id: A, handle: "ppact-av-susp" });
    await db.execute(
      sql`insert into platform."userSuspensions" ("userId", service) values (${A}::uuid, 'global')`,
    );
    expect(await updateAccountVisibility({ showGithub: true })).toMatchObject({
      ok: false,
    });
    expect((await shown(A))?.showGithub).toBe(false);
    expect(revalidated).toEqual([]);
  });

  it("refuses a switch that is not a connected account", async () => {
    await insertMember({ id: A, handle: "ppact-av-bad" });
    expect(
      await updateAccountVisibility({ showEmail: true } as never),
    ).toMatchObject({ ok: false });
  });
});
