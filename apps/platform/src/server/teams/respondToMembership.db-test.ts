// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * Accepting one invitation withdraws the rest, for that competition.
 *
 * Applying to a few teams and joining whichever answers first is the intended
 * use, so the leftovers are not a mistake — but the one-team-per-competition
 * constraint would reject every one of them anyway, and leaving them pending
 * strands leads waiting on somebody who is no longer available.
 *
 * Worth a database test rather than a unit test because the interesting part
 * is the scope of the UPDATE: it must catch the sibling in the same
 * competition, must NOT catch one in a different competition, and must not
 * touch anybody else's rows.
 */

const IDS = {
  projectA: "c1111111-1111-1111-1111-111111111111",
  projectB: "c1111111-1111-1111-1111-111111111112",
  meeting: "c2222222-2222-2222-2222-222222222222",
  workshopA: "c3333333-3333-3333-3333-333333333331",
  workshopB: "c3333333-3333-3333-3333-333333333332",
  compA: "c4444444-4444-4444-4444-444444444441",
  compB: "c4444444-4444-4444-4444-444444444442",
  teamA1: "c5555555-5555-5555-5555-555555555551",
  teamA2: "c5555555-5555-5555-5555-555555555552",
  teamB1: "c5555555-5555-5555-5555-555555555553",
  lead: "c9999999-9999-9999-9999-999999999991",
  applicant: "c9999999-9999-9999-9999-999999999992",
  bystander: "c9999999-9999-9999-9999-999999999993",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(sql`
    delete from platform.projects
    where id in (${IDS.projectA}::uuid, ${IDS.projectB}::uuid)
  `);
  await db.execute(sql`
    delete from auth.users
    where id in (${IDS.lead}::uuid, ${IDS.applicant}::uuid, ${IDS.bystander}::uuid)
  `);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of [
    [IDS.lead, "respond-lead@uga.edu"],
    [IDS.applicant, "respond-applicant@uga.edu"],
    [IDS.bystander, "respond-bystander@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
      on conflict (id) do nothing
    `);
  }

  // Joining provisions repository access, so `requireCanJoin` refuses a member
  // with no linked GitHub identity — `github_not_linked`, the sixth check.
  // Seeding the identity is not incidental setup: without it this test would
  // pass for the wrong reason, never reaching the withdrawal at all.
  await db.execute(sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data)
    values (gen_random_uuid(), ${IDS.applicant}::uuid, 'github', 'respond-applicant-gh',
            '{"sub":"respond-applicant-gh","user_name":"applicant"}'::jsonb)
    on conflict do nothing
  `);

  // Two projects, not two workshops on one: `workshops_meetingId_projectId_key`
  // allows a meeting to run a given project exactly once, which is correct —
  // two sessions on the same project at the same meeting would make an
  // attendance row ambiguous about which one it credits.
  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.projectA}::uuid, 'respond-test-a', 'Respond Test A'),
           (${IDS.projectB}::uuid, 'respond-test-b', 'Respond Test B')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'respond-test-meeting', 'Respond Test',
            now() - interval '2 days', now() - interval '2 days' + interval '2 hours')
  `);

  // Two competitions at the same meeting — the whole point is that they are
  // scoped independently.
  for (const [workshop, comp, slug, project] of [
    [IDS.workshopA, IDS.compA, "respond-comp-a", IDS.projectA],
    [IDS.workshopB, IDS.compB, "respond-comp-b", IDS.projectB],
  ] as const) {
    await db.execute(sql`
      insert into platform.workshops (id, "meetingId", "projectId")
      values (${workshop}::uuid, ${IDS.meeting}::uuid, ${project}::uuid)
    `);
    await db.execute(sql`
      insert into platform.competitions (id, slug, "workshopId")
      values (${comp}::uuid, ${slug}, ${workshop}::uuid)
    `);
  }

  for (const [id, comp, slug] of [
    [IDS.teamA1, IDS.compA, "team-a1"],
    [IDS.teamA2, IDS.compA, "team-a2"],
    [IDS.teamB1, IDS.compB, "team-b1"],
  ] as const) {
    await db.execute(sql`
      insert into platform.teams (id, "competitionId", slug, name, "joinCode", "createdBy")
      values (${id}::uuid, ${comp}::uuid, ${slug}, ${slug}, ${slug.toUpperCase()},
              ${IDS.lead}::uuid)
    `);
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
      values (${id}::uuid, ${comp}::uuid, ${IDS.lead}::uuid, 'lead')
      on conflict do nothing
    `);
  }
});

afterAll(cleanup);

vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve("c9999999-9999-9999-9999-999999999992"),
}));

const { respondToMembership } = await import("~/server/actions/teams");

async function invite(teamId: string, competitionId: string, userId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    insert into platform."teamMembershipRequests"
      ("teamId", "competitionId", "userId", direction, status, "createdBy")
    values (${teamId}::uuid, ${competitionId}::uuid, ${userId}::uuid,
            'invite', 'pending', ${IDS.lead}::uuid)
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

describe("respondToMembership", () => {
  it("accepts one invitation and withdraws the sibling", async () => {
    const accepted = await invite(IDS.teamA1, IDS.compA, IDS.applicant);
    const sibling = await invite(IDS.teamA2, IDS.compA, IDS.applicant);
    // Same member, DIFFERENT competition. Nothing about accepting in
    // competition A says anything about their options in B.
    const otherComp = await invite(IDS.teamB1, IDS.compB, IDS.applicant);
    // Somebody else's invitation to the very team that just filled a seat.
    const other = await invite(IDS.teamA2, IDS.compA, IDS.bystander);

    const result = await respondToMembership(accepted, true);
    expect(result.ok).toBe(true);

    expect(await statusOf(accepted)).toBe("accepted");
    // Withdrawn, not declined: the member did not turn this down, their
    // situation changed.
    expect(await statusOf(sibling)).toBe("withdrawn");
    expect(await statusOf(otherComp)).toBe("pending");
    expect(await statusOf(other)).toBe("pending");
  });

  it("put the member on exactly one team", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."teamMembers"
      where "userId" = ${IDS.applicant}::uuid
        and "competitionId" = ${IDS.compA}::uuid
    `);
    expect(rows[0]!.n).toBe(1);
  });

  it("returns a code rather than throwing when the row is already answered", async () => {
    const answered = await invite(IDS.teamA2, IDS.compA, IDS.applicant);
    await db.execute(sql`
      update platform."teamMembershipRequests"
      set status = 'declined' where id = ${answered}::uuid
    `);

    // The whole reason the actions return outcomes: a throw arrives at the
    // browser as an opaque digest in production, so the code has to be data.
    expect(await respondToMembership(answered, true)).toEqual({
      ok: false,
      code: "request_not_actionable",
    });
  });
});
