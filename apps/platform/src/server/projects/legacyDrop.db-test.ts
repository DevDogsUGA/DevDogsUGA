// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

/**
 * The contract (D10, migration 84) against a real database: the retired
 * pull-request evidence, project member list and proposal columns are gone,
 * what the redesign still uses is untouched, and a member's account still goes
 * end to end (Q168) with those tables no longer part of it. Fixture ids are all
 * `d84...`, projects are named `D84 ...`, and everything is swept before and
 * after each test.
 */

const id = (n: number) =>
  `d8400000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const ADVISOR = id(2);
const OFFICER = id(3);
const ALL = [MEMBER, ADVISOR, OFFICER] as const;
const REPO = 95_000_001;
const sha = (n: number) => `d84${n.toString(16).padStart(37, "0")}`;
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const rows = <T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
) => db.execute<T>(query);

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  await db.transaction(async (tx) => {
    // Sweeping may leave an active project without a link, or a report without
    // a citation, for a moment: skip the guard triggers, as the other project
    // db-tests do.
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform."projectReportCommits" where sha like 'd84%'`,
    );
    await tx.execute(sql`
      delete from platform."projectReports"
      where "userId" in (${ids})
         or "projectId" in (select id from platform.projects where name like 'D84 %')`);
    await tx.execute(sql`
      delete from platform."projectRepos"
      where "projectId" in (select id from platform.projects where name like 'D84 %')`);
    await tx.execute(
      sql`delete from platform.projects where name like 'D84 %'`,
    );
    await tx.execute(
      sql`delete from platform."repoCommits" where sha like 'd84%'`,
    );
    await tx.execute(
      sql`delete from platform."badgeAwards" where "userId" in (${ids})`,
    );
    await tx.execute(sql`delete from platform.commits where sha like 'd84%'`);
    await tx.execute(
      sql`delete from platform."repoSyncState" where "githubRepoId" = ${REPO}`,
    );
    await tx.execute(
      sql`delete from platform."githubRepos" where "githubRepoId" = ${REPO}`,
    );
  });
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, handle: "d84-member" });
  await insertMember({ id: ADVISOR, handle: "d84-advisor" });
  await insertMember({ id: OFFICER, handle: "d84-officer" });
});

const exists = async (name: string) => {
  const [row] = await rows<{ found: string | null }>(
    sql`select to_regclass(${name})::text as found`,
  );
  return row!.found !== null;
};

const columns = async (table: string) =>
  (
    await rows<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'platform' and table_name = ${table}`)
  ).map((row) => row.column_name);

describe("what migration 84 dropped", () => {
  it.each(["contributions", "projectReportContributions", "projectMembers"])(
    "has no platform.%s table",
    async (table) => {
      expect(await exists(`platform."${table}"`)).toBe(false);
    },
  );

  it("takes the legacy columns off projects and badgeAwards", async () => {
    const project = await columns("projects");
    for (const column of ["repos", "proposedBy", "approvedBy", "decidedAt"])
      expect(project).not.toContain(column);
    expect(await columns("badgeAwards")).not.toContain("contributionId");
  });

  it("leaves no constraint, index or policy behind that named them", async () => {
    expect(
      await rows(sql`
        select conname from pg_constraint
        where conname in ('projects_repos_count', 'projects_approvedBy_fkey', 'projects_proposedBy_fkey',
          'badgeAwards_contributionId_fkey', 'contributions_pkey', 'projectMembers_pkey',
          'projectReportContributions_pkey')`),
    ).toEqual([]);
    expect(
      await rows(sql`
        select indexname from pg_indexes
        where schemaname = 'platform'
          and (indexname like 'contributions\\_%' or indexname like 'projectMembers\\_%'
            or indexname like 'projectReportContributions\\_%')`),
    ).toEqual([]);
  });

  it("leaves nothing in the catalog that still refers to a dropped object", async () => {
    // A function, view or trigger that named a dropped table would fail at
    // call time, not now; this reads their text.
    expect(
      await rows(sql`
        select p.proname from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('platform', 'auth')
          and p.prosrc ~ 'platform\\."?(contributions|projectMembers|projectReportContributions)"?\\y'`),
    ).toEqual([]);
    expect(
      await rows(sql`
        select viewname from pg_views
        where schemaname = 'platform'
          and definition ~ 'platform\\."?(contributions|projectMembers|projectReportContributions)"?\\y'`),
    ).toEqual([]);
  });

  it("keeps what the redesign uses: the repository links, the legacyEvidence mark and the EL view", async () => {
    // The link table's own approvedBy and decidedAt are not the project's.
    expect(await columns("projectRepos")).toEqual(
      expect.arrayContaining(["approvedBy", "decidedAt"]),
    );
    expect(await columns("hackathons")).toEqual(
      expect.arrayContaining(["approvedBy", "decidedAt"]),
    );
    expect(await columns("projectReports")).toContain("legacyEvidence");
    expect(await columns("projects")).toEqual(
      expect.arrayContaining(["slug", "advisorId", "status", "name"]),
    );
    await expect(
      rows(sql`select count(*) from platform."memberElEvidence"`),
    ).resolves.toBeDefined();
  });
});

// ── Account deletion, end to end ───────────────────────────────────────────

async function repo() {
  await db.execute(sql`
    insert into platform."githubRepos" ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch")
    values (${REPO}, 4084, 'd84owner', 'repo', 'User', 'main')
    on conflict do nothing`);
}

async function project(name: string, advisor: string | null) {
  await repo();
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into platform.projects (name, slug, status, "advisorId")
      values (${name}, ${name.toLowerCase().replace(/\s+/gu, "-")}, 'active', ${advisor}::uuid)
      returning id`);
    await tx.execute(sql`
      insert into platform."projectRepos"
        ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt", "approvedBy")
      values (${row!.id}::uuid, ${REPO}, 'approved', 'officer', 4084, now(), ${OFFICER}::uuid)`);
    return row!.id;
  });
}

async function commit(n: number, userId: string) {
  await repo();
  await db.execute(sql`
    insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${sha(n)}, ${REPO}, 4084, 'd84', ${userId}::uuid, '2026-10-10T16:00:00Z'::timestamptz, ${`Commit ${n}`})`);
  await db.execute(sql`
    insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
    values (${REPO}, ${sha(n)}, 'main')`);
}

async function report(projectId: string, userId: string, n: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into platform."projectReports" ("projectId", "userId", "startDate", "endDate", hours, content)
      values (${projectId}::uuid, ${userId}::uuid, '2026-10-01', '2026-10-14', 4, ${words(100)})
      returning id`);
    await tx.execute(sql`
      insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId")
      values (${row!.id}::uuid, ${sha(n)}, ${REPO})`);
    return row!.id;
  });
}

describe("account deletion after the drop (Q168)", () => {
  it("removes a member who owns, reports on and advises a project, and keeps the project and everyone else's work", async () => {
    const mine = await project("D84 Everything", MEMBER);
    await db.execute(sql`
      insert into platform."projectOwners" ("projectId", "userId", "addedBy")
      values (${mine}::uuid, ${MEMBER}::uuid, ${OFFICER}::uuid), (${mine}::uuid, ${ADVISOR}::uuid, ${MEMBER}::uuid)`);
    await commit(1, MEMBER);
    await commit(2, ADVISOR);
    const gone = await report(mine, MEMBER, 1);
    const kept = await report(mine, ADVISOR, 2);
    await db.execute(sql`
      update platform."projectReports"
      set status = 'approved', "approvedHours" = 4, "reviewedAt" = now(), "reviewedBy" = ${MEMBER}::uuid
      where id = ${kept}::uuid`);
    await db.execute(sql`
      insert into platform."badgeAwards" ("userId", "badgeId", method, repeatable, "commitSha")
      values (${MEMBER}::uuid, 'first-commit', 'automatic', false, ${sha(1)}),
             (${ADVISOR}::uuid, 'first-commit', 'automatic', false, ${sha(2)})
      on conflict do nothing`);
    // The commit trigger awards First Commit itself; either way each holds one.
    expect(
      await rows(
        sql`select 1 from platform."badgeAwards" where "userId" in (${MEMBER}::uuid, ${ADVISOR}::uuid) and "badgeId" = 'first-commit'`,
      ),
    ).toHaveLength(2);

    await deleteMembers([MEMBER]);

    const count = async (query: ReturnType<typeof sql>) =>
      (await rows(query)).length;
    expect(
      await count(
        sql`select 1 from platform."projectReports" where id = ${gone}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectReportCommits" where sha = ${sha(1)}`,
      ),
    ).toBe(0);
    expect(
      await count(sql`select 1 from platform.commits where sha = ${sha(1)}`),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."badgeAwards" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select 1 from platform."projectOwners" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    // The project stays, waiting for a new advisor; the other member's work
    // and the reviewer reference of the deleted member are intact or nulled.
    const [after] = await rows<{ advisorId: string | null }>(
      sql`select "advisorId" from platform.projects where id = ${mine}::uuid`,
    );
    expect(after).toEqual({ advisorId: null });
    const [review] = await rows<{ reviewedBy: string | null; status: string }>(
      sql`select "reviewedBy", status from platform."projectReports" where id = ${kept}::uuid`,
    );
    expect(review).toEqual({ reviewedBy: null, status: "approved" });
    expect(
      await count(
        sql`select 1 from platform."projectReportCommits" where sha = ${sha(2)}`,
      ),
    ).toBe(1);
    expect(
      await count(
        sql`select 1 from platform."badgeAwards" where "userId" = ${ADVISOR}::uuid`,
      ),
    ).toBe(1);

    await deleteMembers([ADVISOR, OFFICER]);
    expect(
      await count(
        sql`select 1 from platform.projects where id = ${mine}::uuid`,
      ),
    ).toBe(1);
  });
});
