// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  disableCredentials,
  isReachable,
  issueCredentials,
  reconcileEnvironmentAccess,
  revokeAllCredentials,
} from "~/server/sandbox/credentials";

/**
 * Access is a reachability question, not a lookup.
 *
 * One environment can serve several teams, which makes losing access the
 * subtle part: removing somebody from ONE of two teams sharing an environment
 * must leave their credential alone, and only removal from BOTH may take it
 * away. A per-removal handler would have to know about the other team; the
 * sweep asks the question the rule actually poses.
 *
 * Worth a database test rather than a unit test because the interesting part is
 * the scope of the UPDATE, and because the fixture itself is a claim about the
 * schema: two teams can only share a member if they are in DIFFERENT
 * competitions, since `teamMembers_userId_competitionId_key` allows one team
 * per member per competition.
 */

const IDS = {
  projectA: "f0000000-0000-0000-0000-0000000000a1",
  projectB: "f0000000-0000-0000-0000-0000000000a2",
  meeting: "f0000000-0000-0000-0000-0000000000b0",
  workshopA: "f0000000-0000-0000-0000-0000000000c1",
  workshopB: "f0000000-0000-0000-0000-0000000000c2",
  compA: "f0000000-0000-0000-0000-0000000000d1",
  compB: "f0000000-0000-0000-0000-0000000000d2",
  teamA: "f0000000-0000-0000-0000-0000000000e1",
  teamB: "f0000000-0000-0000-0000-0000000000e2",
  lead: "f0000000-0000-0000-0000-0000000000f1",
  member: "f0000000-0000-0000-0000-0000000000f2",
  outsider: "f0000000-0000-0000-0000-0000000000f3",
  env: "f0000000-0000-0000-0000-0000000000e9",
};

async function cleanup() {
  // Order matters, and the constraint that forces it is the point of the
  // design: `teamEnvironments_environmentId_ownerUserId_fkey` is `restrict`,
  // so an environment cannot be deleted out from under an attached team.
  // Deleting the meeting cascades through workshops -> competitions -> teams ->
  // teamEnvironments, which detaches everything first.
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform."sandboxEnvironments" where id = ${IDS.env}::uuid`,
  );
  await db.execute(sql`
    delete from platform.projects
    where id in (${IDS.projectA}::uuid, ${IDS.projectB}::uuid)
  `);
  await db.execute(sql`
    delete from auth.users
    where id in (${IDS.lead}::uuid, ${IDS.member}::uuid, ${IDS.outsider}::uuid)
  `);
  await db.execute(
    sql`delete from vault.secrets where name like 'reachtest-%'`,
  );
}

async function statuses(userId: string) {
  const rows = await db.execute<{ scope: string; status: string }>(sql`
    select scope, status from platform."sandboxCredentials"
     where "environmentId" = ${IDS.env}::uuid and "userId" = ${userId}::uuid
     order by scope
  `);
  return rows.map((r) => `${r.scope}:${r.status}`);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of [
    [IDS.lead, "reach-lead@uga.edu"],
    [IDS.member, "reach-member@uga.edu"],
    [IDS.outsider, "reach-outsider@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }

  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.projectA}::uuid, 'reach-a', 'Reach A'),
           (${IDS.projectB}::uuid, 'reach-b', 'Reach B')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'reach-meeting', 'Reach',
            now(), now() + interval '2 hours')
  `);

  // Two competitions, because one member cannot be on two teams in the same
  // one -- which is exactly why sharing an environment across competitions is
  // the case that needs testing.
  for (const [workshop, comp, slug, project] of [
    [IDS.workshopA, IDS.compA, "reach-comp-a", IDS.projectA],
    [IDS.workshopB, IDS.compB, "reach-comp-b", IDS.projectB],
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

  for (const [team, comp, slug] of [
    [IDS.teamA, IDS.compA, "reach-team-a"],
    [IDS.teamB, IDS.compB, "reach-team-b"],
  ] as const) {
    await db.execute(sql`
      insert into platform.teams (id, "competitionId", slug, name, "joinCode", "createdBy")
      values (${team}::uuid, ${comp}::uuid, ${slug}, ${slug},
              ${slug.toUpperCase().slice(0, 6)}, ${IDS.lead}::uuid)
    `);
    // The same person leads both, which is what lets one environment attach to
    // both: the composite FKs require the environment's owner to be the lead of
    // every team attached to it.
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
      values (${team}::uuid, ${comp}::uuid, ${IDS.lead}::uuid, 'lead')
    `);
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
      values (${team}::uuid, ${comp}::uuid, ${IDS.member}::uuid, 'member')
    `);
  }

  const [secret] = await db.execute<{ id: string }>(sql`
    select vault.create_secret('reach-secret', 'reachtest-secret') as id
  `);

  await db.execute(sql`
    insert into platform."sandboxEnvironments"
      (id, name, kind, "ownerUserId", "projectRef", "apiUrl", "publishableKey",
       "secretKeySecretId", "jwtSecretId", "proxyHostname", status)
    values (${IDS.env}::uuid, 'Reach Env', 'owned', ${IDS.lead}::uuid,
            'reachref', 'https://reachref.supabase.co', 'sb_publishable_R',
            ${secret!.id}::uuid, ${secret!.id}::uuid,
            'reachtest-sandbox.devdogsuga.org', 'active')
  `);

  for (const [team, comp] of [
    [IDS.teamA, IDS.compA],
    [IDS.teamB, IDS.compB],
  ] as const) {
    void comp;
    await db.execute(sql`
      insert into platform."teamEnvironments"
        ("teamId", "environmentId", "ownerUserId", "attachedBy")
      values (${team}::uuid, ${IDS.env}::uuid, ${IDS.lead}::uuid, ${IDS.lead}::uuid)
    `);
  }
});

afterAll(cleanup);

describe("isReachable", () => {
  it("is true through any attached team", async () => {
    expect(await isReachable(IDS.env, IDS.member)).toBe(true);
    expect(await isReachable(IDS.env, IDS.lead)).toBe(true);
  });

  it("is false for somebody on no attached team", async () => {
    expect(await isReachable(IDS.env, IDS.outsider)).toBe(false);
  });
});

describe("issueCredentials", () => {
  it("issues both scopes at once", async () => {
    const issued = await issueCredentials(IDS.env, IDS.member);
    expect(issued.map((i) => i.scope).sort()).toEqual([
      "publishable",
      "secret",
    ]);
    // Issuing them separately would allow a state where somebody holds a secret
    // token and no publishable one, which reads as elevated-by-default.
    expect(await statuses(IDS.member)).toEqual([
      "publishable:active",
      "secret:active",
    ]);
  });

  it("returns plaintext exactly once and stores only hashes", async () => {
    const issued = await issueCredentials(IDS.env, IDS.lead);
    for (const { token } of issued) {
      const [row] = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from platform."sandboxCredentials"
         where "tokenHash" = ${token}
      `);
      expect(row!.n).toBe(0);
    }
  });

  it("refuses to issue to somebody unreachable", async () => {
    await expect(issueCredentials(IDS.env, IDS.outsider)).rejects.toThrow(
      /not on any team/,
    );
  });

  it("reactivates the same row rather than adding a second", async () => {
    await disableCredentials(IDS.env, IDS.member);
    expect(await statuses(IDS.member)).toEqual([
      "publishable:disabled",
      "secret:disabled",
    ]);

    await issueCredentials(IDS.env, IDS.member);
    // Still exactly two rows -- history, lastUsedAt and the audit trail survive.
    expect(await statuses(IDS.member)).toEqual([
      "publishable:active",
      "secret:active",
    ]);
  });
});

describe("reconcileEnvironmentAccess", () => {
  it("leaves access alone when a member is removed from only one of two teams", async () => {
    // The case the whole design turns on.
    await db.execute(sql`
      delete from platform."teamMembers"
      where "teamId" = ${IDS.teamA}::uuid and "userId" = ${IDS.member}::uuid
    `);

    const result = await reconcileEnvironmentAccess(IDS.env);
    expect(result.disabled).toBe(0);
    expect(await statuses(IDS.member)).toEqual([
      "publishable:active",
      "secret:active",
    ]);
    expect(await isReachable(IDS.env, IDS.member)).toBe(true);
  });

  it("disables access once the last attached team is gone", async () => {
    await db.execute(sql`
      delete from platform."teamMembers"
      where "teamId" = ${IDS.teamB}::uuid and "userId" = ${IDS.member}::uuid
    `);

    const result = await reconcileEnvironmentAccess(IDS.env);
    expect(result.disabled).toBe(2);
    expect(await statuses(IDS.member)).toEqual([
      "publishable:disabled",
      "secret:disabled",
    ]);
  });

  it("does not touch the owner's own credentials", async () => {
    expect(await statuses(IDS.lead)).toEqual([
      "publishable:active",
      "secret:active",
    ]);
  });

  it("reinstates a returning member without minting a token nobody saw", async () => {
    await db.execute(sql`
      insert into platform."teamMembers" ("teamId", "competitionId", "userId", role)
      values (${IDS.teamA}::uuid, ${IDS.compA}::uuid, ${IDS.member}::uuid, 'member')
    `);

    const result = await reconcileEnvironmentAccess(IDS.env);
    expect(result.reinstated).toBe(2);
    expect(await statuses(IDS.member)).toEqual([
      "publishable:active",
      "secret:active",
    ]);
  });
});

describe("revokeAllCredentials", () => {
  it("is terminal and covers everybody on the environment", async () => {
    const count = await revokeAllCredentials(IDS.env);
    expect(count).toBe(4); // two members, two scopes each
    expect(await statuses(IDS.member)).toEqual([
      "publishable:revoked",
      "secret:revoked",
    ]);
    expect(await statuses(IDS.lead)).toEqual([
      "publishable:revoked",
      "secret:revoked",
    ]);
  });

  it("is not undone by a reconcile", async () => {
    // Revoked means the environment is gone. A roster change must never bring
    // a credential back from it.
    await reconcileEnvironmentAccess(IDS.env);
    expect(await statuses(IDS.lead)).toEqual([
      "publishable:revoked",
      "secret:revoked",
    ]);
  });
});
