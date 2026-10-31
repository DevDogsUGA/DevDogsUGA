// @vitest-environment node
/**
 * The sweep job's lease and the member backfill queue. These need
 * `platform."commitBackfillRequests"` (D1), which `claimJob` also reads.
 *
 * The queue is shared by every session on the local database, so each fixture
 * request is dated 1970 and the tests claim "the oldest due" only against it.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  insertMember,
  deleteMembers,
} from "~/server/loaders/publicProfileFixtures";
import {
  claimBackfill,
  claimJob,
  completeBackfill,
  failBackfill,
  releaseBackfill,
  releaseJob,
  saveBackfillPage,
  saveRepo,
  type Commit,
} from "./store";
import type { Repo } from "./repos";

const A = "d2820000-0000-4000-a000-0000000000a1";
const B = "d2820000-0000-4000-a000-0000000000b1";
const REPO = "91820010";
const SHA = "d285" + "0".repeat(36);
const repo: Repo = {
  id: Number(REPO),
  private: false,
  name: "backfill-fixture",
  owner: { id: 183, login: "fixture", type: "User" },
  default_branch: "main",
};

/** Queues (or re-queues) a request the way the identity trigger does. */
async function request(userId: string, githubId: string, requestedAt: string) {
  await db.execute(sql`
    insert into platform."commitBackfillRequests" ("userId","githubId","requestedAt")
    values (${userId}::uuid, ${githubId}::bigint, ${requestedAt}::timestamptz)
    on conflict ("userId") do update set "githubId"=excluded."githubId",
      "requestedAt"=excluded."requestedAt", "completedAt"=null, "leaseUntil"=null,
      "leaseToken"=null, "lastError"=null, attempts=0`);
}
const row = async (userId: string) =>
  (
    await db.execute<{
      completedAt: Date | null;
      attempts: number;
      lastError: string | null;
      leased: boolean;
    }>(
      sql`select "completedAt", attempts, "lastError", "leaseUntil" > now() as leased from platform."commitBackfillRequests" where "userId"=${userId}::uuid`,
    )
  )[0]!;
const commit = (author: number, sha = SHA): Commit => ({
  sha,
  author: { id: author, login: "x" },
  commit: { committer: { date: "2026-10-30T12:00:00Z" }, message: "m" },
});

async function cleanup() {
  await db.execute(
    sql`delete from platform."repoCommits" where "githubRepoId"=${REPO}::bigint`,
  );
  await db.execute(
    sql`delete from platform.commits where "githubRepoId"=${REPO}::bigint`,
  );
  await deleteMembers([A, B]);
  await db.execute(
    sql`delete from platform."githubRepos" where "githubRepoId"=${REPO}::bigint`,
  );
}
async function members() {
  for (const [id, provider] of [
    [A, "183001"],
    [B, "183002"],
  ] as const) {
    await insertMember({ id, github: null });
    await db.execute(
      sql`insert into auth.identities (id,user_id,provider,provider_id,identity_data) values (gen_random_uuid(),${id}::uuid,'github',${provider},'{"user_name":"m"}'::jsonb)`,
    );
  }
}
beforeEach(async () => {
  await cleanup();
  await members();
  await saveRepo(repo);
  await request(A, "183001", "1970-01-01T00:00:00Z");
  await request(B, "183002", "1970-01-02T00:00:00Z");
});
afterAll(cleanup);

describe("backfill queue", () => {
  it("hands out the oldest due request, one lease each", async () => {
    const first = await claimBackfill();
    const second = await claimBackfill();
    expect(first).toMatchObject({ userId: A, githubId: "183001" });
    expect(second).toMatchObject({ userId: B, githubId: "183002" });
    expect(first!.leaseToken).not.toBe(second!.leaseToken);
  });

  it("lets an expired lease be reclaimed and refuses the old holder", async () => {
    const stale = await claimBackfill();
    await db.execute(
      sql`update platform."commitBackfillRequests" set "leaseUntil"=now()-interval '1 second' where "userId"=${A}::uuid`,
    );
    const fresh = await claimBackfill();
    expect(fresh).toMatchObject({ userId: A });
    expect(fresh!.leaseToken).not.toBe(stale!.leaseToken);
    expect(await saveBackfillPage(stale!, REPO, "main", [commit(183001)])).toBe(
      false,
    );
    expect(await completeBackfill(stale!)).toBe(false);
    expect((await row(A)).completedAt).toBeNull();
    expect(await completeBackfill(fresh!)).toBe(true);
  });

  it("stores only members' commits, under the request's lease", async () => {
    const lease = await claimBackfill();
    const stranger = "d286" + "0".repeat(36);
    expect(
      await saveBackfillPage(lease!, REPO, "main", [
        commit(183001),
        commit(999999, stranger),
      ]),
    ).toBe(true);
    expect(
      await db.execute(
        sql`select sha,"userId" from platform.commits where "githubRepoId"=${REPO}::bigint`,
      ),
    ).toMatchObject([{ sha: SHA, userId: A }]);
    expect(
      await db.execute(
        sql`select 1 from platform."repoCommits" where "githubRepoId"=${REPO}::bigint`,
      ),
    ).toHaveLength(1);
  });

  it("completes a request once, and never hands it out again", async () => {
    const lease = await claimBackfill();
    expect(await completeBackfill(lease!)).toBe(true);
    expect(await row(A)).toMatchObject({ attempts: 0, lastError: null });
    expect((await row(A)).completedAt).not.toBeNull();
    expect(await completeBackfill(lease!)).toBe(false);
    expect((await claimBackfill())?.userId).toBe(B);
  });

  it("keeps a request re-made mid-walk pending instead of completing it", async () => {
    const lease = await claimBackfill();
    // The identity trigger's upsert: requestedAt moves, completedAt clears.
    await db.execute(
      sql`update platform."commitBackfillRequests" set "requestedAt"=now() where "userId"=${A}::uuid`,
    );
    expect(await completeBackfill(lease!)).toBe(false);
    expect((await row(A)).completedAt).toBeNull();
    await releaseBackfill(lease!);
    const again = await claimBackfill();
    expect(again?.userId).toBe(B);
    await releaseBackfill(again!);
    await db.execute(
      sql`update platform."commitBackfillRequests" set "requestedAt"='1970-01-01' where "userId"=${A}::uuid`,
    );
    const redo = await claimBackfill();
    expect(redo).toMatchObject({ userId: A });
    expect(await completeBackfill(redo!)).toBe(true);
  });

  it("backs a failed request off, counts the attempt, and gives up after eight", async () => {
    const lease = await claimBackfill();
    await failBackfill(lease!, "x".repeat(900));
    expect(await row(A)).toMatchObject({ attempts: 1, leased: true });
    expect((await row(A)).lastError).toHaveLength(500);
    expect((await claimBackfill())?.userId).toBe(B);
    await db.execute(
      sql`update platform."commitBackfillRequests" set "leaseUntil"=null, attempts=8 where "userId"=${A}::uuid`,
    );
    expect((await claimBackfill())?.userId).toBe(B);
  });

  it("gives a lease back without penalty", async () => {
    const lease = await claimBackfill();
    await releaseBackfill(lease!);
    expect(await row(A)).toMatchObject({ attempts: 0, leased: null });
    expect((await claimBackfill())?.userId).toBe(A);
  });
});

describe("sweep job", () => {
  type Snapshot = Record<string, unknown>;
  let jobRow: Snapshot | undefined;
  let heartbeatRow: Snapshot | undefined;
  const reset = (cursor: string) =>
    db.execute(
      sql`update platform."projectSyncJobs" set "leaseUntil"=null,"leaseToken"=null,"nextAttemptAt"=null,cursor=${cursor}::jsonb where job='commit-sync'`,
    );
  beforeAll(async () => {
    [jobRow] = await db.execute<Snapshot>(
      sql`select to_jsonb(j) as row from platform."projectSyncJobs" j where job='commit-sync'`,
    );
    [heartbeatRow] = await db.execute<Snapshot>(
      sql`select to_jsonb(h) as row from platform."jobHeartbeats" h where job='platform-commit-sync'`,
    );
  });
  afterAll(async () => {
    // Put the shared job and heartbeat rows back as they were found.
    if (jobRow)
      await db.execute(
        sql`update platform."projectSyncJobs" j set ("leaseToken","leaseUntil","lastAttemptAt","lastSucceededAt","nextAttemptAt",cursor,"lastError",attempts)=(select "leaseToken","leaseUntil","lastAttemptAt","lastSucceededAt","nextAttemptAt",cursor,"lastError",attempts from jsonb_populate_record(null::platform."projectSyncJobs",${JSON.stringify(jobRow.row)}::jsonb)) where job='commit-sync'`,
      );
    if (heartbeatRow)
      await db.execute(
        sql`update platform."jobHeartbeats" set "succeededAt"=(${JSON.stringify(heartbeatRow.row)}::jsonb->>'succeededAt')::timestamptz where job='platform-commit-sync'`,
      );
  });

  it("starts a sweep on the daily call and refuses a second holder", async () => {
    await reset("{}");
    const first = await claimJob(true);
    expect(first?.cursor).toEqual({
      phase: "inventory",
      inventory: 1,
      sweep: true,
    });
    expect(await claimJob(true)).toBeUndefined();
    expect(await claimJob(false)).toBeUndefined();
  });

  it("continues a cycle in progress without starting a new one", async () => {
    await reset('{"phase":"repos","sweep":true,"after":"5"}');
    const job = await claimJob(false);
    expect(job?.cursor).toEqual({ phase: "repos", sweep: true, after: "5" });
  });

  it("a continuation with no cycle runs only for a pending backfill, as a backfill-only cursor", async () => {
    await reset("{}");
    const job = await claimJob(false);
    expect(job?.cursor).toEqual({ phase: "backfill" });
  });

  it("a daily start replaces a backfill-only cursor, so the cycle can report", async () => {
    await reset('{"phase":"backfill"}');
    expect((await claimJob(true))?.cursor).toMatchObject({
      phase: "inventory",
      sweep: true,
    });
  });

  it("completion is fenced by the lease, and only a clean sweep writes the heartbeat", async () => {
    await reset("{}");
    await db.execute(
      sql`update platform."jobHeartbeats" set "succeededAt"='2000-01-01' where job='platform-commit-sync'`,
    );
    const heartbeat = async () =>
      (
        await db.execute<{ fresh: boolean }>(
          sql`select "succeededAt" > now()-interval '1 minute' as fresh from platform."jobHeartbeats" where job='platform-commit-sync'`,
        )
      )[0]!.fresh;

    const first = await claimJob(true);
    await db.execute(
      sql`update platform."projectSyncJobs" set "leaseUntil"=now()-interval '1 second' where job='commit-sync'`,
    );
    const second = await claimJob(true);
    expect(await releaseJob(first!.leaseToken, {}, true, true)).toBe(false);
    expect(await heartbeat()).toBe(false);

    // Complete but not a clean sweep: cursor cleared, no heartbeat.
    expect(await releaseJob(second!.leaseToken, {}, true, false)).toBe(true);
    expect(await heartbeat()).toBe(false);

    const third = await claimJob(true);
    expect(await releaseJob(third!.leaseToken, {}, true, true)).toBe(true);
    expect(await heartbeat()).toBe(true);
  });

  it("keeps the cursor and does not report success when the cycle is unfinished", async () => {
    await reset("{}");
    const lastSucceeded = async () =>
      (
        await db.execute<{ at: string | null }>(
          sql`select "lastSucceededAt"::text as at from platform."projectSyncJobs" where job='commit-sync'`,
        )
      )[0]!.at;
    const before = await lastSucceeded();
    const job = await claimJob(true);
    expect(
      await releaseJob(
        job!.leaseToken,
        { phase: "repos", sweep: true, after: "7" },
        false,
        true,
        "boom".repeat(300),
        new Date(Date.now() - 1000),
      ),
    ).toBe(true);
    const [state] = await db.execute<{
      cursor: Record<string, unknown>;
      lastError: string;
    }>(
      sql`select cursor,"lastError" from platform."projectSyncJobs" where job='commit-sync'`,
    );
    expect(state!.cursor).toEqual({ phase: "repos", sweep: true, after: "7" });
    expect(state!.lastError).toHaveLength(500);
    expect(await lastSucceeded()).toBe(before);
  });
});
