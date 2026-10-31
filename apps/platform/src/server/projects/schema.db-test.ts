// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";

const id = (n: number) =>
  `d1780000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const MEMBER = id(1),
  ACTOR = id(2),
  PROJECT = id(3),
  REPORT = id(4),
  REPORT2 = id(5),
  EVENT = id(6),
  ENTRY = id(7);
const SHA = "d178" + "0".repeat(36);
const OTHER_SHA = "d178" + "1".repeat(36);
const REPO = 91780001;
const query = (text: string) => db.execute(sql.raw(text));
async function cleanup() {
  await db.transaction(async (tx) => {
    // Fixture cleanup must also remove deliberately frozen and DevDogs-owned rows.
    await tx.execute(sql`set local session_replication_role = replica`);
    for (const text of [
      `delete from platform."projectReportCommits" where sha in ('${SHA}','${OTHER_SHA}')`,
      `delete from platform."projectReports" where "projectId" = '${PROJECT}'`,
      `delete from platform."submissionMembers" where "submissionId" = '${ENTRY}'`,
      `delete from platform.submissions where id = '${ENTRY}'`,
      `delete from platform.hackathons where id = '${EVENT}'`,
      `delete from platform."projectDocsProposals" where "projectId" = '${PROJECT}'`,
      `delete from platform."projectOwners" where "projectId" = '${PROJECT}'`,
      `delete from platform."projectRepos" where "projectId" = '${PROJECT}'`,
      `delete from platform.projects where id = '${PROJECT}'`,
      `delete from platform."badgeAwards" where "userId" in ('${MEMBER}','${ACTOR}')`,
      `delete from platform."repoCommits" where sha in ('${SHA}','${OTHER_SHA}')`,
      `delete from platform.commits where sha in ('${SHA}','${OTHER_SHA}')`,
      `delete from platform."repoSyncState" where "githubRepoId" between ${REPO} and ${REPO + 20}`,
      `delete from platform."githubRepos" where "githubRepoId" between ${REPO} and ${REPO + 20}`,
    ])
      await tx.execute(sql.raw(text));
  });
  await deleteMembers([MEMBER, ACTOR]);
}
beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await insertMember({ id: MEMBER, github: null });
  await insertMember({ id: ACTOR, github: null });
  // Archived: an active project needs an approved repository link by commit
  // (require_approved_repo), and several tests here start with no link.
  await query(
    `insert into platform.projects (id, name, slug, status) values ('${PROJECT}', 'D178 schema fixture', 'd178-fixture', 'archived')`,
  );
  await query(
    `insert into platform."githubRepos" ("githubRepoId", "ownerId", owner, name, "ownerType") select n, 178, 'fixture', 'repo-' || n, 'User' from generate_series(${REPO}, ${REPO + 20}) n`,
  );
});
async function link(repo = REPO) {
  await query(
    `insert into platform."projectRepos" ("projectId", "githubRepoId", approval, "approvalBasis", "approvalOwnerId", "decidedAt", "linkedBy", "approvedBy") values ('${PROJECT}', ${repo}, 'approved', 'personal', 178, now(), '${ACTOR}', '${ACTOR}')`,
  );
}
/**
 * A report exempt from the citation minimum (`legacyEvidence`): these tests
 * are about the citation rules themselves, which cite after the report exists.
 * The minimum has its own file, cutover.db-test.ts.
 */
async function report(reportId = REPORT, user = MEMBER) {
  await db.execute(sql`insert into platform."projectReports" (id, "projectId", "userId", "startDate", "endDate", hours, content, "legacyEvidence")
    values (${reportId}::uuid, ${PROJECT}::uuid, ${user}::uuid, '2026-10-30', '2026-10-30', 1, ${"word ".repeat(100)}, true)`);
}
async function commit(
  user: string | null = MEMBER,
  date = "2026-10-31T03:59:59Z",
  sha = SHA,
) {
  await db.execute(sql`insert into platform.commits (sha, "githubRepoId", "authorGithubId", "authorLogin", "userId", "committedAt", message)
    values (${sha}, ${REPO}, 178, 'fixture-author', ${user}::uuid, ${date}::timestamptz, 'public metadata')`);
}
async function provenance(sha = SHA) {
  await query(
    `insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch") values (${REPO}, '${sha}', 'main')`,
  );
}
async function linkGithub(user: string, githubId: string) {
  await query(
    `insert into auth.identities (id, user_id, provider, provider_id, identity_data) values (gen_random_uuid(), '${user}', 'github', '${githubId}', '{"sub":"${githubId}"}')`,
  );
}
function cite(reportId = REPORT, repo = REPO) {
  return query(
    `insert into platform."projectReportCommits" ("reportId", sha, "githubRepoId") values ('${reportId}', '${SHA}', ${repo})`,
  );
}
async function submission() {
  await query(
    `insert into platform.hackathons (id, source, url, name, location, approval, "submittedBy", "approvedBy") values ('${EVENT}', 'other', 'https://d178.example/event', 'Fixture Event', 'Online', 'approved', '${ACTOR}', '${ACTOR}')`,
  );
  await query(
    `insert into platform.submissions (id, "projectId", "hackathonId", url, "recordedBy") values ('${ENTRY}', '${PROJECT}', '${EVENT}', 'https://d178.example/submission', '${ACTOR}')`,
  );
}

describe("D1 structure", () => {
  it("keeps plain edits working and the new fields defaulted", async () => {
    await query(
      `update platform.projects set name = 'D178 renamed', description = 'A description', repos = ARRAY['fixture/repo'], "advisorId" = '${ACTOR}' where id = '${PROJECT}'`,
    );
    const rows = await query(
      `select slug, featured, "inSwitcher", "devdogsOwned", status, repos, "advisorId" from platform.projects where id = '${PROJECT}'`,
    );
    expect(rows[0]).toMatchObject({
      slug: "d178-fixture",
      featured: false,
      inSwitcher: false,
      devdogsOwned: false,
      status: "archived",
      repos: ["fixture/repo"],
      advisorId: ACTOR,
    });
  });
  it.each([
    "bad_slug",
    "a",
    "AB",
    "two--hyphens",
    "toolkit",
    "workshops",
    "schedule-builder",
    "operations",
    "platform",
  ])("rejects invalid/reserved slug %s", async (slug) => {
    await expect(
      db.execute(
        sql`update platform.projects set slug = ${slug} where id = ${PROJECT}::uuid`,
      ),
    ).rejects.toThrow();
  });
  it("freezes published slugs, including after docs removal, and the publication timestamp", async () => {
    await query(
      `update platform.projects set slug = 'd178-project', "docsFirstPublishedAt" = now() where id = '${PROJECT}'`,
    );
    await query(
      `update platform.projects set "docsRequested" = false where id = '${PROJECT}'`,
    );
    await expect(
      query(
        `update platform.projects set slug = 'd178-other' where id = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
    await expect(
      query(
        `update platform.projects set "docsFirstPublishedAt" = null where id = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
  });
  it("allows unpublished slug edits, never a null slug", async () => {
    await query(
      `update platform.projects set slug = 'd178-project' where id = '${PROJECT}'`,
    );
    await expect(
      query(`update platform.projects set slug = null where id = '${PROJECT}'`),
    ).rejects.toMatchObject({ cause: { code: "23502" } });
  });
  it("makes DevDogs ownership irreversible and prevents deletion", async () => {
    await query(
      `update platform.projects set "devdogsOwned" = true where id = '${PROJECT}'`,
    );
    await expect(
      query(
        `update platform.projects set "devdogsOwned" = false where id = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
    await expect(
      query(`delete from platform.projects where id = '${PROJECT}'`),
    ).rejects.toThrow();
  });
  it("prevents deleting a project with reports", async () => {
    await report();
    await expect(
      query(`delete from platform.projects where id = '${PROJECT}'`),
    ).rejects.toThrow();
  });
  it("prevents deleting a project with submissions", async () => {
    await submission();
    await expect(
      query(`delete from platform.projects where id = '${PROJECT}'`),
    ).rejects.toThrow();
  });
  it("allows deleting an empty ordinary project", async () => {
    await query(`delete from platform.projects where id = '${PROJECT}'`);
  });
  it("allows ten links and rejects the eleventh", async () => {
    for (let n = 0; n < 10; n++) await link(REPO + n);
    await expect(link(REPO + 10)).rejects.toThrow();
  });
  it("serializes concurrent links at the ten-link boundary", async () => {
    for (let n = 0; n < 9; n++) await link(REPO + n);
    const result = await Promise.allSettled([link(REPO + 9), link(REPO + 10)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("freezes a slug while a docs proposal is opening or open", async () => {
    await query(
      `update platform.projects set slug = 'd178-project' where id = '${PROJECT}'`,
    );
    await query(
      `insert into platform."projectDocsProposals" ("projectId", enable, "githubRepoId", "ownerId", slug, "baseSha", state) values ('${PROJECT}', true, ${REPO}, 178, 'd178-project', '${SHA}', 'opening')`,
    );
    await expect(
      query(
        `update platform.projects set slug = 'd178-other' where id = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
    await query(
      `update platform."projectDocsProposals" set state = 'closed' where "projectId" = '${PROJECT}'`,
    );
    await query(
      `update platform.projects set slug = 'd178-other' where id = '${PROJECT}'`,
    );
  });
  it("requires an approved docs link and prevents unlinking it", async () => {
    await expect(
      query(
        `update platform.projects set "docsRepoId" = ${REPO} where id = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
    await link();
    await query(
      `update platform.projects set "docsRepoId" = ${REPO} where id = '${PROJECT}'`,
    );
    await expect(
      query(
        `delete from platform."projectRepos" where "projectId" = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
  });
});

describe("commit report evidence", () => {
  beforeEach(async () => {
    await link();
    await report();
  });
  it("exposes the stable SHA claim constraint name for report actions", async () => {
    const rows = await query(`select conname from pg_constraint
      where conrelid = 'platform."projectReportCommits"'::regclass and contype = 'u'`);
    expect(rows).toEqual([{ conname: "projectReportCommits_sha_key" }]);
  });
  it("uses inclusive Eastern dates, and counts a SHA only once including returned reports", async () => {
    await commit();
    await provenance();
    await cite();
    await report(REPORT2);
    await query(
      `update platform."projectReports" set status = 'returned', "reviewedAt" = now(), "reviewNote" = 'Revise' where id = '${REPORT}'`,
    );
    await expect(cite(REPORT2)).rejects.toThrow();
    await query(`delete from platform."projectReports" where id = '${REPORT}'`);
    await cite(REPORT2);
  });
  it("rejects one of two concurrent claims for the same SHA", async () => {
    await commit();
    await provenance();
    await report(REPORT2);
    const result = await Promise.allSettled([cite(), cite(REPORT2)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("rejects another member's commit", async () => {
    await commit(ACTOR);
    await provenance();
    await expect(cite()).rejects.toThrow();
  });
  it("requires observed default-branch provenance", async () => {
    await commit();
    await expect(cite()).rejects.toThrow();
  });
  it("allows a shared SHA through observed fork provenance, regardless of first-observed repo", async () => {
    await commit();
    await link(REPO + 1);
    await expect(cite(REPORT, REPO + 1)).rejects.toThrow();
    await query(
      `insert into platform."repoCommits" ("githubRepoId", sha, "defaultBranch") values (${REPO + 1}, '${SHA}', 'main')`,
    );
    await cite(REPORT, REPO + 1);
  });
  it("rejects a commit outside the Eastern date range", async () => {
    await commit(MEMBER, "2026-10-31T04:00:00Z");
    await provenance();
    await expect(cite()).rejects.toThrow();
  });
  it("rejects a pending link but preserves accepted evidence when the repo becomes unavailable", async () => {
    await commit();
    await provenance();
    await query(
      `update platform."projectRepos" set approval = 'pending', "decidedAt" = null where "projectId" = '${PROJECT}'`,
    );
    await expect(cite()).rejects.toThrow();
    await query(
      `update platform."projectRepos" set approval = 'approved', "decidedAt" = now() where "projectId" = '${PROJECT}'`,
    );
    await cite();
    await query(
      `update platform."githubRepos" set health = 'unavailable', "unavailableSince" = now() where "githubRepoId" = ${REPO}`,
    );
    expect(
      await query(
        `select sha from platform."projectReportCommits" where "reportId" = '${REPORT}'`,
      ),
    ).toHaveLength(1);
    await expect(
      query(
        `delete from platform."projectRepos" where "projectId" = '${PROJECT}'`,
      ),
    ).rejects.toThrow();
  });
});

describe("identity linking, awards and member erasure", () => {
  it("awards once without re-awarding a withdrawn badge", async () => {
    await commit();
    await provenance();
    expect(
      await query(
        `select id from platform."badgeAwards" where "userId" = '${MEMBER}' and "badgeId" = 'first-commit'`,
      ),
    ).toHaveLength(1);
    await query(
      `update platform."badgeAwards" set "withdrawnAt" = now(), "withdrawnReason" = 'Officer withdrew' where "userId" = '${MEMBER}'`,
    );
    await query(`select platform.award_first_commit('${MEMBER}')`);
    expect(
      await query(
        `select id from platform."badgeAwards" where "userId" = '${MEMBER}' and "withdrawnAt" is null`,
      ),
    ).toHaveLength(0);
  });
  it("stores members' commits only: a commit with no member is rejected", async () => {
    // Drizzle wraps the driver error; the not-null violation (23502) is its cause.
    await expect(commit(null)).rejects.toMatchObject({
      cause: { code: "23502" },
    });
    expect(
      await query(`select sha from platform.commits where sha = '${SHA}'`),
    ).toHaveLength(0);
  });
  it("enqueues a backfill request when a GitHub identity is linked, and resets it on relink", async () => {
    expect(
      await query(
        `select 1 from platform."commitBackfillRequests" where "userId" = '${MEMBER}'`,
      ),
    ).toHaveLength(0);
    await linkGithub(MEMBER, "178");
    const [first] = await query(
      `select "githubId"::text, "completedAt", attempts from platform."commitBackfillRequests" where "userId" = '${MEMBER}'`,
    );
    expect(first).toMatchObject({
      githubId: "178",
      completedAt: null,
      attempts: 0,
    });
    await query(
      `update platform."commitBackfillRequests" set "completedAt" = now(), "requestedAt" = now() - interval '1 day' where "userId" = '${MEMBER}'`,
    );
    await query(
      `delete from auth.identities where user_id = '${MEMBER}' and provider = 'github'`,
    );
    await linkGithub(MEMBER, "179");
    const rows = await query(
      `select "githubId"::text, "completedAt", "requestedAt" > now() - interval '1 hour' as fresh from platform."commitBackfillRequests" where "userId" = '${MEMBER}'`,
    );
    expect(rows).toEqual([{ githubId: "179", completedAt: null, fresh: true }]);
  });
  it("ignores non-GitHub identities and a GitHub provider id that is not a number", async () => {
    await query(
      `insert into auth.identities (id, user_id, provider, provider_id, identity_data) values (gen_random_uuid(), '${MEMBER}', 'discord', '178', '{"sub":"178"}')`,
    );
    await linkGithub(ACTOR, "not-a-number");
    await linkGithub(ACTOR, "99999999999999999999");
    expect(
      await query(
        `select 1 from platform."commitBackfillRequests" where "userId" in ('${MEMBER}','${ACTOR}')`,
      ),
    ).toHaveLength(0);
  });
  it("awards when provenance arrives after a matched commit", async () => {
    await commit();
    expect(
      await query(
        `select id from platform."badgeAwards" where "userId" = '${MEMBER}'`,
      ),
    ).toHaveLength(0);
    await provenance();
    expect(
      await query(
        `select "commitSha" from platform."badgeAwards" where "userId" = '${MEMBER}'`,
      ),
    ).toEqual([{ commitSha: SHA }]);
  });
  it("cascades member links, reports, badges and commits, and nulls every actor while retaining historical records", async () => {
    await link();
    await report();
    await commit();
    await provenance();
    await cite();
    await submission();
    await query(
      `insert into platform."projectOwners" ("projectId", "userId", "addedBy") values ('${PROJECT}', '${MEMBER}', '${ACTOR}'), ('${PROJECT}', '${ACTOR}', '${MEMBER}')`,
    );
    await query(
      `insert into platform."submissionMembers" ("submissionId", "userId") values ('${ENTRY}', '${MEMBER}')`,
    );
    await query(
      `insert into platform."projectDocsProposals" ("projectId", "requestedBy", enable, "githubRepoId", "ownerId", slug, "baseSha", state) values ('${PROJECT}', '${ACTOR}', true, ${REPO}, 178, 'd178-project', '${SHA}', 'open')`,
    );
    await query(
      `update platform.projects set "proposedBy" = '${ACTOR}', "approvedBy" = '${ACTOR}', "advisorId" = '${ACTOR}', "docsConfirmedBy" = '${ACTOR}', "docsConfirmedAt" = now() where id = '${PROJECT}'`,
    );
    await query(
      `update platform."projectReports" set "reviewedBy" = '${ACTOR}' where id = '${REPORT}'`,
    );
    await query(
      `update platform."badgeAwards" set method = 'manual', citation = 'Fixture', "awardedBy" = '${ACTOR}' where "userId" = '${MEMBER}'`,
    );
    await deleteMembers([ACTOR]);
    for (const [table, columns, where] of [
      [
        "projects",
        ["advisorId", "proposedBy", "approvedBy", "docsConfirmedBy"],
        `id = '${PROJECT}'`,
      ],
      ["projectOwners", ["addedBy"], `"projectId" = '${PROJECT}'`],
      [
        "projectRepos",
        ["linkedBy", "approvedBy"],
        `"projectId" = '${PROJECT}'`,
      ],
      ["projectReports", ["reviewedBy"], `id = '${REPORT}'`],
      ["badgeAwards", ["awardedBy"], `"userId" = '${MEMBER}'`],
      ["hackathons", ["submittedBy", "approvedBy"], `id = '${EVENT}'`],
      ["submissions", ["recordedBy"], `id = '${ENTRY}'`],
      ["projectDocsProposals", ["requestedBy"], `"projectId" = '${PROJECT}'`],
    ] as const) {
      const rows = await query(
        `select ${columns.map((c) => `"${c}"`).join(",")} from platform."${table}" where ${where}`,
      );
      expect(rows).toHaveLength(1);
      for (const value of Object.values(rows[0]!)) expect(value).toBeNull();
    }
    await deleteMembers([MEMBER]);
    for (const [table, where] of [
      ["projectOwners", `"projectId" = '${PROJECT}'`],
      ["projectReports", `"projectId" = '${PROJECT}'`],
      ["projectReportCommits", `sha = '${SHA}'`],
      ["badgeAwards", `"userId" = '${MEMBER}'`],
      ["submissionMembers", `"submissionId" = '${ENTRY}'`],
    ])
      expect(
        await query(`select * from platform."${table}" where ${where}`),
      ).toHaveLength(0);
    for (const table of ["commits", "repoCommits"])
      expect(
        await query(`select sha from platform."${table}" where sha = '${SHA}'`),
      ).toHaveLength(0);
    for (const [table, key] of [
      ["projects", PROJECT],
      ["hackathons", EVENT],
      ["submissions", ENTRY],
    ])
      expect(
        await query(`select id from platform."${table}" where id = '${key}'`),
      ).toHaveLength(1);
  });
  it("deletes a member's commits, provenance and citations with the account and leaves other members' rows alone", async () => {
    await link();
    await report();
    await commit();
    await provenance();
    await cite();
    await commit(ACTOR, "2026-10-31T03:59:59Z", OTHER_SHA);
    await provenance(OTHER_SHA);
    await linkGithub(MEMBER, "178");
    await deleteMembers([MEMBER]);
    for (const [table, where] of [
      ["commits", `sha = '${SHA}'`],
      ["repoCommits", `sha = '${SHA}'`],
      ["projectReportCommits", `sha = '${SHA}'`],
      ["commitBackfillRequests", `"userId" = '${MEMBER}'`],
    ])
      expect(
        await query(`select 1 from platform."${table}" where ${where}`),
      ).toHaveLength(0);
    for (const table of ["commits", "repoCommits"])
      expect(
        await query(
          `select sha from platform."${table}" where sha = '${OTHER_SHA}'`,
        ),
      ).toHaveLength(1);
  });
});
