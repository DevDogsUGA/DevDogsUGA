// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExpectedFailure } from "~/lib/actionResult";
import { callerFor } from "~/server/auth/access";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { decideHackathon, submitHackathon } from "./submit";

/**
 * Submitting a hackathon and an officer's decision, against a real database
 * (D4; Q26): the canonical link as identity, the unique link under a race, the
 * ten-a-day limit, and that a decision is made once, with its audit event.
 * Fixture ids are all `d4...`; links are under `https://d4s-*.example.com`.
 */

const id = (n: number) =>
  `d4000000-0000-4000-a000-0000000001${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const OTHER = id(2);
const OFFICER = id(3);
const OFFICER_TWO = id(4);
const ALL = [MEMBER, OTHER, OFFICER, OFFICER_TWO] as const;
const ROLE = id(21);
const link = (n: number | string) => `https://d4s-${n}.example.com/`;

async function cleanup() {
  const ids = sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );
  await db.execute(
    sql`delete from platform."auditEvents" where "actorUserId" in (${ids})`,
  );
  await db.execute(
    sql`delete from platform.hackathons where url like 'https://d4s-%'`,
  );
  await db.execute(
    sql`delete from platform."userRoles" where "roleId"=${ROLE}::uuid`,
  );
  await db.execute(sql`delete from platform.roles where id=${ROLE}::uuid`);
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(async () => {
  await cleanup();
  for (const [n, member] of ALL.entries())
    await insertMember({ id: member, handle: `d4s-${n}` });
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${ROLE}::uuid, 'D4 Test Officer', 9999.6, true)`);
  for (const officer of [OFFICER, OFFICER_TWO])
    await db.execute(
      sql`insert into platform."userRoles" ("userId", "roleId") values (${officer}::uuid, ${ROLE}::uuid)`,
    );
});

const member = () => callerFor(MEMBER);
const other = () => callerFor(OTHER);
const officer = () => callerFor(OFFICER);
const input = (n: number | string, over = {}) => ({
  url: link(n),
  name: `D4 Hack ${n}`,
  ...over,
});
const refusal = async (work: Promise<unknown>) => {
  const error = await work.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExpectedFailure);
  return error as ExpectedFailure;
};
const hackathon = async (url: string) => {
  const [row] = await db.execute<{
    id: string;
    source: string;
    approval: string;
    name: string;
    location: string;
    submittedBy: string | null;
    approvedBy: string | null;
    decidedAt: Date | null;
    startsOn: string | null;
  }>(
    sql`select id, source, approval, name, location, "submittedBy", "approvedBy", "decidedAt", "startsOn"::text as "startsOn" from platform.hackathons where url=${url}`,
  );
  return row;
};
const count = async (where: ReturnType<typeof sql>) => {
  const [row] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from platform.hackathons where ${where}`,
  );
  return row!.n;
};
const audits = (target: string) =>
  db.execute<{
    action: string;
    actorUserId: string;
    metadata: Record<string, unknown>;
  }>(
    sql`select action, "actorUserId", metadata from platform."auditEvents" where "targetId"=${target} order by "createdAt"`,
  );

describe("submitHackathon", () => {
  it("stores a pending member submission under the canonical link", async () => {
    const outcome = await submitHackathon(await member(), {
      url: "HTTP://D4s-1.Example.com?utm_source=x#top",
      name: "  D4  Hack ",
      startsOn: "2026-12-01",
      endsOn: "2026-12-03",
    });
    expect(outcome.status).toBe("created");
    expect(await hackathon(link(1))).toMatchObject({
      source: "other",
      approval: "pending",
      name: "D4 Hack",
      location: "",
      submittedBy: MEMBER,
      approvedBy: null,
      startsOn: "2026-12-01",
    });
  });

  it("reports the same link typed another way as already on file, without a second row", async () => {
    await submitHackathon(await member(), input(1));
    const again = await submitHackathon(await other(), {
      url: "d4s-1.example.com",
      name: "Someone else's name",
    });
    expect(again).toMatchObject({
      status: "exists",
      approval: "pending",
      linkable: false,
    });
    const mine = await submitHackathon(await member(), {
      url: link(1),
      name: "Again",
    });
    expect(mine).toMatchObject({ status: "exists", linkable: true });
    const asOfficer = await submitHackathon(await officer(), input(1));
    expect(asOfficer).toMatchObject({ status: "exists", linkable: true });
    const n = await count(sql`url like 'https://d4s-%'`);
    expect(n).toBe(1);
  });

  it("reports an approved hackathon as listed, to anyone, including a Devpost one", async () => {
    await db.execute(sql`
      insert into platform.hackathons (source, "devpostId", url, name, location, online, approval)
      values ('devpost', 94280100, ${link(2)}, 'D4 Devpost', 'Online', true, 'approved')`);
    expect(await submitHackathon(await other(), input(2))).toMatchObject({
      status: "exists",
      approval: "approved",
      linkable: true,
    });
  });

  it("refuses a declined link with a failure, and does not reopen it", async () => {
    const created = await submitHackathon(await member(), input(3));
    await decideHackathon(
      await officer(),
      (created as { id: string }).id,
      "declined",
    );
    expect(
      (await refusal(submitHackathon(await member(), input(3)))).message,
    ).toMatch(/declined/u);
    expect((await hackathon(link(3)))!.approval).toBe("declined");
  });

  it("stores one row and answers `exists` to the loser when two members race on a link", async () => {
    const [a, b] = await Promise.all([
      submitHackathon(await member(), input(4)),
      submitHackathon(await other(), input(4)),
    ]);
    expect([a.status, b.status].sort()).toEqual(["created", "exists"]);
    const n = await count(sql`url=${link(4)}`);
    expect(n).toBe(1);
  });

  it("limits a member to ten new submissions a day, and spends nothing on an existing link", async () => {
    for (let n = 10; n < 20; n += 1)
      await submitHackathon(await member(), input(n));
    expect(
      (await refusal(submitHackathon(await member(), input(20)))).message,
    ).toMatch(/tomorrow/u);
    expect(await hackathon(link(20))).toBeUndefined();
    expect(await submitHackathon(await member(), input(10))).toMatchObject({
      status: "exists",
    });
    // The limit is per member.
    expect((await submitHackathon(await other(), input(21))).status).toBe(
      "created",
    );
  });

  it("writes nothing for invalid input", async () => {
    await refusal(submitHackathon(await member(), { url: "nope", name: "x" }));
    await refusal(
      submitHackathon(await member(), {
        ...input(5),
        startsOn: "2026-12-05",
        endsOn: "2026-12-01",
      }),
    );
    expect(await hackathon(link(5))).toBeUndefined();
  });
});

describe("decideHackathon", () => {
  const pending = async (n: number) =>
    ((await submitHackathon(await member(), input(n))) as { id: string }).id;

  it("approves for an officer: records who, when, and an audit event", async () => {
    const hackathonId = await pending(1);
    expect(
      await decideHackathon(await officer(), hackathonId, "approved"),
    ).toEqual({ name: "D4 Hack 1" });
    expect(await hackathon(link(1))).toMatchObject({
      approval: "approved",
      approvedBy: OFFICER,
    });
    expect((await hackathon(link(1)))!.decidedAt).toBeInstanceOf(Date);
    const [audit, ...rest] = await audits(hackathonId);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      action: "hackathon.approved",
      actorUserId: OFFICER,
      metadata: { name: "D4 Hack 1", url: link(1), submittedBy: MEMBER },
    });
    // Now anyone's submission of the link finds it listed.
    expect(await submitHackathon(await other(), input(1))).toMatchObject({
      approval: "approved",
      linkable: true,
    });
  });

  it("declines with no approver, and still names the officer in the audit event", async () => {
    const hackathonId = await pending(2);
    await decideHackathon(await officer(), hackathonId, "declined");
    expect(await hackathon(link(2))).toMatchObject({
      approval: "declined",
      approvedBy: null,
    });
    expect((await audits(hackathonId))[0]).toMatchObject({
      action: "hackathon.declined",
      actorUserId: OFFICER,
    });
  });

  it("refuses a member, and changes nothing", async () => {
    const hackathonId = await pending(3);
    await refusal(decideHackathon(await member(), hackathonId, "approved"));
    expect((await hackathon(link(3)))!.approval).toBe("pending");
    expect(await audits(hackathonId)).toEqual([]);
  });

  it("decides once: a second decision fails and writes no second audit event", async () => {
    const hackathonId = await pending(4);
    await decideHackathon(await officer(), hackathonId, "approved");
    expect(
      (
        await refusal(
          decideHackathon(
            await callerFor(OFFICER_TWO),
            hackathonId,
            "declined",
          ),
        )
      ).message,
    ).toBe("That hackathon was already decided.");
    expect((await hackathon(link(4)))!.approval).toBe("approved");
    expect(await audits(hackathonId)).toHaveLength(1);
  });

  it("lets only one of two officers deciding at once win", async () => {
    const hackathonId = await pending(5);
    const results = await Promise.allSettled([
      decideHackathon(await officer(), hackathonId, "approved"),
      decideHackathon(await callerFor(OFFICER_TWO), hackathonId, "declined"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await audits(hackathonId)).toHaveLength(1);
  });

  it("only decides pending member submissions: not a Devpost record, not a missing id", async () => {
    await db.execute(sql`
      insert into platform.hackathons (source, "devpostId", url, name, location, online, approval)
      values ('devpost', 94280101, ${link(6)}, 'D4 Devpost', 'Online', true, 'approved')`);
    const devpostId = (await hackathon(link(6)))!.id;
    await refusal(decideHackathon(await officer(), devpostId, "declined"));
    await refusal(
      decideHackathon(
        await officer(),
        "00000000-0000-4000-8000-000000000000",
        "approved",
      ),
    );
    expect((await hackathon(link(6)))!.approval).toBe("approved");
  });
});
