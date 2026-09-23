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
 * Answering an invitation or a join request, against a real database.
 *
 * GitHub is mocked -- see `actions/teams.db-test.ts`'s header for why. What
 * belongs here rather than there is the direction-dependent authorization
 * (an invitation is answered by its recipient, a request by the team's lead)
 * and the fact that acceptance re-runs every `requireCanJoin` check rather
 * than trusting the state the request was created in.
 */

const github = vi.hoisted(() => ({
  addMember: vi.fn((): Promise<GithubResult> => Promise.resolve({ ok: true })),
}));
vi.mock("~/server/github/teamSync", () => github);

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const { respondToMembership } = await import("~/server/actions/teams");

const IDS = {
  teamA: "c5555555-5555-5555-5555-555555555561",
  teamB: "c5555555-5555-5555-5555-555555555562",
  lead: "c9999999-9999-9999-9999-999999999961",
  applicant: "c9999999-9999-9999-9999-999999999962",
  bystander: "c9999999-9999-9999-9999-999999999963",
  linkedBystander: "c9999999-9999-9999-9999-999999999964",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.teams where id in (${IDS.teamA}::uuid, ${IDS.teamB}::uuid)`,
  );
  await db.execute(sql`
    delete from auth.users
    where id in (${IDS.lead}::uuid, ${IDS.applicant}::uuid, ${IDS.bystander}::uuid, ${IDS.linkedBystander}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of [
    [IDS.lead, "respond-lead@uga.edu"],
    [IDS.applicant, "respond-applicant@uga.edu"],
    [IDS.bystander, "respond-bystander@uga.edu"],
    [IDS.linkedBystander, "respond-linked-bystander@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }

  // Joining provisions repository access, so `requireCanJoin` refuses a member
  // with no linked GitHub identity: `github_not_linked`, its first check.
  // Without the seeded identity these would pass for the wrong reason, never
  // reaching acceptance at all.
  for (const [id, login] of [
    [IDS.applicant, "applicant"],
    [IDS.linkedBystander, "linked-bystander"],
  ] as const) {
    await db.execute(sql`
      insert into auth.identities (id, user_id, provider, provider_id, identity_data)
      values (gen_random_uuid(), ${id}::uuid, 'github', ${`respond-${login}-gh`},
              ${JSON.stringify({ sub: `respond-${login}-gh`, user_name: login })}::jsonb)
    `);
  }

  for (const [id, slug, code] of [
    [IDS.teamA, "respond-team-a", "AAA111"],
    [IDS.teamB, "respond-team-b", "BBB222"],
  ] as const) {
    await db.execute(sql`
      insert into platform.teams (id, slug, name, "joinCode", "createdBy")
      values (${id}::uuid, ${slug}, ${slug}, ${code}, ${IDS.lead}::uuid)
    `);
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "userId", role)
      values (${id}::uuid, ${IDS.lead}::uuid, 'lead')
    `);
  }
});

afterAll(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  github.addMember.mockResolvedValue({ ok: true });
});

async function invite(teamId: string, userId: string, createdBy: string) {
  const rows = await db.execute<{ id: string }>(sql`
    insert into platform."teamMembershipRequests"
      ("teamId", "userId", direction, status, "createdBy")
    values (${teamId}::uuid, ${userId}::uuid, 'invite', 'pending', ${createdBy}::uuid)
    returning id
  `);
  return rows[0]!.id;
}

async function request(teamId: string, userId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    insert into platform."teamMembershipRequests"
      ("teamId", "userId", direction, status, "createdBy")
    values (${teamId}::uuid, ${userId}::uuid, 'request', 'pending', ${userId}::uuid)
    returning id
  `);
  return rows[0]!.id;
}

async function statusOf(id: string) {
  const rows = await db.execute<{ status: string }>(sql`
    select status from platform."teamMembershipRequests" where id = ${id}::uuid
  `);
  return rows[0]!.status;
}

async function isActiveMember(teamId: string, userId: string) {
  const rows = await db.execute(sql`
    select 1 from platform."teamMembers"
    where "teamId" = ${teamId}::uuid and "userId" = ${userId}::uuid and "leftAt" is null
  `);
  return rows.length > 0;
}

describe("respondToMembership", () => {
  it("an invitation is answered by its recipient", async () => {
    const id = await invite(IDS.teamA, IDS.applicant, IDS.lead);

    session.userId = IDS.bystander;
    expect(await respondToMembership(id, true)).toEqual({
      ok: false,
      code: "request_not_actionable",
    });

    session.userId = IDS.applicant;
    const result = await respondToMembership(id, true);
    expect(result.ok).toBe(true);
    expect(github.addMember).toHaveBeenCalledWith(
      "respond-team-a",
      IDS.applicant,
    );
    expect(await statusOf(id)).toBe("accepted");
    expect(await isActiveMember(IDS.teamA, IDS.applicant)).toBe(true);
  });

  it("a join request is answered by the team's lead, not the requester", async () => {
    const id = await request(IDS.teamB, IDS.applicant);

    // The requester is not the one to answer their own request -- only the
    // team's lead is -- and `requireLead` reports `not_a_member` rather than
    // `request_not_actionable` for a caller who is not on the team at all.
    session.userId = IDS.applicant;
    expect(await respondToMembership(id, true)).toEqual({
      ok: false,
      code: "not_a_member",
    });

    session.userId = IDS.lead;
    const result = await respondToMembership(id, true);
    expect(result.ok).toBe(true);
    expect(await isActiveMember(IDS.teamB, IDS.applicant)).toBe(true);
  });

  it("declining never calls GitHub and leaves the mirror untouched", async () => {
    const id = await invite(IDS.teamA, IDS.bystander, IDS.lead);

    session.userId = IDS.bystander;
    const result = await respondToMembership(id, false);
    expect(result.ok).toBe(true);
    expect(github.addMember).not.toHaveBeenCalled();
    expect(await statusOf(id)).toBe("declined");
    expect(await isActiveMember(IDS.teamA, IDS.bystander)).toBe(false);
  });

  it("refuses at requireCanJoin's first check when GitHub was never linked", async () => {
    const id = await invite(IDS.teamB, IDS.bystander, IDS.lead);
    session.userId = IDS.bystander;

    const result = await respondToMembership(id, true);
    expect(result).toEqual({ ok: false, code: "github_not_linked" });
    expect(github.addMember).not.toHaveBeenCalled();
    expect(await statusOf(id)).toBe("pending");
    expect(await isActiveMember(IDS.teamB, IDS.bystander)).toBe(false);
  });

  it("leaves the mirror and the request untouched when GitHub refuses the grant", async () => {
    const id = await invite(IDS.teamA, IDS.linkedBystander, IDS.lead);
    github.addMember.mockResolvedValueOnce({
      ok: false,
      skipped: "api_error",
      detail: "boom",
    });
    session.userId = IDS.linkedBystander;

    const result = await respondToMembership(id, true);
    expect(result).toEqual({ ok: false, code: "github_unavailable" });
    expect(await statusOf(id)).toBe("pending");
    expect(await isActiveMember(IDS.teamA, IDS.linkedBystander)).toBe(false);
  });

  it("returns a code rather than throwing when the row is already answered", async () => {
    const id = await invite(IDS.teamA, IDS.applicant, IDS.lead);
    await db.execute(sql`
      update platform."teamMembershipRequests"
      set status = 'declined' where id = ${id}::uuid
    `);

    session.userId = IDS.applicant;
    // The whole reason the actions return outcomes: a throw arrives at the
    // browser as an opaque digest in production, so the code has to be data.
    expect(await respondToMembership(id, true)).toEqual({
      ok: false,
      code: "request_not_actionable",
    });
  });
});
