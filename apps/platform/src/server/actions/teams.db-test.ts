// @vitest-environment node
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
import { db } from "~/server/db";
import type { GithubResult } from "~/server/github/teamSync";

/**
 * The team actions against a real database, with GitHub mocked.
 *
 * GitHub is mocked here -- `vi.mock("~/server/github/teamSync")` -- rather
 * than hit the network. `teamSync.ts` is the injectable seam: every test that
 * needs a specific GitHub outcome (success, or the refusal case) configures
 * these mocks rather than depending on a real installation token. `expectSession`
 * is mocked the same way, mutated between assertions rather than given a
 * fixed return, because different actions in this file act as different
 * members.
 */

const github = vi.hoisted(() => ({
  provisionTeam: vi.fn((): Promise<GithubResult> =>
    Promise.resolve({ ok: true }),
  ),
  addMember: vi.fn((): Promise<GithubResult> => Promise.resolve({ ok: true })),
  removeMember: vi.fn((): Promise<GithubResult> =>
    Promise.resolve({ ok: true }),
  ),
  disbandTeam: vi.fn((): Promise<GithubResult> =>
    Promise.resolve({ ok: true }),
  ),
}));
vi.mock("~/server/github/teamSync", () => github);

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const { createTeam, disbandTeamAction, joinTeam, leaveTeam, transferLead } =
  await import("~/server/actions/teams");

const IDS = {
  lead: "c9111111-1111-1111-1111-111111111101",
  memberA: "c9111111-1111-1111-1111-111111111102",
  memberB: "c9111111-1111-1111-1111-111111111103",
  memberC: "c9111111-1111-1111-1111-111111111104",
  memberD: "c9111111-1111-1111-1111-111111111105",
  capped: "c9111111-1111-1111-1111-111111111106",
  freshCreator: "c9111111-1111-1111-1111-111111111107",
  freshJoiner: "c9111111-1111-1111-1111-111111111108",
  memberE: "c9111111-1111-1111-1111-111111111109",
  memberF: "c9111111-1111-1111-1111-111111111110",
  seatedTeam: "c5111111-1111-1111-1111-111111111101",
  fullTeam: "c5111111-1111-1111-1111-111111111102",
  cappedTeamA: "c5111111-1111-1111-1111-111111111103",
  cappedTeamB: "c5111111-1111-1111-1111-111111111104",
  disbandTeam: "c5111111-1111-1111-1111-111111111105",
  historyTeam: "c5111111-1111-1111-1111-111111111106",
  transferTeam: "c5111111-1111-1111-1111-111111111107",
  raceTeam: "c5111111-1111-1111-1111-111111111108",
};

const USERS = [
  IDS.lead,
  IDS.memberA,
  IDS.memberB,
  IDS.memberC,
  IDS.memberD,
  IDS.capped,
  IDS.freshCreator,
  IDS.freshJoiner,
  IDS.memberE,
  IDS.memberF,
] as const;

const TEAMS = [
  IDS.seatedTeam,
  IDS.fullTeam,
  IDS.cappedTeamA,
  IDS.cappedTeamB,
  IDS.disbandTeam,
  IDS.historyTeam,
  IDS.transferTeam,
  IDS.raceTeam,
] as const;

async function cleanup() {
  await db.execute(sql`
    delete from platform.teams where id in (${sql.join(
      TEAMS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
  // `createTeam` in the tests below makes its own team, named after the test;
  // slug prefix is the cheapest way to sweep those up too.
  await db.execute(sql`
    delete from platform.teams where slug like 'actions-db-test-%'
  `);
  await db.execute(sql`
    delete from auth.users where id in (${sql.join(
      USERS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
}

beforeAll(async () => {
  await cleanup();

  for (const id of USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`actions-db-test-${id}@uga.edu`})
    `);
    const identityData = JSON.stringify({ sub: `${id}-gh`, user_name: id });
    await db.execute(sql`
      insert into auth.identities (id, user_id, provider, provider_id, identity_data)
      values (gen_random_uuid(), ${id}::uuid, 'github', ${`${id}-gh`}, ${identityData}::jsonb)
      on conflict do nothing
    `);
  }

  // A team with one seat open, for the GitHub-failure and history cases.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.seatedTeam}::uuid, 'actions-db-test-seated', 'Seated', 'ABC234', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.seatedTeam}::uuid, ${IDS.lead}::uuid, 'lead')
  `);

  // A team already at the size cap, for `team_full`.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.fullTeam}::uuid, 'actions-db-test-full', 'Full', 'DEF456', ${IDS.lead}::uuid)
  `);
  for (const [role, userId] of [
    ["lead", IDS.lead],
    ["member", IDS.memberA],
    ["member", IDS.memberB],
    ["member", IDS.memberC],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${IDS.fullTeam}::uuid, ${userId}::uuid, ${role})
    `);
  }

  // Two teams `IDS.capped` is already active on, for `too_many_teams`.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.cappedTeamA}::uuid, 'actions-db-test-capped-a', 'Capped A', 'GHI789', ${IDS.capped}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.cappedTeamA}::uuid, ${IDS.capped}::uuid, 'lead')
  `);
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.cappedTeamB}::uuid, 'actions-db-test-capped-b', 'Capped B', 'JKL012', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.cappedTeamB}::uuid, ${IDS.capped}::uuid, 'member')
  `);
  // A third team for `IDS.capped` to be refused entry to.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.disbandTeam}::uuid, 'actions-db-test-disband', 'Disband Me', 'MNO345', ${IDS.lead}::uuid)
  `);
  await db.execute(sql`
    insert into platform."teamMembers" ("teamId", "userId", role)
    values (${IDS.disbandTeam}::uuid, ${IDS.lead}::uuid, 'lead')
  `);

  // A dedicated team for the leave/history case, so it does not depend on
  // what an earlier test in this file left `memberD` active on.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.historyTeam}::uuid, 'actions-db-test-history', 'History', 'PQR678', ${IDS.lead}::uuid)
  `);
  for (const [role, userId] of [
    ["lead", IDS.lead],
    ["member", IDS.memberD],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${IDS.historyTeam}::uuid, ${userId}::uuid, ${role})
    `);
  }

  // A team for the basic transfer case: lead plus one other active member.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.transferTeam}::uuid, 'actions-db-test-transfer', 'Transfer', 'STU901', ${IDS.lead}::uuid)
  `);
  for (const [role, userId] of [
    ["lead", IDS.lead],
    ["member", IDS.memberE],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${IDS.transferTeam}::uuid, ${userId}::uuid, ${role})
    `);
  }

  // A separate team for the transfer/leave race, so it does not share state
  // with the basic transfer case above.
  await db.execute(sql`
    insert into platform.teams (id, slug, name, "joinCode", "createdBy")
    values (${IDS.raceTeam}::uuid, 'actions-db-test-race', 'Race', 'VWX234', ${IDS.lead}::uuid)
  `);
  for (const [role, userId] of [
    ["lead", IDS.lead],
    ["member", IDS.memberF],
  ] as const) {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${IDS.raceTeam}::uuid, ${userId}::uuid, ${role})
    `);
  }
});

afterAll(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  github.provisionTeam.mockResolvedValue({ ok: true });
  github.addMember.mockResolvedValue({ ok: true });
  github.removeMember.mockResolvedValue({ ok: true });
  github.disbandTeam.mockResolvedValue({ ok: true });
});

async function activeRow(teamId: string, userId: string) {
  const rows = await db.execute<{ leftAt: string | null }>(sql`
    select "leftAt" from platform."teamMembers"
    where "teamId" = ${teamId}::uuid and "userId" = ${userId}::uuid
    order by "joinedAt" desc limit 1
  `);
  return rows[0] ?? null;
}

async function memberCount(teamId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from platform."teamMembers"
    where "teamId" = ${teamId}::uuid and "leftAt" is null
  `);
  return rows[0]!.n;
}

async function activeLeadCount(teamId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from platform."teamMembers"
    where "teamId" = ${teamId}::uuid and "leftAt" is null and role = 'lead'
  `);
  return rows[0]!.n;
}

describe("createTeam", () => {
  it("provisions GitHub before writing the mirror, and makes the creator lead", async () => {
    session.userId = IDS.freshCreator;

    const result = await createTeam("actions-db-test-created");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(github.provisionTeam).toHaveBeenCalledWith(result.value.slug);
    expect(github.addMember).toHaveBeenCalledWith(
      result.value.slug,
      IDS.freshCreator,
    );

    const row = await activeRow(result.value.id, IDS.freshCreator);
    expect(row).not.toBeNull();

    const rows = await db.execute<{ role: string }>(sql`
      select role from platform."teamMembers" where "teamId" = ${result.value.id}::uuid
    `);
    expect(rows[0]?.role).toBe("lead");
  });

  it("refuses past the concurrent-team cap and creates nothing", async () => {
    session.userId = IDS.capped;

    const result = await createTeam("actions-db-test-should-not-exist");
    expect(result).toEqual({ ok: false, code: "too_many_teams" });
    expect(github.provisionTeam).not.toHaveBeenCalled();

    const rows = await db.execute(sql`
      select 1 from platform.teams where slug = 'actions-db-test-should-not-exist'
    `);
    expect(rows).toHaveLength(0);
  });
});

describe("joinTeam", () => {
  it("leaves the mirror untouched when GitHub refuses the grant", async () => {
    session.userId = IDS.freshJoiner;
    github.addMember.mockResolvedValueOnce({
      ok: false,
      skipped: "api_error",
      detail: "boom",
    });

    const result = await joinTeam(IDS.seatedTeam, "ABC234");
    expect(result).toEqual({ ok: false, code: "github_unavailable" });

    const row = await activeRow(IDS.seatedTeam, IDS.freshJoiner);
    expect(row).toBeNull();
  });

  it("refuses a full team without calling GitHub", async () => {
    session.userId = IDS.freshJoiner;

    const result = await joinTeam(IDS.fullTeam, "DEF456");
    expect(result).toEqual({ ok: false, code: "team_full" });
    expect(github.addMember).not.toHaveBeenCalled();
  });

  it("refuses past the concurrent-team cap", async () => {
    session.userId = IDS.capped;

    const result = await joinTeam(IDS.disbandTeam, "MNO345");
    expect(result).toEqual({ ok: false, code: "too_many_teams" });
    expect(await memberCount(IDS.disbandTeam)).toBe(1);
  });

  it("succeeds when GitHub grants the membership", async () => {
    session.userId = IDS.freshJoiner;

    // The previous test in this block left an `api_error` mocked with
    // `mockResolvedValueOnce`, which is already consumed; this call gets the
    // `beforeEach` default of success.
    const result = await joinTeam(IDS.seatedTeam, "ABC234");
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await activeRow(IDS.seatedTeam, IDS.freshJoiner)).not.toBeNull();
  });
});

describe("leaveTeam", () => {
  it("keeps history: leaving sets leftAt rather than deleting the row", async () => {
    session.userId = IDS.memberD;

    const before = await activeRow(IDS.historyTeam, IDS.memberD);
    expect(before?.leftAt).toBeNull();

    const result = await leaveTeam(IDS.historyTeam);
    expect(result.ok).toBe(true);
    expect(github.removeMember).toHaveBeenCalledWith(
      "actions-db-test-history",
      IDS.memberD,
    );

    const after = await activeRow(IDS.historyTeam, IDS.memberD);
    expect(after?.leftAt).not.toBeNull();

    // Rejoining starts a second stint rather than reviving the first.
    const rejoined = await joinTeam(IDS.historyTeam, "PQR678");
    expect(rejoined.ok).toBe(true);

    const rows = await db.execute<{ leftAt: string | null }>(sql`
      select "leftAt" from platform."teamMembers"
      where "teamId" = ${IDS.historyTeam}::uuid and "userId" = ${IDS.memberD}::uuid
      order by "joinedAt" asc
    `);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.leftAt).not.toBeNull();
    expect(rows[1]?.leftAt).toBeNull();
  });

  it("does not touch the mirror when GitHub refuses the revoke", async () => {
    session.userId = IDS.memberA;
    github.removeMember.mockResolvedValueOnce({
      ok: false,
      skipped: "api_error",
      detail: "boom",
    });

    const result = await leaveTeam(IDS.fullTeam);
    expect(result).toEqual({ ok: false, code: "github_unavailable" });

    const row = await activeRow(IDS.fullTeam, IDS.memberA);
    expect(row?.leftAt).toBeNull();
  });
});

describe("transferLead", () => {
  it("demotes the caller and promotes the target", async () => {
    session.userId = IDS.lead;

    const result = await transferLead(IDS.transferTeam, IDS.memberE);
    expect(result).toEqual({ ok: true, value: undefined });

    const rows = await db.execute<{ userId: string; role: string }>(sql`
      select "userId", role from platform."teamMembers"
      where "teamId" = ${IDS.transferTeam}::uuid and "leftAt" is null
    `);
    const byUser = new Map(rows.map((r) => [r.userId, r.role]));
    expect(byUser.get(IDS.lead)).toBe("member");
    expect(byUser.get(IDS.memberE)).toBe("lead");
  });

  // Regression for a blocker found in review: `transferLeadImpl` used to skip
  // `lockTeam`, the same advisory lock `leaveTeamImpl` and `disbandTeamImpl`
  // take. Unlocked, a transfer promoting a member could interleave with that
  // same member leaving: both read an active membership before either wrote,
  // both reported success, and the team was left with the old lead demoted
  // and the new one promoted-but-departed -- no active lead, and no
  // self-service action left that could ever create one (every other action
  // requires an active lead). Locking serializes the two, so whichever
  // transaction commits first is the one the other sees: either the leave
  // wins and the transfer then fails with `not_a_member` (target already
  // gone), or the transfer wins and the leave then fails with
  // `lead_must_transfer_first` (the promoted member cannot leave a team that
  // now has another active member, the demoted former lead). Either way the
  // team keeps exactly one active lead.
  it("never leaves the team without an active lead when a transfer races the target leaving", async () => {
    session.userId = IDS.lead;
    const transferPromise = transferLead(IDS.raceTeam, IDS.memberF);

    session.userId = IDS.memberF;
    const leavePromise = leaveTeam(IDS.raceTeam);

    const [transferResult, leaveResult] = await Promise.all([
      transferPromise,
      leavePromise,
    ]);

    // Both cannot succeed: that is exactly the race this locks against.
    expect(transferResult.ok && leaveResult.ok).toBe(false);

    expect(await activeLeadCount(IDS.raceTeam)).toBe(1);
  });
});

describe("disbandTeamAction", () => {
  it("tears down GitHub first, then deletes the team and cascades its members", async () => {
    session.userId = IDS.lead;

    const result = await disbandTeamAction(IDS.disbandTeam);
    expect(result.ok).toBe(true);
    expect(github.disbandTeam).toHaveBeenCalledWith("actions-db-test-disband");

    const teamRows = await db.execute(sql`
      select 1 from platform.teams where id = ${IDS.disbandTeam}::uuid
    `);
    expect(teamRows).toHaveLength(0);

    const memberRows = await db.execute(sql`
      select 1 from platform."teamMembers" where "teamId" = ${IDS.disbandTeam}::uuid
    `);
    expect(memberRows).toHaveLength(0);
  });

  it("leaves the team in place when GitHub refuses the teardown", async () => {
    session.userId = IDS.capped;
    github.disbandTeam.mockResolvedValueOnce({
      ok: false,
      skipped: "api_error",
      detail: "boom",
    });

    const result = await disbandTeamAction(IDS.cappedTeamA);
    expect(result).toEqual({ ok: false, code: "github_unavailable" });

    const teamRows = await db.execute(sql`
      select 1 from platform.teams where id = ${IDS.cappedTeamA}::uuid
    `);
    expect(teamRows).toHaveLength(1);
  });
});
