// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SHOWCASE_COLOR_KEYS, SHOWCASE_ICON_KEYS } from "~/config/showcaseKeys";
import { ExpectedFailure } from "~/lib/actionResult";
import { callerFor } from "~/server/auth/access";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

vi.mock("next/cache", () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
}));

const { getFeaturedProjects, getSwitcherProjects } = await import("./showcase");
const { updateProjectShowcase } = await import("./showcaseWrite");

/**
 * The project showcase against a real database (D6; Q30): migration 82's
 * platform row, the two loaders (who is shown, in what order, with which
 * links), an officer's edit and its audit event, and that the registry keys
 * the app accepts are exactly the ones the database trigger accepts. Fixture
 * ids are all `d6...`, projects are named `D6 ...` and slugged `d6-...`. The
 * seeded rows are read, and only ever changed inside a transaction that
 * is rolled back.
 */

const id = (n: number) =>
  `d6000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const OFFICER = id(1);
const MEMBER = id(2);
const ROLE = id(21);
const OPEN = id(11);
const LATER = id(12);
const ARCHIVED = id(13);
const PLAIN = id(14);
const REPO = 96_000_001;

const MIGRATION = readFileSync(
  // Vitest runs from the app's directory.
  resolve(
    process.cwd(),
    "../../supabase/migrations/20261031130000_82_platform_showcase_data.sql",
  ),
  "utf8",
);

/** Runs `work` in a transaction that is always rolled back. */
class Rollback extends Error {}
async function rolledBack(
  work: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<void>,
) {
  await db
    .transaction(async (tx) => {
      await work(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    for (const text of [
      `delete from platform."auditEvents" where "actorUserId" in ('${OFFICER}','${MEMBER}')`,
      `delete from platform."projectRepos" where "githubRepoId" = ${REPO}`,
      `delete from platform.projects where name like 'D6 %'`,
      `delete from platform."githubRepos" where "githubRepoId" = ${REPO}`,
      `delete from platform."userRoles" where "roleId" = '${ROLE}'`,
      `delete from platform.roles where id = '${ROLE}'`,
    ])
      await tx.execute(sql.raw(text));
  });
  await deleteMembers([OFFICER, MEMBER]);
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await insertMember({ id: OFFICER, handle: "d6-officer" });
  await insertMember({ id: MEMBER, handle: "d6-member" });
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${ROLE}::uuid, 'D6 Test Officer', 9999.7, true)`);
  await db.execute(
    sql`insert into platform."userRoles" ("userId", "roleId") values (${OFFICER}::uuid, ${ROLE}::uuid)`,
  );
  await db.execute(sql`
    insert into platform."githubRepos"
      ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch", "isDevdogsOrg")
    values (${REPO}, 168223232, 'DevDogsUGA', 'd6-open', 'Organization', 'main', true)`);
  // Three featured projects out of order, one archived, one never featured.
  for (const [project, name, order, status, featured] of [
    [OPEN, "D6 Open", -20, "active", true],
    [LATER, "D6 Later", -10, "active", true],
    [ARCHIVED, "D6 Archived", -30, "archived", true],
    [PLAIN, "D6 Plain", -40, "active", false],
  ] as const) {
    await db.execute(sql`
      insert into platform.projects
        (id, slug, name, status, featured, "inSwitcher", "displayOrder",
         "contributionMode", "switcherUrl", "showcaseLabel", "switcherBlurb")
      values (${project}::uuid, ${`d6-${name.slice(3).toLowerCase()}`}, ${name}, ${status},
              ${featured}, ${featured}, ${order}, 'open', 'https://d6.example.com', 'Beta', 'A thing')`);
  }
  await db.execute(sql`
    insert into platform."projectRepos"
      ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
    values (${OPEN}::uuid, ${REPO}, 'approved', 'devdogs-write', 168223232, now())`);
});

const officer = () => callerFor(OFFICER);

describe("migration 82 and the seeded platform project", () => {
  it("leaves the platform row with the showcase fields config/projects.ts had", async () => {
    const [row] = await db.execute<Record<string, unknown>>(sql`
      select name, status, "devdogsOwned", featured, "inSwitcher", tagline,
             "yearLabel", "iconKey", "colorKey", "showcaseLabel",
             "contributionMode", "switcherUrl", "switcherBlurb", "liveUrl",
             note, "displayOrder", tags, description
      from platform.projects where slug = 'platform'`);
    expect(row).toMatchObject({
      name: "DevDogs Platform",
      status: "active",
      devdogsOwned: true,
      featured: true,
      inSwitcher: true,
      tagline: "Member Portal and Dev Tools",
      yearLabel: "2026 – present",
      iconKey: "HouseIcon",
      colorKey: "cyan-400",
      showcaseLabel: "Maintenance",
      contributionMode: "closed",
      switcherUrl: "/",
      switcherBlurb: "Member Portal",
      liveUrl: null,
      note: null,
      displayOrder: 0,
      tags: [
        "next",
        "typescript",
        "tailwind",
        "drizzle",
        "supabase",
        "postgres",
      ],
    });
    expect(row!.description).toMatch(/^The site you're on\./);
  });

  it("fills a platform row that lacks the fields, and only fills", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql`
        update platform.projects
        set tagline = null, "iconKey" = null, "switcherUrl" = null,
            tags = '{}', description = null, featured = false
        where slug = 'platform'`);
      await tx.execute(sql.raw(MIGRATION));
      const [filled] = await tx.execute<Record<string, unknown>>(sql`
        select tagline, "iconKey", "switcherUrl", tags, description, featured
        from platform.projects where slug = 'platform'`);
      expect(filled).toMatchObject({
        tagline: "Member Portal and Dev Tools",
        iconKey: "HouseIcon",
        switcherUrl: "/",
        featured: false, // a toggle an officer turned off stays off
      });
      expect(filled!.tags).toHaveLength(6);
      expect(filled!.description).not.toBeNull();

      await tx.execute(sql`
        update platform.projects set tagline = 'Edited by an officer'
        where slug = 'platform'`);
      await tx.execute(sql.raw(MIGRATION));
      const [kept] = await tx.execute<{ tagline: string }>(
        sql`select tagline from platform.projects where slug = 'platform'`,
      );
      expect(kept!.tagline).toBe("Edited by an officer");
    });
  });

  it("leaves DogDays and DogPack as DevDogs-owned, featured projects anchored on their repositories", async () => {
    const rows = await db.execute<Record<string, unknown>>(sql`
      select p.id, p.slug, p.name, p.status, p."devdogsOwned", p.featured,
             p."inSwitcher", p.tagline, p."yearLabel", p."iconKey", p."colorKey",
             p."showcaseLabel", p."contributionMode", p."liveUrl", p."liveLabel",
             p."switcherUrl", p."switcherBlurb", p."displayOrder", p.tags,
             r."githubRepoId"::text as repo, r.approval, r."approvalBasis",
             r."approvedBy", r."linkedBy"
      from platform.projects p
      join platform."projectRepos" r on r."projectId" = p.id
      where p.slug in ('dogdays', 'dogpack')
      order by p."displayOrder"`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "d1000000-0000-4000-a000-000000000002",
      slug: "dogdays",
      name: "DogDays",
      status: "active",
      devdogsOwned: true,
      featured: true,
      inSwitcher: true,
      tagline: "Schedule Builder",
      yearLabel: "2024 – present",
      iconKey: "DogDaysIcon",
      colorKey: "red-600",
      showcaseLabel: "Public alpha",
      contributionMode: "open",
      liveUrl: "https://dogdays.dev",
      liveLabel: "Public Alpha",
      switcherUrl: "https://dogdays.dev",
      switcherBlurb: "Schedule Builder",
      displayOrder: 1,
      tags: ["Next.js", "TypeScript", "Tailwind CSS", "Supabase"],
      repo: "835908737",
      approval: "approved",
      approvalBasis: "devdogs-write",
      approvedBy: null,
      linkedBy: null,
    });
    expect(rows[1]).toMatchObject({
      id: "d1000000-0000-4000-a000-000000000003",
      slug: "dogpack",
      name: "DogPack",
      iconKey: "DogPackIcon",
      colorKey: "purple-500",
      showcaseLabel: "Pilot",
      contributionMode: "open",
      liveUrl: null,
      switcherUrl: null,
      switcherBlurb: "Study Group Finder",
      displayOrder: 2,
      tags: ["Flutter", "Dart", "Supabase"],
      repo: "1415368988",
    });
    const [repos] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."githubRepos"
      where "githubRepoId" in (835908737, 1415368988)
        and owner = 'DevDogsUGA' and "ownerId" = 168223232
        and "ownerType" = 'Organization' and "defaultBranch" = 'main'
        and "isDevdogsOrg" and health = 'available'`);
    expect(repos!.n).toBe(2);
    const [owners] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."projectOwners"
      where "projectId" in (select id from platform.projects where slug in ('dogdays','dogpack'))`);
    expect(owners!.n).toBe(0);
  });

  it("creates no project for Wuphf or Better Bus Tracker", async () => {
    const [row] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.projects
      where lower(name) in ('wuphf', 'better bus tracker')`);
    expect(row!.n).toBe(0);
  });

  it("changes nothing when run again", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql.raw(MIGRATION));
      await tx.execute(sql.raw(MIGRATION));
      const [row] = await tx.execute<{ projects: number; links: number }>(sql`
        select (select count(*) from platform.projects where slug in ('dogdays','dogpack'))::int as projects,
               (select count(*) from platform."projectRepos" where "githubRepoId" in (835908737, 1415368988))::int as links`);
      expect(row).toEqual({ projects: 2, links: 2 });
    });
  });

  it("reuses a slugless project that already has the name, and anchors it", async () => {
    await rolledBack(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(
        sql`delete from platform."projectRepos" where "githubRepoId" = 835908737`,
      );
      await tx.execute(
        sql`delete from platform.projects where slug = 'dogdays'`,
      );
      await tx.execute(sql`set local session_replication_role = origin`);
      await tx.execute(sql`
        insert into platform.projects (id, name, status, description)
        values (${id(50)}::uuid, 'dogdays ', 'active', 'Written by a member')`);
      await tx.execute(sql.raw(MIGRATION));
      const rows = await tx.execute<Record<string, unknown>>(sql`
        select id, slug, "devdogsOwned", featured, description, tagline,
               (select count(*)::int from platform."projectRepos" r where r."projectId" = p.id) as links
        from platform.projects p where lower(btrim(name)) = 'dogdays'`);
      expect(rows).toEqual([
        {
          id: id(50),
          slug: "dogdays",
          devdogsOwned: true,
          featured: true,
          description: "Written by a member",
          tagline: "Schedule Builder",
          links: 1,
        },
      ]);
    });
  });
});

describe("the loaders", () => {
  it("show the active featured projects in display order, never an archived or unfeatured one", async () => {
    const names = (await getFeaturedProjects()).map((project) => project.name);
    expect(names.filter((name) => name.startsWith("D6 "))).toEqual([
      "D6 Open",
      "D6 Later",
    ]);
    expect(
      names.filter((name) =>
        [
          "D6 Open",
          "D6 Later",
          "DevDogs Platform",
          "DogDays",
          "DogPack",
        ].includes(name),
      ),
    ).toEqual([
      "D6 Open",
      "D6 Later",
      "DevDogs Platform",
      "DogDays",
      "DogPack",
    ]);
  });

  it("list DogDays and DogPack with their repositories, and DogPack with no live site", async () => {
    const featured = await getFeaturedProjects();
    expect(featured.find((p) => p.name === "DogDays")).toMatchObject({
      contributionMode: "open",
      liveUrl: "https://dogdays.dev",
      githubUrls: ["https://github.com/DevDogsUGA/DogDays"],
    });
    expect(featured.find((p) => p.name === "DogPack")).toMatchObject({
      contributionMode: "open",
      liveUrl: null,
      githubUrls: ["https://github.com/DevDogsUGA/DogPack"],
    });
  });

  it("attach the GitHub link of an approved, available repository", async () => {
    const featured = await getFeaturedProjects();
    expect(featured.find((p) => p.name === "D6 Open")!.githubUrls).toEqual([
      "https://github.com/DevDogsUGA/d6-open",
    ]);
    expect(featured.find((p) => p.name === "D6 Later")!.githubUrls).toEqual([]);
    expect(
      featured.find((p) => p.name === "DevDogs Platform")!.githubUrls,
    ).toEqual(["https://github.com/DevDogsUGA/DevDogsUGA"]);
  });

  it("drop the link of a repository that has become unavailable, or was never approved", async () => {
    await db.execute(sql`
      update platform."githubRepos"
      set health = 'unavailable', "unavailableSince" = now()
      where "githubRepoId" = ${REPO}`);
    expect(
      (await getFeaturedProjects()).find((p) => p.name === "D6 Open")!
        .githubUrls,
    ).toEqual([]);
    await db.execute(sql`
      update platform."githubRepos"
      set health = 'available', "unavailableSince" = null
      where "githubRepoId" = ${REPO}`);
    await db.execute(sql`
      update platform."projectRepos"
      set approval = 'pending', "decidedAt" = null
      where "githubRepoId" = ${REPO}`);
    expect(
      (await getFeaturedProjects()).find((p) => p.name === "D6 Open")!
        .githubUrls,
    ).toEqual([]);
  });

  it("list the platform in the switcher as the page you are on", async () => {
    const tiles = await getSwitcherProjects();
    expect(tiles.find((tile) => tile.name === "DevDogs Platform")).toEqual({
      id: expect.any(String) as string,
      name: "DevDogs Platform",
      blurb: "Member Portal",
      url: "/",
      iconKey: "HouseIcon",
      colorKey: "cyan-400",
      badge: "You are Here",
    });
    expect(
      tiles
        .filter((tile) =>
          ["DevDogs Platform", "DogDays", "DogPack"].includes(tile.name),
        )
        .map((tile) => [tile.name, tile.url, tile.badge]),
    ).toEqual([
      ["DevDogs Platform", "/", "You are Here"],
      ["DogDays", "https://dogdays.dev", "Public alpha"],
      ["DogPack", null, "Pilot"],
    ]);
    const mine = tiles.filter((tile) => tile.name.startsWith("D6 "));
    expect(mine.map((tile) => tile.name)).toEqual(["D6 Open", "D6 Later"]);
    expect(mine[0]).toMatchObject({ badge: "Beta", blurb: "A thing" });
  });

  it("keep a project out of the switcher until its toggle is on", async () => {
    await db.execute(
      sql`update platform.projects set "inSwitcher" = false where id = ${LATER}::uuid`,
    );
    const names = (await getSwitcherProjects()).map((tile) => tile.name);
    expect(names).toContain("D6 Open");
    expect(names).not.toContain("D6 Later");
  });
});

describe("updateProjectShowcase", () => {
  const audit = async () =>
    db.execute<{ action: string; metadata: Record<string, unknown> }>(sql`
      select action, metadata from platform."auditEvents"
      where "actorUserId" = ${OFFICER}::uuid and "targetId" = ${PLAIN}`);

  it("lets an officer feature a project and write its fields, and logs the change", async () => {
    const result = await updateProjectShowcase(await officer(), PLAIN, {
      featured: true,
      inSwitcher: true,
      displayOrder: 5,
      tagline: "  A tagline ",
      iconKey: "DogPackIcon",
      colorKey: "purple-500",
      liveUrl: "https://d6.example.com/live",
      switcherUrl: "/docs",
      contributionMode: "closed",
    });
    expect(Object.keys(result.changes).sort()).toEqual([
      "colorKey",
      "contributionMode",
      "displayOrder",
      "featured",
      "iconKey",
      "inSwitcher",
      "liveUrl",
      "switcherUrl",
      "tagline",
    ]);
    const [row] = await db.execute<Record<string, unknown>>(sql`
      select featured, "inSwitcher", "displayOrder", tagline, "iconKey",
             "colorKey", "liveUrl", "switcherUrl", "contributionMode"
      from platform.projects where id = ${PLAIN}::uuid`);
    expect(row).toEqual({
      featured: true,
      inSwitcher: true,
      displayOrder: 5,
      tagline: "A tagline",
      iconKey: "DogPackIcon",
      colorKey: "purple-500",
      liveUrl: "https://d6.example.com/live",
      switcherUrl: "/docs",
      contributionMode: "closed",
    });
    const events = await audit();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "project.showcase_changed",
      metadata: {
        name: "D6 Plain",
        changes: { featured: { from: false, to: true } },
      },
    });
  });

  it("writes and logs nothing when nothing differs", async () => {
    const result = await updateProjectShowcase(await officer(), PLAIN, {
      featured: false,
      displayOrder: -40,
    });
    expect(result.changes).toEqual({});
    expect(await audit()).toHaveLength(0);
  });

  it("refuses a member, a bad value and an unknown project, and changes nothing", async () => {
    const refused = async (work: Promise<unknown>) =>
      expect(
        await work.then(
          () => undefined,
          (e: unknown) => e,
        ),
      ).toBeInstanceOf(ExpectedFailure);
    await refused(
      updateProjectShowcase(await callerFor(MEMBER), PLAIN, { featured: true }),
    );
    await refused(
      updateProjectShowcase(await officer(), PLAIN, {
        liveUrl: "javascript:alert(1)",
      }),
    );
    await refused(
      updateProjectShowcase(await officer(), PLAIN, { iconKey: "<svg>" }),
    );
    await refused(
      updateProjectShowcase(await officer(), id(99), { featured: true }),
    );
    const [row] = await db.execute<{
      featured: boolean;
      liveUrl: string | null;
    }>(
      sql`select featured, "liveUrl" from platform.projects where id = ${PLAIN}::uuid`,
    );
    expect(row).toEqual({ featured: false, liveUrl: null });
    expect(await audit()).toHaveLength(0);
  });

  it("takes a project off the homepage list when un-featured", async () => {
    await updateProjectShowcase(await officer(), OPEN, { featured: false });
    expect(
      (await getFeaturedProjects()).map((project) => project.name),
    ).not.toContain("D6 Open");
  });
});

describe("the registries and the database trigger", () => {
  it("accept every registry key, and only those", async () => {
    await rolledBack(async (tx) => {
      for (const key of SHOWCASE_ICON_KEYS)
        await tx.execute(
          sql`update platform.projects set "iconKey" = ${key} where id = ${PLAIN}::uuid`,
        );
      for (const key of SHOWCASE_COLOR_KEYS)
        await tx.execute(
          sql`update platform.projects set "colorKey" = ${key} where id = ${PLAIN}::uuid`,
        );
    });
    for (const [column, key] of [
      ["iconKey", "SomethingElseIcon"],
      ["colorKey", "red-600; background:url(x)"],
    ] as const)
      await expect(
        db.execute(
          sql.raw(
            `update platform.projects set "${column}" = '${key}' where id = '${PLAIN}'`,
          ),
        ),
      ).rejects.toThrow();
  });
});
