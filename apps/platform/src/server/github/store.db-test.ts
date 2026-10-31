// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  claimRepo,
  interruptedRepoIds,
  markUnavailable,
  releaseRepo,
  saveCommitPage,
  saveRepo,
  saveStats,
  scopeRepos,
  checkpoint,
} from "./store";
import {
  insertMember,
  deleteMembers,
} from "~/server/loaders/publicProfileFixtures";
import type { Repo } from "./repos";
const MEMBER = "d2820000-0000-4000-a000-000000000001";
const PROJECT = "d2820000-0000-4000-a000-000000000002";
const ID = "91820001",
  SECOND = "91820002",
  SHA = "d282" + "0".repeat(36);
const repo: Repo = {
  id: Number(ID),
  private: false,
  name: "sync-fixture",
  owner: { id: 182, login: "fixture", type: "User" },
  default_branch: "main",
};
async function cleanup() {
  await db.execute(
    sql`update platform.projects set "docsRepoId"=null where id=${PROJECT}::uuid`,
  );
  await db.execute(
    sql`delete from platform."projectRepos" where "projectId"=${PROJECT}::uuid`,
  );
  await db.execute(
    sql`delete from platform.projects where id=${PROJECT}::uuid`,
  );
  await db.execute(
    sql`delete from platform."repoCommits" where "githubRepoId" in (${ID}::bigint,${SECOND}::bigint)`,
  );
  await db.execute(
    sql`delete from platform.commits where "githubRepoId" in (${ID}::bigint,${SECOND}::bigint)`,
  );
  await db.execute(
    sql`delete from platform."repoSyncState" where "githubRepoId" in (${ID}::bigint,${SECOND}::bigint)`,
  );
  await db.execute(
    sql`delete from platform."githubRepos" where "githubRepoId" in (${ID}::bigint,${SECOND}::bigint)`,
  );
}
beforeEach(async () => {
  await cleanup();
  await saveRepo(repo);
});
afterAll(cleanup);
describe("commit store", () => {
  it("marks privacy unavailable while retaining cached identity", async () => {
    await markUnavailable(ID);
    expect(
      await db.execute(
        sql`select health,owner from platform."githubRepos" where "githubRepoId"=${ID}::bigint`,
      ),
    ).toMatchObject([{ health: "unavailable", owner: "fixture" }]);
    await saveRepo(repo);
    expect(
      await db.execute(
        sql`select health,"unavailableSince" from platform."githubRepos" where "githubRepoId"=${ID}::bigint`,
      ),
    ).toMatchObject([{ health: "available", unavailableSince: null }]);
  });
  it("pauses docs on owner login change, but not a repo rename", async () => {
    await db.execute(
      sql`insert into platform.projects (id,name,slug,status) values (${PROJECT}::uuid,'D2 docs fixture','d2-docs-fixture','archived')`,
    );
    await db.execute(
      sql`insert into platform."projectRepos" ("projectId","githubRepoId",approval,"approvalBasis","approvalOwnerId","decidedAt") values (${PROJECT}::uuid,${ID}::bigint,'approved','personal',182,now())`,
    );
    await db.execute(
      sql`update platform.projects set "docsRepoId"=${ID}::bigint where id=${PROJECT}::uuid`,
    );
    await saveRepo({ ...repo, name: "rename" });
    expect(
      await db.execute(
        sql`select "docsPausedAt" from platform.projects where id=${PROJECT}::uuid`,
      ),
    ).toMatchObject([{ docsPausedAt: null }]);
    await saveRepo({ ...repo, owner: { ...repo.owner, login: "transferred" } });
    const [row] = await db.execute<{ paused: boolean }>(
      sql`select "docsPausedAt" is not null as paused from platform.projects where id=${PROJECT}::uuid`,
    );
    expect(row?.paused).toBe(true);
  });
  it("matches only numeric provider ids, never a reused login", async () => {
    await deleteMembers([MEMBER]);
    try {
      await insertMember({ id: MEMBER, github: null });
      await db.execute(
        sql`insert into auth.identities (id,user_id,provider,provider_id,identity_data) values (gen_random_uuid(),${MEMBER}::uuid,'github','918200001','{"user_name":"unrelated-login"}'::jsonb)`,
      );
      const lease = await claimRepo(ID);
      await saveCommitPage(
        ID,
        lease!.leaseToken,
        "main",
        [
          {
            sha: SHA,
            author: { id: 918200001, login: "old-login" },
            commit: {
              committer: { date: "2026-10-30T12:00:00Z" },
              message: "numeric match",
            },
          },
        ],
        2,
      );
      expect(
        await db.execute(
          sql`select "userId" from platform.commits where sha=${SHA}`,
        ),
      ).toMatchObject([{ userId: MEMBER }]);
    } finally {
      await deleteMembers([MEMBER]);
    }
  });
  it("upserts mutable cache without duplicating repository identity", async () => {
    await saveRepo({
      ...repo,
      name: "renamed",
      owner: { ...repo.owner, login: "new-owner" },
      default_branch: "next",
    });
    const rows = await db.execute(
      sql`select name,owner,"defaultBranch" from platform."githubRepos" where "githubRepoId"=${ID}::bigint`,
    );
    expect(rows).toMatchObject([
      { name: "renamed", owner: "new-owner", defaultBranch: "next" },
    ]);
  });
  it("inserts identity once and records both fork provenances", async () => {
    await deleteMembers([MEMBER]);
    try {
      await insertMember({ id: MEMBER, github: null });
      await db.execute(
        sql`insert into auth.identities (id,user_id,provider,provider_id,identity_data) values (gen_random_uuid(),${MEMBER}::uuid,'github','182','{"user_name":"original"}'::jsonb)`,
      );
      const first = await claimRepo(ID);
      const commit = {
        sha: SHA,
        author: { id: 182, login: "original" },
        commit: {
          committer: { date: "2026-10-30T12:00:00Z" },
          message: "original message",
        },
      };
      expect(
        await saveCommitPage(ID, first!.leaseToken, "main", [commit], 2),
      ).toBe(true);
      await saveRepo({ ...repo, id: Number(SECOND) });
      const second = await claimRepo(SECOND);
      // The same SHA reached through a fork, with the author's login since
      // renamed and a different message: the stored row must not move.
      await saveCommitPage(
        SECOND,
        second!.leaseToken,
        "main",
        [
          {
            ...commit,
            author: { id: 182, login: "renamed" },
            commit: { ...commit.commit, message: "other" },
          },
        ],
        2,
      );
      expect(
        await db.execute(
          sql`select "authorGithubId"::text as author,"authorLogin",message,"githubRepoId"::text as repo,"userId" from platform.commits where sha=${SHA}`,
        ),
      ).toMatchObject([
        {
          author: "182",
          authorLogin: "original",
          message: "original message",
          repo: ID,
          userId: MEMBER,
        },
      ]);
      expect(
        await db.execute(
          sql`select 1 from platform."repoCommits" where sha=${SHA}`,
        ),
      ).toHaveLength(2);
    } finally {
      await deleteMembers([MEMBER]);
    }
  });
  it("stores nothing for a commit whose author is not a linked member", async () => {
    await deleteMembers([MEMBER]);
    try {
      await insertMember({ id: MEMBER, github: null });
      await db.execute(
        sql`insert into auth.identities (id,user_id,provider,provider_id,identity_data) values (gen_random_uuid(),${MEMBER}::uuid,'github','182','{"user_name":"member"}'::jsonb)`,
      );
      const stranger = "d283" + "0".repeat(36);
      const lease = await claimRepo(ID);
      const at = { committer: { date: "2026-10-30T12:00:00Z" }, message: "m" };
      await saveCommitPage(
        ID,
        lease!.leaseToken,
        "main",
        [
          { sha: stranger, author: { id: 777, login: "stranger" }, commit: at },
          { sha: "d284" + "0".repeat(36), author: null, commit: at },
          { sha: SHA, author: { id: 182, login: "member" }, commit: at },
        ],
        2,
      );
      expect(
        await db.execute(
          sql`select sha from platform.commits where "githubRepoId"=${ID}::bigint`,
        ),
      ).toMatchObject([{ sha: SHA }]);
      expect(
        await db.execute(
          sql`select 1 from platform."repoCommits" where "githubRepoId"=${ID}::bigint`,
        ),
      ).toHaveLength(1);
      expect(
        await db.execute(
          sql`select 1 from platform.commits where "authorLogin"='stranger' or "authorGithubId"=777`,
        ),
      ).toHaveLength(0);
    } finally {
      await deleteMembers([MEMBER]);
    }
  });
  it("settles size once, keeping no file count when truncated", async () => {
    await deleteMembers([MEMBER]);
    try {
      await insertMember({ id: MEMBER, github: null });
      await db.execute(
        sql`insert into auth.identities (id,user_id,provider,provider_id,identity_data) values (gen_random_uuid(),${MEMBER}::uuid,'github','182','{"user_name":"member"}'::jsonb)`,
      );
      const lease = await claimRepo(ID);
      await saveCommitPage(
        ID,
        lease!.leaseToken,
        "main",
        [
          {
            sha: SHA,
            author: { id: 182, login: "member" },
            commit: {
              committer: { date: "2026-10-30T12:00:00Z" },
              message: "m",
            },
          },
        ],
        2,
      );
      await saveStats(SHA, {
        state: "truncated",
        files: null,
        additions: 9,
        deletions: 3,
      });
      // A second settle is ignored: only a pending commit is touched.
      await saveStats(SHA, { state: "unavailable" });
      expect(
        await db.execute(
          sql`select "statsState",files,additions::int,deletions::int from platform.commits where sha=${SHA}`,
        ),
      ).toMatchObject([
        { statsState: "truncated", files: null, additions: 9, deletions: 3 },
      ]);
    } finally {
      await deleteMembers([MEMBER]);
    }
  });
  it("scopes the sweep to public org repos and approved links, not pending ones", async () => {
    await db.execute(
      sql`insert into platform.projects (id,name,slug,status) values (${PROJECT}::uuid,'D2 scope fixture','d2-scope-fixture','archived')`,
    );
    const linked = async (approval: string) => {
      await db.execute(
        sql`delete from platform."projectRepos" where "projectId"=${PROJECT}::uuid`,
      );
      await db.execute(
        sql`insert into platform."projectRepos" ("projectId","githubRepoId",approval,"approvalBasis","approvalOwnerId","decidedAt") values (${PROJECT}::uuid,${ID}::bigint,${approval},'officer',182,${approval === "pending" ? null : sql`now()`})`,
      );
      return (await scopeRepos("0", 1000)).map((r) => r.id);
    };
    expect(await linked("pending")).not.toContain(ID);
    expect(await linked("declined")).not.toContain(ID);
    expect(await linked("approved")).toContain(ID);
    // The seeded platform repo is a DevDogsUGA repo and always in scope.
    expect(await scopeRepos("0", 1000)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "792882166" })]),
    );
    expect((await scopeRepos(ID, 1000)).map((r) => r.id)).not.toContain(ID);
  });
  it("lists only unleased, due scans with a pinned head for resumption", async () => {
    const lease = await claimRepo(ID);
    await checkpoint(ID, lease!.leaseToken, SHA, null, true);
    expect(await interruptedRepoIds(1000)).not.toContain(ID);
    await releaseRepo(ID, lease!.leaseToken, false);
    expect(await interruptedRepoIds(1000)).toContain(ID);
    await db.execute(
      sql`update platform."repoSyncState" set "nextAttemptAt"=now()+interval '1 hour' where "githubRepoId"=${ID}::bigint`,
    );
    expect(await interruptedRepoIds(1000)).not.toContain(ID);
  });
  it("excludes concurrent claims and fences stale page writes and completion", async () => {
    const first = await claimRepo(ID);
    expect(await claimRepo(ID)).toBeUndefined();
    await db.execute(
      sql`update platform."repoSyncState" set "leaseUntil"=now()-interval '1 second' where "githubRepoId"=${ID}::bigint`,
    );
    const second = await claimRepo(ID);
    expect(second!.leaseToken).not.toBe(first!.leaseToken);
    expect(await saveCommitPage(ID, first!.leaseToken, "main", [], 99)).toBe(
      false,
    );
    expect(await releaseRepo(ID, first!.leaseToken, true)).toBe(false);
    expect(await releaseRepo(ID, second!.leaseToken, true)).toBe(true);
  });
});
