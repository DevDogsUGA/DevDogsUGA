// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import type { DevpostHackathon } from "./devpost";
import { claimJob, releaseJob, upsertDevpostHackathon } from "./store";

/**
 * The Devpost sync's writes against a real database (D4; Q32, D0 section 5):
 * what an upsert does to a new link, a known id, a member's or officer's row
 * and a declined one; that nothing is deleted; and the lease that fences a
 * stale worker. Fixtures use Devpost ids in a private range and links under
 * `https://d4-*.example.com`, swept before and after each test. The job row
 * and the heartbeat are the real shared rows, so they are restored.
 */

const MEMBER = "d4000000-0000-4000-a000-000000000001";
const BASE = 94_280_000;
const link = (n: number | string) => `https://d4-${n}.example.com/`;

const item = (
  n: number,
  over: Partial<DevpostHackathon> = {},
): DevpostHackathon => ({
  devpostId: BASE + n,
  name: `D4 Hack ${n}`,
  url: link(n),
  location: "Online",
  openState: "open",
  dateLabel: "Oct 01 - Nov 12, 2026",
  startsOn: "2026-10-01",
  endsOn: "2026-11-12",
  ...over,
});

type Row = {
  id: string;
  source: string;
  devpostId: string | null;
  url: string;
  name: string;
  approval: string;
  openState: string | null;
  startsOn: string | null;
  approvedBy: string | null;
  lastSeenAt: Date | null;
};
async function rows(like = "https://d4-%"): Promise<Row[]> {
  return db.execute<Row>(sql`
    select id, source, "devpostId"::text as "devpostId", url, name, approval,
      "openState", "startsOn"::text as "startsOn", "approvedBy", "lastSeenAt"
    from platform.hackathons where url like ${like} order by url`);
}
async function insertOther(
  n: number,
  approval: "pending" | "approved" | "declined",
  name = `D4 Member ${n}`,
) {
  const [row] = await db.execute<{ id: string }>(sql`
    insert into platform.hackathons (source, url, name, location, approval, "submittedBy", "startsOn", "endsOn")
    values ('other', ${link(n)}, ${name}, '', ${approval}, ${MEMBER}::uuid, '2026-12-01', '2026-12-03')
    returning id`);
  return row!.id;
}

let originalJob: Record<string, unknown> | undefined;
let originalBeat: Date | undefined;

async function cleanup() {
  await db.execute(
    sql`delete from platform.hackathons where url like 'https://d4-%'`,
  );
}

beforeAll(async () => {
  await cleanup();
  [originalJob] = await db.execute(
    sql`select * from platform."projectSyncJobs" where job='devpost-sync'`,
  );
  const [beat] = await db.execute<{ succeededAt: Date }>(
    sql`select "succeededAt" from platform."jobHeartbeats" where job='platform-devpost-sync'`,
  );
  originalBeat = beat?.succeededAt;
});
afterAll(async () => {
  await cleanup();
  await deleteMembers([MEMBER]);
  await db.execute(
    sql`delete from platform."projectSyncJobs" where job='devpost-sync'`,
  );
  if (originalJob)
    await db.execute(sql`
      insert into platform."projectSyncJobs" (job, "leaseToken", "leaseUntil", "lastAttemptAt",
        "lastSucceededAt", "nextAttemptAt", cursor, "lastError", attempts)
      values ('devpost-sync', ${originalJob.leaseToken as string | null}::uuid,
        ${(originalJob.leaseUntil as Date | null)?.toISOString() ?? null}::timestamptz,
        ${(originalJob.lastAttemptAt as Date | null)?.toISOString() ?? null}::timestamptz,
        ${(originalJob.lastSucceededAt as Date | null)?.toISOString() ?? null}::timestamptz,
        ${(originalJob.nextAttemptAt as Date | null)?.toISOString() ?? null}::timestamptz,
        ${JSON.stringify(originalJob.cursor)}::jsonb, ${originalJob.lastError as string | null},
        ${originalJob.attempts as number})`);
  if (originalBeat)
    await db.execute(
      sql`update platform."jobHeartbeats" set "succeededAt"=${originalBeat.toISOString()}::timestamptz where job='platform-devpost-sync'`,
    );
});
beforeEach(async () => {
  await cleanup();
  await deleteMembers([MEMBER]);
  await insertMember({ id: MEMBER, handle: "d4-member" });
});

describe("upsertDevpostHackathon", () => {
  it("inserts a new Devpost record as approved, online, with its dates", async () => {
    expect(await upsertDevpostHackathon(item(1))).toBe("inserted");
    const [row] = await rows();
    expect(row).toMatchObject({
      source: "devpost",
      devpostId: String(BASE + 1),
      url: link(1),
      name: "D4 Hack 1",
      approval: "approved",
      openState: "open",
      startsOn: "2026-10-01",
    });
    expect(row!.lastSeenAt).toBeInstanceOf(Date);
    const [online] = await db.execute<{ online: boolean }>(
      sql`select online from platform.hackathons where url=${link(1)}`,
    );
    expect(online!.online).toBe(true);
  });

  it("is idempotent: the same item again is one row, refreshed", async () => {
    await upsertDevpostHackathon(item(1));
    const [first] = await rows();
    expect(
      await upsertDevpostHackathon(
        item(1, { name: "D4 Hack One", openState: "upcoming" }),
      ),
    ).toBe("updated");
    expect(
      await upsertDevpostHackathon(
        item(1, { name: "D4 Hack One", openState: "upcoming" }),
      ),
    ).toBe("updated");
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: first!.id,
      name: "D4 Hack One",
      openState: "upcoming",
    });
    expect(all[0]!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
      first!.lastSeenAt!.getTime(),
    );
  });

  it("clears dates the feed no longer gives", async () => {
    await upsertDevpostHackathon(item(1));
    await upsertDevpostHackathon(
      item(1, { dateLabel: "TBA", startsOn: null, endsOn: null }),
    );
    expect((await rows())[0]!.startsOn).toBeNull();
  });

  it("moves a known event to its new link, unless another record holds that link", async () => {
    await upsertDevpostHackathon(item(1));
    expect(await upsertDevpostHackathon(item(1, { url: link("1-new") }))).toBe(
      "updated",
    );
    expect((await rows()).map((r) => r.url)).toEqual([link("1-new")]);
    await upsertDevpostHackathon(item(2));
    expect(
      await upsertDevpostHackathon(
        item(2, { url: link("1-new"), name: "D4 Renamed" }),
      ),
    ).toBe("conflict");
    const all = await rows();
    const byId = (n: number) =>
      all.find((r) => r.devpostId === String(BASE + n));
    expect(byId(2)).toMatchObject({
      url: link(2),
      name: "D4 Renamed",
    });
    expect(byId(1)?.url).toBe(link("1-new"));
  });

  it("never deletes: a record missing from later feeds stays", async () => {
    await upsertDevpostHackathon(item(1));
    await upsertDevpostHackathon(item(2));
    await upsertDevpostHackathon(item(2));
    expect(await rows()).toHaveLength(2);
  });

  it("lets a pending member submission take the Devpost identity, keeping its row id", async () => {
    const id = await insertOther(3, "pending");
    expect(await upsertDevpostHackathon(item(3))).toBe("attached");
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id,
      source: "devpost",
      devpostId: String(BASE + 3),
      approval: "approved",
      name: "D4 Hack 3",
    });
    const [decided] = await db.execute<{ decidedAt: Date | null }>(
      sql`select "decidedAt" from platform.hackathons where id=${id}::uuid`,
    );
    expect(decided!.decidedAt).toBeInstanceOf(Date);
    // And from then on it is an ordinary Devpost record.
    expect(await upsertDevpostHackathon(item(3))).toBe("updated");
  });

  it("attaches to an approved member row too, and keeps who approved it", async () => {
    const id = await insertOther(4, "approved");
    await db.execute(
      sql`update platform.hackathons set "approvedBy"=${MEMBER}::uuid, "decidedAt"=now() where id=${id}::uuid`,
    );
    expect(await upsertDevpostHackathon(item(4))).toBe("attached");
    expect((await rows())[0]).toMatchObject({
      id,
      source: "devpost",
      approvedBy: MEMBER,
    });
  });

  it("leaves a declined member row alone", async () => {
    const id = await insertOther(5, "declined", "D4 Declined");
    expect(await upsertDevpostHackathon(item(5))).toBe("conflict");
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id,
      source: "other",
      approval: "declined",
      name: "D4 Declined",
      devpostId: null,
    });
  });

  it("leaves a link held by another Devpost id alone", async () => {
    await upsertDevpostHackathon(item(6));
    expect(await upsertDevpostHackathon(item(7, { url: link(6) }))).toBe(
      "conflict",
    );
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.devpostId).toBe(String(BASE + 6));
  });

  it("stores one row when the same item is upserted concurrently", async () => {
    const results = await Promise.all([
      upsertDevpostHackathon(item(8)),
      upsertDevpostHackathon(item(8)),
      upsertDevpostHackathon(item(8)),
    ]);
    expect(results.filter((r) => r === "inserted")).toHaveLength(1);
    expect(results.every((r) => r === "inserted" || r === "updated")).toBe(
      true,
    );
    expect(await rows()).toHaveLength(1);
  });

  it("settles to one row when a member submits the same link as Devpost's insert", async () => {
    const submit = db.execute(sql`
      insert into platform.hackathons (source, url, name, location, approval, "submittedBy")
      values ('other', ${link(9)}, 'D4 Raced', '', 'pending', ${MEMBER}::uuid)
      on conflict (url) do nothing`);
    const [upserted] = await Promise.all([
      upsertDevpostHackathon(item(9)),
      submit,
    ]);
    expect(["inserted", "attached"]).toContain(upserted);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      source: "devpost",
      devpostId: String(BASE + 9),
    });
  });
});

describe("the job lease", () => {
  beforeEach(async () => {
    await db.execute(
      sql`delete from platform."projectSyncJobs" where job='devpost-sync'`,
    );
  });
  const state = async () => {
    const [row] = await db.execute<{
      leaseToken: string | null;
      cursor: Record<string, unknown>;
      attempts: number;
      lastError: string | null;
      lastSucceededAt: Date | null;
      nextAttemptAt: Date | null;
    }>(
      sql`select "leaseToken", cursor, attempts, "lastError", "lastSucceededAt", "nextAttemptAt" from platform."projectSyncJobs" where job='devpost-sync'`,
    );
    return row!;
  };
  const beat = async () => {
    const [row] = await db.execute<{ succeededAt: Date }>(
      sql`select "succeededAt" from platform."jobHeartbeats" where job='platform-devpost-sync'`,
    );
    return row?.succeededAt;
  };
  const expire = () =>
    db.execute(
      sql`update platform."projectSyncJobs" set "leaseUntil"=now()-interval '1 second' where job='devpost-sync'`,
    );
  const end = (over = {}) => ({
    cursor: {},
    succeeded: false,
    heartbeat: false,
    ...over,
  });

  it("inserts a missing job row, and a daily start begins at page 1", async () => {
    const job = await claimJob(true);
    expect(job?.cursor).toMatchObject({
      page: 1,
      seen: [],
      idless: 0,
      failures: 0,
    });
    expect(job?.leaseToken).toMatch(/^[0-9a-f-]{36}$/u);
    expect((await state()).attempts).toBe(1);
  });

  it("holds the lease against a second claimant until it is released or expires", async () => {
    const first = await claimJob(true);
    expect(await claimJob(true)).toBeUndefined();
    expect(await claimJob(false)).toBeUndefined();
    expect(await releaseJob(first!.leaseToken, end())).toBe(true);
    expect(await claimJob(true)).toBeDefined();
    await expire();
    expect(await claimJob(true)).toBeDefined();
  });

  it("starts nothing on a continuation when no cycle is in progress", async () => {
    const held = await claimJob(true);
    await releaseJob(held!.leaseToken, end({ cursor: {} }));
    expect(await claimJob(false)).toBeUndefined();
  });

  it("resumes a cycle in progress from its saved cursor", async () => {
    const first = await claimJob(true);
    await releaseJob(
      first!.leaseToken,
      end({ cursor: { page: 4, seen: [1, 2, 3], idless: 0, failures: 0 } }),
    );
    const resumed = await claimJob(false);
    expect(resumed?.cursor).toMatchObject({ page: 4, seen: [1, 2, 3] });
  });

  it("holds a continuation back until its retry time, but a daily start is not held back", async () => {
    const first = await claimJob(true);
    await releaseJob(
      first!.leaseToken,
      end({
        cursor: { page: 2, seen: [1], failures: 2 },
        error: "Devpost answered 429.",
        retryAt: new Date(Date.now() + 3_600_000),
      }),
    );
    expect(await claimJob(false)).toBeUndefined();
    const daily = await claimJob(true);
    expect(daily?.cursor).toMatchObject({ page: 1, seen: [], failures: 2 });
    await releaseJob(
      daily!.leaseToken,
      end({
        cursor: { page: 2, failures: 2 },
        retryAt: new Date(Date.now() - 1000),
      }),
    );
    expect(await claimJob(false)).toBeDefined();
  });

  it("fences a worker whose lease expired: it cannot release, or write the heartbeat", async () => {
    const stale = await claimJob(true);
    await expire();
    const fresh = await claimJob(true);
    const before = await beat();
    expect(
      await releaseJob(
        stale!.leaseToken,
        end({
          cursor: { page: 99 },
          succeeded: true,
          heartbeat: true,
          error: "stale",
        }),
      ),
    ).toBe(false);
    expect(await beat()).toEqual(before);
    const during = await state();
    expect(during.leaseToken).toBe(fresh!.leaseToken);
    expect(during.lastError).toBeNull();
    expect(during.cursor).toMatchObject({ page: 1 });
    expect(
      await releaseJob(fresh!.leaseToken, end({ cursor: { page: 2 } })),
    ).toBe(true);
  });

  it("fences a release with a token that was never issued", async () => {
    await claimJob(true);
    expect(
      await releaseJob("00000000-0000-4000-8000-000000000000", end()),
    ).toBe(false);
  });

  it("writes the heartbeat and lastSucceededAt only for a clean, heartbeat-bearing release", async () => {
    await db.execute(
      sql`update platform."jobHeartbeats" set "succeededAt"='2020-01-01T00:00:00Z' where job='platform-devpost-sync'`,
    );
    const failed = await claimJob(true);
    await releaseJob(failed!.leaseToken, end({ error: "boom" }));
    expect((await beat())!.getFullYear()).toBe(2020);
    expect((await state()).lastSucceededAt).toBeNull();
    expect((await state()).lastError).toBe("boom");

    const ok = await claimJob(true);
    await releaseJob(ok!.leaseToken, end({ succeeded: true, heartbeat: true }));
    expect((await beat())!.getFullYear()).toBeGreaterThan(2020);
    const done = await state();
    expect(done.lastSucceededAt).toBeInstanceOf(Date);
    expect(done.lastError).toBeNull();
    expect(done.cursor).toEqual({});
  });

  it("creates the heartbeat row if the migration's row is missing", async () => {
    await db.execute(
      sql`delete from platform."jobHeartbeats" where job='platform-devpost-sync'`,
    );
    const job = await claimJob(true);
    await releaseJob(
      job!.leaseToken,
      end({ succeeded: true, heartbeat: true }),
    );
    expect(await beat()).toBeInstanceOf(Date);
  });

  it("holds a cursor of the largest size a cycle keeps within the column's limit", async () => {
    const job = await claimJob(true);
    const seen = Array.from({ length: 1000 }, (_, i) => 9_999_000 + i);
    expect(
      await releaseJob(
        job!.leaseToken,
        end({ cursor: { page: 50, seen, idless: 0, failures: 6 } }),
      ),
    ).toBe(true);
  });
});
