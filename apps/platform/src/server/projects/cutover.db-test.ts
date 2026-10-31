// @vitest-environment node
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { pgFailure } from "./dbErrors";

/**
 * The projects cutover (D7, migration 83) against a real database: the
 * conversion of legacy rows, the two deferred guards (an active project needs
 * an approved repository link, a report needs a cited commit), the self-review
 * check, and the EL evidence view over commit citations. The guards fire at
 * commit, so each "refused" case runs as its own statement or transaction.
 * Fixture ids are all `d7...`, projects are named `D7 ...`, and everything is
 * swept before and after each test.
 */

const id = (n: number) =>
  `d7000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const REVIEWER = id(2);
const ALL = [MEMBER, REVIEWER] as const;
const REPO0 = 94_000_000;
const MIGRATION = new URL(
  "../../../../../supabase/migrations/20261031140000_83_platform_projects_cutover.sql",
  import.meta.url,
);

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const sha = (n: number) => `d7${n.toString(16).padStart(38, "0")}`;
const rows = <T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
) => db.execute<T>(query);

/** What the database refused with, or a failure if it accepted. */
async function refusal(attempt: Promise<unknown>) {
  try {
    await attempt;
  } catch (error) {
    const failure = pgFailure(error);
    if (!failure) throw error;
    return failure;
  }
  throw new Error("The database accepted what it should have refused.");
}

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  await db.transaction(async (tx) => {
    // Fixture cleanup may leave an active project without a link, or a report
    // without a citation, while it sweeps: skip the triggers, as the other
    // project db-tests do.
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."projectReportCommits" where sha like 'd7%'`);
    await tx.execute(sql`
      delete from platform."projectReports"
      where "userId" in (${ids})
         or "projectId" in (select id from platform.projects where name like 'D7 %')`);
    await tx.execute(sql`
      delete from platform."projectRepos"
      where "projectId" in (select id from platform.projects where name like 'D7 %')`);
    await tx.execute(sql`delete from platform.projects where name like 'D7 %'`);
    await tx.execute(
      sql`delete from platform."repoCommits" where sha like 'd7%'`,
    );
    await tx.execute(sql`delete from platform.commits where sha like 'd7%'`);
    await tx.execute(sql`
      delete from platform."repoSyncState"
      where "githubRepoId" between ${REPO0} and ${REPO0 + 99}`);
    await tx.execute(sql`
      delete from platform."githubRepos"
      where "githubRepoId" between ${REPO0} and ${REPO0 + 99}`);
    await tx.execute(
      sql`delete from platform."badgeAwards" where "userId" in (${ids})`,
    );
  });
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, handle: "d7-member" });
  await insertMember({ id: REVIEWER, handle: "d7-reviewer" });
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function repo(n: number) {
  await db.execute(sql`
    insert into platform."githubRepos" ("githubRepoId", "ownerId", owner, name, "ownerType", "defaultBranch")
    values (${REPO0 + n}, ${4000 + n}, ${`d7owner${n}`}, ${`repo-${n}`}, 'User', 'main')
    on conflict do nothing`);
  return REPO0 + n;
}

/** A project and its approved links, in the one transaction the guard requires. */
async function project(
  name: string,
  opts: { status?: "active" | "archived"; repos?: number[] } = {},
) {
  const { status = "active", repos = [1] } = opts;
  for (const n of repos) await repo(n);
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into platform.projects (name, slug, status)
      values (${name}, ${name.toLowerCase().replace(/\s+/gu, "-")}, ${status})
      returning id`);
    for (const n of repos)
      await tx.execute(sql`
        insert into platform."projectRepos"
          ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
        values (${row!.id}::uuid, ${REPO0 + n}, 'approved', 'personal', ${4000 + n}, now())`);
    return row!.id;
  });
}

/** A stored commit of `userId` on repo 1 with its default-branch provenance. */
async function commit(
  shaN: number,
  at = "2026-10-10T16:00:00Z",
  userId = MEMBER,
) {
  await repo(1);
  await db.execute(sql`
    insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${sha(shaN)}, ${REPO0 + 1}, 4000, 'd7', ${userId}::uuid, ${at}::timestamptz, ${`Commit ${shaN}`})`);
  await db.execute(sql`
    insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch")
    values (${REPO0 + 1}, ${sha(shaN)}, 'main')`);
  return sha(shaN);
}

const REPORT_COLUMNS = sql`"projectId", "userId", "startDate", "endDate", hours, content`;

/** A submitted report with its citations, in one transaction. */
async function report(projectId: string, shas: number[]) {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into platform."projectReports" (${REPORT_COLUMNS})
      values (${projectId}::uuid, ${MEMBER}::uuid, '2026-10-01', '2026-10-14', 4, ${words(100)})
      returning id`);
    for (const n of shas)
      await tx.execute(sql`
        insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId")
        values (${row!.id}::uuid, ${sha(n)}, ${REPO0 + 1})`);
    return row!.id;
  });
}

const approve = sql`status = 'approved', "approvedHours" = 4, "reviewedAt" = now(), "reviewedBy" = ${REVIEWER}::uuid`;

// ── Legacy rows ─────────────────────────────────────────────────────────────

class Rollback extends Error {}

describe("converting legacy rows (the migration's own SQL, rolled back)", () => {
  /** Sections 2 and 3 of the migration: slugs, then statuses. */
  function conversion(): string[] {
    const text = readFileSync(MIGRATION, "utf8");
    const from = text.indexOf("-- 2. ");
    const to = text.indexOf("-- 4. ");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    return text
      .slice(from, to)
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join("\n")
      .split(/\n\s*\n/u)
      .map((statement) => statement.trim())
      .filter(Boolean);
  }

  it("slugs every row and archives what has no approved repository", async () => {
    const statements = conversion();
    expect(statements).toHaveLength(2);
    let result: { name: string; slug: string; status: string }[] = [];
    await db
      .transaction(async (tx) => {
        // Put the table back into its pre-cutover shape inside this
        // transaction (DDL is transactional): slug nullable, four statuses.
        await tx.execute(
          sql`alter table platform.projects alter column slug drop not null`,
        );
        await tx.execute(
          sql`alter table platform.projects drop constraint projects_status_choices`,
        );
        await tx.execute(sql`
          insert into platform."githubRepos" ("githubRepoId", "ownerId", owner, name, "ownerType")
          values (${REPO0 + 1}, 4001, 'd7owner1', 'repo-1', 'User'), (${REPO0 + 2}, 4002, 'd7owner2', 'repo-2', 'User')
          on conflict do nothing`);
        await tx.execute(sql`
          insert into platform.projects (name, status, slug, "createdAt") values
            ('D7 Proposed', 'proposed', null, '2026-01-01'),
            ('D7 Declined', 'declined', null, '2026-01-02'),
            ('D7 Linked', 'active', null, '2026-01-03'),
            ('D7 Unlinked', 'active', null, '2026-01-04'),
            ('D7 Pending Only', 'active', null, '2026-01-05'),
            ('D7 Twin', 'active', null, '2026-01-06'),
            ('D7-Twin', 'active', null, '2026-01-07'),
            ('D7 Toolkit', 'archived', null, '2026-01-08'),
            ('Toolkit', 'archived', null, '2026-01-09'),
            ('D7 Café Über', 'active', null, '2026-01-10'),
            ('D7 Slugged', 'active', 'd7-slugged', '2026-01-11'),
            ('D7 Slugged!', 'active', null, '2026-01-12'),
            ('D7 Archived', 'archived', null, '2026-01-13'),
            ('!!', 'archived', null, '2026-01-14')`);
        const link = (name: string, repoN: number, approval: string) =>
          tx.execute(sql`
            insert into platform."projectRepos"
              ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
            select id, ${REPO0 + repoN}, ${approval}, 'personal', ${4000 + repoN},
              ${approval === "pending" ? null : sql`now()`}
            from platform.projects where name = ${name}`);
        await link("D7 Declined", 1, "approved");
        await link("D7 Linked", 1, "approved");
        await link("D7 Pending Only", 2, "pending");
        await link("D7 Twin", 1, "approved");
        await link("D7-Twin", 1, "approved");
        await link("D7 Café Über", 1, "approved");
        await link("D7 Slugged", 1, "approved");
        await link("D7 Slugged!", 1, "approved");

        for (const statement of statements)
          await tx.execute(sql.raw(statement));
        result = await tx.execute<{
          name: string;
          slug: string;
          status: string;
        }>(
          sql`select name, slug, status from platform.projects order by "createdAt", name`,
        );
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });

    const byName = new Map(result.map((row) => [row.name, row]));
    const slug = (name: string) => byName.get(name)?.slug;
    const status = (name: string) => byName.get(name)?.status;

    // No slug is left null, every one is well formed, and all are distinct.
    expect(result.length).toBeGreaterThanOrEqual(14);
    for (const row of result)
      expect(row.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/u);
    expect(new Set(result.map((row) => row.slug)).size).toBe(result.length);

    // Statuses: proposed and declined archive, active keeps only an approved link.
    expect(status("D7 Proposed")).toBe("archived");
    expect(status("D7 Declined")).toBe("archived");
    expect(status("D7 Linked")).toBe("active");
    expect(status("D7 Unlinked")).toBe("archived");
    expect(status("D7 Pending Only")).toBe("archived");
    expect(status("D7 Archived")).toBe("archived");
    expect(status("D7 Twin")).toBe("active");

    // Slugs: the name's words, the older of a collision keeping the plain form.
    expect(slug("D7 Proposed")).toBe("d7-proposed");
    expect(slug("D7 Café Über")).toBe("d7-cafe-uber");
    expect(slug("D7 Twin")).toBe("d7-twin");
    expect(slug("D7-Twin")).toMatch(/^d7-twin-[0-9a-f]{8}$/u);
    expect(slug("D7 Slugged")).toBe("d7-slugged");
    expect(slug("D7 Slugged!")).toMatch(/^d7-slugged-[0-9a-f]{8}$/u);
    // A reserved namespace never becomes a slug; a name with no words is "project".
    expect(slug("Toolkit")).toMatch(/^toolkit-[0-9a-f]{8}$/u);
    expect(slug("!!")).toMatch(/^project(-[0-9a-f]{8})?$/u);
  });

  it("leaves the seeded platform project alone", async () => {
    const [seeded] = await rows<{ slug: string; status: string }>(
      sql`select slug, status from platform.projects where id = 'd1000000-0000-4000-a000-000000000001'`,
    );
    expect(seeded).toEqual({ slug: "platform", status: "active" });
  });
});

// ── The final shape of projects ─────────────────────────────────────────────

describe("projects after the cutover", () => {
  it("requires a slug, keeps it plainly unique, and allows two statuses", async () => {
    await expect(
      db.execute(
        sql`insert into platform.projects (name, status) values ('D7 No Slug', 'archived')`,
      ),
    ).rejects.toMatchObject({ cause: { code: "23502" } });
    await project("D7 First", { repos: [1] });
    const clash = await refusal(
      db.execute(sql`
        insert into platform.projects (name, slug, status)
        values ('D7 Second', 'd7-first', 'archived')`),
    );
    expect(clash).toMatchObject({
      code: "23505",
      constraint: "projects_slug_key",
    });
    const status = await refusal(
      db.execute(sql`
        insert into platform.projects (name, slug, status)
        values ('D7 Proposed', 'd7-proposed', 'proposed')`),
    );
    expect(status.constraint).toBe("projects_status_choices");
    // A constraint, not the old partial index.
    expect(
      await rows(sql`
        select conname from pg_constraint
        where conrelid = 'platform.projects'::regclass and conname = 'projects_slug_key' and contype = 'u'`),
    ).toHaveLength(1);
    expect(
      await rows(sql`
        select 1 from pg_indexes
        where schemaname = 'platform' and indexname = 'projects_slug_key' and indexdef like '%WHERE%'`),
    ).toHaveLength(0);
  });

  it("defaults a new project to active", async () => {
    await repo(1);
    const [row] = await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into platform.projects (id, name, slug)
        values (${id(10)}::uuid, 'D7 Default', 'd7-default')`);
      await tx.execute(sql`
        insert into platform."projectRepos"
          ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
        values (${id(10)}::uuid, ${REPO0 + 1}, 'approved', 'personal', 4001, now())`);
      return tx.execute<{ status: string }>(
        sql`select status from platform.projects where id = ${id(10)}::uuid`,
      );
    });
    expect(row!.status).toBe("active");
  });
});

// ── An active project has an approved repository ────────────────────────────

describe("the approved-repository guard", () => {
  it("refuses an active project with no approved link, at commit", async () => {
    const failure = await refusal(
      db.execute(sql`
        insert into platform.projects (name, slug, status)
        values ('D7 Bare', 'd7-bare', 'active')`),
    );
    expect(failure.message).toContain("approved repository link");
    expect(
      await rows(sql`select 1 from platform.projects where name = 'D7 Bare'`),
    ).toHaveLength(0);
  });

  it("refuses a pending-only link, and accepts creating and linking in one transaction", async () => {
    await repo(1);
    await repo(2);
    await refusal(
      db.transaction(async (tx) => {
        await tx.execute(sql`
          insert into platform.projects (id, name, slug, status)
          values (${id(11)}::uuid, 'D7 Pending', 'd7-pending', 'active')`);
        await tx.execute(sql`
          insert into platform."projectRepos"
            ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId")
          values (${id(11)}::uuid, ${REPO0 + 2}, 'pending', 'officer', 4002)`);
      }),
    );
    // The one-transaction create-and-link is what `project()` does.
    const created = await project("D7 Created", { repos: [1] });
    expect(
      await rows(
        sql`select status from platform.projects where id = ${created}::uuid`,
      ),
    ).toEqual([{ status: "active" }]);
  });

  it("refuses removing or declining the last approved link of an active project", async () => {
    const mine = await project("D7 Last Link", { repos: [1] });
    await refusal(
      db.execute(sql`
        delete from platform."projectRepos" where "projectId" = ${mine}::uuid`),
    );
    await refusal(
      db.execute(sql`
        update platform."projectRepos" set approval = 'declined'
        where "projectId" = ${mine}::uuid`),
    );
    expect(
      await rows(
        sql`select approval from platform."projectRepos" where "projectId" = ${mine}::uuid`,
      ),
    ).toEqual([{ approval: "approved" }]);
  });

  it("lets a transaction replace the links, or archive and then drop them", async () => {
    const mine = await project("D7 Replace", { repos: [1] });
    await repo(2);
    // Replace: link the new repo, unlink the old, in one transaction.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into platform."projectRepos"
          ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt")
        values (${mine}::uuid, ${REPO0 + 2}, 'approved', 'personal', 4002, now())`);
      await tx.execute(sql`
        delete from platform."projectRepos"
        where "projectId" = ${mine}::uuid and "githubRepoId" = ${REPO0 + 1}`);
    });
    // Archive, then decline the last link.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`update platform.projects set status = 'archived' where id = ${mine}::uuid`,
      );
      await tx.execute(sql`
        update platform."projectRepos" set approval = 'declined'
        where "projectId" = ${mine}::uuid`);
    });
    // And an archived project cannot come back without an approved link.
    await refusal(
      db.execute(
        sql`update platform.projects set status = 'active' where id = ${mine}::uuid`,
      ),
    );
  });

  it("skips the check when the project itself is deleted", async () => {
    const mine = await project("D7 Delete Me", { repos: [1] });
    await db.execute(
      sql`delete from platform.projects where id = ${mine}::uuid`,
    );
    expect(
      await rows(sql`select 1 from platform.projects where id = ${mine}::uuid`),
    ).toHaveLength(0);
  });
});

// ── A report cites a commit ─────────────────────────────────────────────────

describe("the citation minimum", () => {
  it("refuses a report with no citation, at commit", async () => {
    const mine = await project("D7 Uncited", { repos: [1] });
    const failure = await refusal(
      db.execute(sql`
        insert into platform."projectReports" (${REPORT_COLUMNS})
        values (${mine}::uuid, ${MEMBER}::uuid, '2026-10-01', '2026-10-14', 4, ${words(100)})`),
    );
    expect(failure.message).toContain("at least one cited commit");
    expect(
      await rows(
        sql`select 1 from platform."projectReports" where "projectId" = ${mine}::uuid`,
      ),
    ).toHaveLength(0);
  });

  it("accepts a report and its citations in one transaction, for every status", async () => {
    const mine = await project("D7 Cited", { repos: [1] });
    await commit(1);
    const reportId = await report(mine, [1]);
    // Returned and approved keep the rule, and keep passing it.
    await db.execute(sql`
      update platform."projectReports"
      set status = 'returned', "reviewedAt" = now(), "reviewNote" = 'Revise'
      where id = ${reportId}::uuid`);
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${reportId}::uuid`,
    );
  });

  it("refuses removing the last citation, and lets a transaction replace it", async () => {
    const mine = await project("D7 Replace Cite", { repos: [1] });
    await commit(1);
    await commit(2);
    await commit(3);
    const reportId = await report(mine, [1, 2]);
    // One of two may go.
    await db.execute(
      sql`delete from platform."projectReportCommits" where sha = ${sha(1)}`,
    );
    const failure = await refusal(
      db.execute(
        sql`delete from platform."projectReportCommits" where sha = ${sha(2)}`,
      ),
    );
    expect(failure.message).toContain("at least one cited commit");
    // Swapping the last one for another, in one transaction, is fine.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`delete from platform."projectReportCommits" where sha = ${sha(2)}`,
      );
      await tx.execute(sql`
        insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId")
        values (${reportId}::uuid, ${sha(3)}, ${REPO0 + 1})`);
    });
    expect(
      await rows(
        sql`select sha from platform."projectReportCommits" where "reportId" = ${reportId}::uuid`,
      ),
    ).toEqual([{ sha: sha(3) }]);
  });

  it("serializes two transactions each removing one of two citations", async () => {
    const mine = await project("D7 Race", { repos: [1] });
    await commit(1);
    await commit(2);
    const reportId = await report(mine, [1, 2]);
    const remove = (shaN: number) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`delete from platform."projectReportCommits" where sha = ${sha(shaN)}`,
        );
      });
    const results = await Promise.allSettled([remove(1), remove(2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      await rows(
        sql`select 1 from platform."projectReportCommits" where "reportId" = ${reportId}::uuid`,
      ),
    ).toHaveLength(1);
  });

  it("rechecks the citations when the author, project or dates change", async () => {
    const mine = await project("D7 Edit", { repos: [1] });
    const other = await project("D7 Other", { repos: [2] });
    await commit(1, "2026-10-10T16:00:00Z");
    await commit(2, "2026-10-12T16:00:00Z");
    const reportId = await report(mine, [1]);
    // A range that leaves the cited commit outside it.
    const dates = await refusal(
      db.execute(sql`
        update platform."projectReports"
        set "startDate" = '2026-11-01', "endDate" = '2026-11-02'
        where id = ${reportId}::uuid`),
    );
    expect(dates.message).toContain("ineligible");
    // Another author's report cannot keep the member's commit.
    await refusal(
      db.execute(
        sql`update platform."projectReports" set "userId" = ${REVIEWER}::uuid where id = ${reportId}::uuid`,
      ),
    );
    // Another project's repositories do not cover it.
    await refusal(
      db.execute(
        sql`update platform."projectReports" set "projectId" = ${other}::uuid where id = ${reportId}::uuid`,
      ),
    );
    // Moving the range and swapping the citation together is one valid state.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        update platform."projectReports"
        set "startDate" = '2026-10-12', "endDate" = '2026-10-12'
        where id = ${reportId}::uuid`);
      await tx.execute(
        sql`delete from platform."projectReportCommits" where sha = ${sha(1)}`,
      );
      await tx.execute(sql`
        insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId")
        values (${reportId}::uuid, ${sha(2)}, ${REPO0 + 1})`);
    });
  });

  it("does not recheck eligibility when only the review changes", async () => {
    const mine = await project("D7 Review Only", { repos: [1] });
    await commit(1);
    const reportId = await report(mine, [1]);
    // The repository link is declined later (the project is archived first):
    // an accepted citation stays accepted through a review.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`update platform.projects set status = 'archived' where id = ${mine}::uuid`,
      );
      await tx.execute(sql`
        update platform."projectRepos" set approval = 'declined'
        where "projectId" = ${mine}::uuid`);
    });
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${reportId}::uuid`,
    );
  });

  it("is a no-op when the report itself is deleted, a cascade included", async () => {
    const mine = await project("D7 Cascade", { repos: [1] });
    await commit(1);
    const reportId = await report(mine, [1]);
    await db.execute(
      sql`delete from platform."projectReports" where id = ${reportId}::uuid`,
    );
    expect(
      await rows(
        sql`select 1 from platform."projectReportCommits" where sha = ${sha(1)}`,
      ),
    ).toHaveLength(0);
    // The member's account takes reports, commits and citations together.
    await commit(4);
    await report(mine, [4]);
    await deleteMembers([MEMBER]);
    expect(
      await rows(
        sql`select 1 from platform."projectReports" where "projectId" = ${mine}::uuid`,
      ),
    ).toHaveLength(0);
  });

  it("exempts a report marked legacyEvidence, and nothing else", async () => {
    const mine = await project("D7 Legacy", { repos: [1] });
    await db.execute(sql`
      insert into platform."projectReports" (${REPORT_COLUMNS}, "legacyEvidence")
      values (${mine}::uuid, ${MEMBER}::uuid, '2026-10-01', '2026-10-14', 4, ${words(100)}, true)`);
    const [legacy] = await rows<{ id: string }>(
      sql`select id from platform."projectReports" where "projectId" = ${mine}::uuid`,
    );
    // It can be reviewed with no citation, and still counts for nothing as evidence.
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${legacy!.id}::uuid`,
    );
    expect(
      await rows(
        sql`select 1 from platform."memberElEvidence" where "evidenceId" = ${legacy!.id}::uuid`,
      ),
    ).toHaveLength(0);
    // The default is false: an ordinary insert is held to the rule.
    expect(
      await rows(sql`
        select column_default from information_schema.columns
        where table_schema = 'platform' and table_name = 'projectReports' and column_name = 'legacyEvidence'`),
    ).toEqual([{ column_default: "false" }]);
  });
});

// ── Self-review ─────────────────────────────────────────────────────────────

describe("the self-review check", () => {
  it("refuses a report reviewed by its own author", async () => {
    const mine = await project("D7 Self", { repos: [1] });
    await commit(1);
    const reportId = await report(mine, [1]);
    const failure = await refusal(
      db.execute(sql`
        update platform."projectReports"
        set status = 'approved', "approvedHours" = 4, "reviewedAt" = now(), "reviewedBy" = "userId"
        where id = ${reportId}::uuid`),
    );
    expect(failure).toMatchObject({
      code: "23514",
      constraint: "projectReports_reviewedBy_not_author",
    });
    // Another reviewer, or none (a deleted reviewer), is fine.
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${reportId}::uuid`,
    );
    await deleteMembers([REVIEWER]);
    expect(
      await rows(
        sql`select "reviewedBy" from platform."projectReports" where id = ${reportId}::uuid`,
      ),
    ).toEqual([{ reviewedBy: null }]);
  });
});

// ── EL evidence ─────────────────────────────────────────────────────────────

describe("memberElEvidence over commit citations", () => {
  const evidence = () =>
    rows<{ evidenceId: string; hours: string; projectId: string }>(sql`
      select "evidenceId", hours::text, "projectId"
      from platform."memberElEvidence"
      where "userId" = ${MEMBER}::uuid and "evidenceType" = 'project_report'
      order by "evidenceId"`);

  it("counts an approved report with citations once, however many it has", async () => {
    const mine = await project("D7 Evidence", { repos: [1] });
    await commit(1);
    await commit(2);
    await commit(3);
    const reportId = await report(mine, [1, 2, 3]);
    expect(await evidence()).toEqual([]);
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${reportId}::uuid`,
    );
    expect(await evidence()).toEqual([
      { evidenceId: reportId, hours: "4.00", projectId: mine },
    ]);
  });

  it("sums two reports separately and ignores unapproved or uncited ones", async () => {
    const mine = await project("D7 Evidence Two", { repos: [1] });
    await commit(1);
    await commit(2);
    await commit(3);
    const first = await report(mine, [1, 2]);
    const second = await report(mine, [3]);
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${first}::uuid`,
    );
    // Returned: not evidence.
    await db.execute(sql`
      update platform."projectReports"
      set status = 'returned', "reviewedAt" = now(), "reviewNote" = 'Revise'
      where id = ${second}::uuid`);
    expect(await evidence()).toHaveLength(1);
    // Approved legacy report with no citation: not evidence either.
    await db.execute(sql`
      insert into platform."projectReports"
        (${REPORT_COLUMNS}, status, "approvedHours", "reviewedAt", "legacyEvidence")
      values (${mine}::uuid, ${MEMBER}::uuid, '2026-09-01', '2026-09-14', 3, ${words(100)},
        'approved', 3, now(), true)`);
    expect(await evidence()).toHaveLength(1);
    await db.execute(
      sql`update platform."projectReports" set ${approve} where id = ${second}::uuid`,
    );
    const both = await evidence();
    expect(both).toHaveLength(2);
    expect(both.reduce((sum, row) => sum + Number(row.hours), 0)).toBe(8);
  });

  it("leaves the workshop branch as it was", async () => {
    expect(
      await rows(sql`
        select 1 from platform."memberElEvidence"
        where "userId" = ${MEMBER}::uuid and "evidenceType" = 'workshop'`),
    ).toHaveLength(0);
  });
});
