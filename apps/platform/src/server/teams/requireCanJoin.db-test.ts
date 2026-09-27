// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { TeamActionError } from "./errors";
import { insertMembership, requireCanJoin } from "./requireCanJoin";

/**
 * The advisory locks against a real database.
 *
 * The interesting property is not "the count is enforced" -- a unit test on
 * `hasRoomOnTeam` already covers the arithmetic -- it is that the count is
 * enforced under CONCURRENCY. Two joins racing for the last seat both read
 * "3 of 4, room for one more" if nothing serializes them; the lock is what
 * turns that race into "one waits, reads the true count second, and sees
 * `team_full`". Only a real database, with two real transactions actually
 * overlapping, can prove that.
 */

const IDS = {
  team: "b5555555-5555-5555-5555-555555555501",
  spare: "b5555555-5555-5555-5555-555555555502",
  third: "b5555555-5555-5555-5555-555555555503",
  lead: "b9999999-9999-9999-9999-999999999901",
  memberA: "b9999999-9999-9999-9999-999999999902",
  memberB: "b9999999-9999-9999-9999-999999999903",
  candidateA: "b9999999-9999-9999-9999-999999999904",
  candidateB: "b9999999-9999-9999-9999-999999999905",
};

const USERS = [
  ["lead", IDS.lead],
  ["memberA", IDS.memberA],
  ["memberB", IDS.memberB],
  ["candidateA", IDS.candidateA],
  ["candidateB", IDS.candidateB],
] as const;

async function cleanup() {
  await db.execute(
    sql`delete from platform.teams where id in (${IDS.team}::uuid, ${IDS.spare}::uuid, ${IDS.third}::uuid)`,
  );
  await db.execute(
    sql`delete from auth.users where id in (${sql.join(
      USERS.map(([, id]) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
}

beforeAll(async () => {
  await cleanup();

  for (const [name, id] of USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`requirecanjoin-${name}@uga.edu`})
    `);
    // Every candidate this file joins with needs a linked GitHub identity --
    // `requireCanJoin`'s second check -- or every case here would fail before
    // it reached the one under test.
    const identityData = JSON.stringify({
      sub: `requirecanjoin-${name}-gh`,
      user_name: name,
    });
    await db.execute(sql`
      insert into auth.identities (id, user_id, provider, provider_id, identity_data)
      values (gen_random_uuid(), ${id}::uuid, 'github', ${`requirecanjoin-${name}-gh`},
              ${identityData}::jsonb)
      on conflict do nothing
    `);
  }

  // The team at 3 of 4: room for exactly one more.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.team}::uuid, 'requirecanjoin-team', 'RequireCanJoin Team', 'ABC234', ${IDS.lead}::uuid)
  `);
  for (const [role, userId] of [
    ["lead", IDS.lead],
    ["member", IDS.memberA],
    ["member", IDS.memberB],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${IDS.team}::uuid, ${userId}::uuid, ${role})
    `);
  }

  // A spare team for the concurrent-team-cap case, with room to spare -- the
  // point of that case is the CALLER's cap, not the team's.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.spare}::uuid, 'requirecanjoin-spare', 'RequireCanJoin Spare', 'DEF456', ${IDS.lead}::uuid)
  `);
});

afterAll(cleanup);

async function attemptJoin(teamId: string, userId: string) {
  try {
    await db.transaction(async (tx) => {
      await requireCanJoin(tx, { teamId, userId });
      await insertMembership(tx, { teamId, userId });
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof TeamActionError) {
      return { ok: false as const, code: error.code };
    }
    throw error;
  }
}

async function activeCount(teamId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from platform."teamMembers"
    where "teamId" = ${teamId}::uuid and "leftAt" is null
  `);
  return rows[0]!.n;
}

describe("the team-size lock, under real concurrency", () => {
  it("lets exactly one of two simultaneous joins take the last seat", async () => {
    expect(await activeCount(IDS.team)).toBe(3);

    const [a, b] = await Promise.all([
      attemptJoin(IDS.team, IDS.candidateA),
      attemptJoin(IDS.team, IDS.candidateB),
    ]);

    const results = [a, b];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ ok: false, code: "team_full" });

    // The lock did its job if the count landed on exactly 4, not "4 or 5
    // depending on how the race went".
    expect(await activeCount(IDS.team)).toBe(4);
  });
});

describe("the concurrent-team-cap lock, under real concurrency", () => {
  it("lets exactly one of two simultaneous joins through for the same user", async () => {
    // `candidateA` just filled the last seat on `IDS.team` above, so it is
    // active on exactly one team -- room for one more before the cap of two.
    // Two DIFFERENT teams, raced for the SAME user: only the user-lock, not
    // the team-lock, can be what serializes this.
    await db.execute(sql`
      insert into platform.teams (id, slug, name, "joinCode", "createdBy")
      values (${IDS.third}::uuid, 'requirecanjoin-third', 'RequireCanJoin Third', 'GHI789', ${IDS.lead}::uuid)
    `);

    const [spare, third] = await Promise.all([
      attemptJoin(IDS.spare, IDS.candidateA),
      attemptJoin(IDS.third, IDS.candidateA),
    ]);

    const results = [spare, third];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      ok: false,
      code: "too_many_teams",
    });
  });
});
