/**
 * RLS persona tests for the environment gate, permission helpers, and app
 * registry.
 *
 * Every case asserts both an allow and a deny. A policy test that only checks
 * the allow side passes just as happily when the policy is missing entirely.
 *
 * Requires the local stack (`pnpm sb start-local-stack`) with migrations and
 * seeds applied (`pnpm sb reset-local-database`). Run via
 * `pnpm sb test:rls`, which supplies the local credentials.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ROOT_ROLE_ID,
  admin,
  anon,
  createPersona,
  deleteRole,
  destroyPersonas,
  grantRole,
  makeTestAccount,
  suspend,
  withEnvironment,
  type Persona,
} from "./personas";

let member: Persona;
let moderator: Persona;
let suspended: Persona;
let testAccount: Persona;
let moderatorRoleId: string;

beforeAll(async () => {
  member = await createPersona("member");
  moderator = await createPersona("moderator");
  suspended = await createPersona("suspended");
  testAccount = await createPersona("testaccount");

  moderatorRoleId = await grantRole(moderator, "Moderator", {
    canModerate: true,
  });
  await suspend(suspended);
  await makeTestAccount(testAccount, member);
}, 60_000);

afterAll(async () => {
  await deleteRole(moderatorRoleId);
  await destroyPersonas(member, moderator, suspended, testAccount);
});

describe("platform.instance", () => {
  it("is readable by anyone, including anonymously", async () => {
    const { data: anonRow } = await anon()
      .from("instance")
      .select("environment")
      .single();
    expect(anonRow?.environment).toBeTruthy();

    const { data: memberRow } = await member.client
      .from("instance")
      .select("environment")
      .single();
    expect(memberRow?.environment).toBeTruthy();
  });

  it("cannot be written by a client, at any persona", async () => {
    // A denied UPDATE under RLS is not an error -- it simply matches no rows.
    // Asserting on the error would pass even if the write had succeeded, so
    // read the value back instead.
    for (const client of [anon(), member.client, moderator.client]) {
      await client
        .from("instance")
        .update({ environment: "production" })
        .eq("id", true);
    }

    const { data } = await admin()
      .from("instance")
      .select("environment")
      .single();
    expect(data?.environment).not.toBe("production");
  });
});

describe("platform.has_permission", () => {
  it("reflects a granted role and denies one that was not granted", async () => {
    const a = admin();

    const { data: canModerate } = await a.rpc("has_permission", {
      uid: moderator.userId,
      perm: "canModerate",
    });
    expect(canModerate).toBe(true);

    const { data: canManageRoles } = await a.rpc("has_permission", {
      uid: moderator.userId,
      perm: "canManageRoles",
    });
    expect(canManageRoles).toBe(false);

    const { data: plain } = await a.rpc("has_permission", {
      uid: member.userId,
      perm: "canModerate",
    });
    expect(plain).toBe(false);
  });

  it("returns false for an unknown or hostile permission key", async () => {
    const a = admin();

    const { data: unknown, error: unknownError } = await a.rpc(
      "has_permission",
      { uid: moderator.userId, perm: "notARealPermission" },
    );
    expect(unknownError).toBeNull();
    expect(unknown).toBe(false);

    const { data: injection, error: injectionError } = await a.rpc(
      "has_permission",
      { uid: moderator.userId, perm: '"; drop table "platform"."roles"; --' },
    );
    expect(injectionError).toBeNull();
    expect(injection).toBe(false);

    // The table the injection attempt named is still there.
    const { count } = await a
      .from("roles")
      .select("*", { count: "exact", head: true });
    expect(count).toBeGreaterThan(0);
  });
});

describe("platform.is_suspended", () => {
  it("is true only for a global suspension", async () => {
    const a = admin();

    const { data: isSuspended } = await a.rpc("is_suspended", {
      uid: suspended.userId,
    });
    expect(isSuspended).toBe(true);

    const { data: notSuspended } = await a.rpc("is_suspended", {
      uid: member.userId,
    });
    expect(notSuspended).toBe(false);
  });

  it("ignores suspensions scoped to a single service", async () => {
    const a = admin();
    await a
      .from("userSuspensions")
      .insert({ userId: member.userId, service: "some_app" });

    const { data } = await a.rpc("is_suspended", { uid: member.userId });
    expect(data).toBe(false);

    await a
      .from("userSuspensions")
      .delete()
      .eq("userId", member.userId)
      .eq("service", "some_app");
  });
});

describe("test identities", () => {
  it("are recognised, and their owner is not", async () => {
    const a = admin();

    const { data: isTest } = await a.rpc("is_test_identity", {
      uid: testAccount.userId,
    });
    expect(isTest).toBe(true);

    const { data: ownerIsTest } = await a.rpc("is_test_identity", {
      uid: member.userId,
    });
    expect(ownerIsTest).toBe(false);
  });

  it("are denied the org-wide config an ordinary member can read", async () => {
    // The allow side: without it, a passing deny proves nothing.
    const { data: memberRoles } = await member.client
      .from("roles")
      .select("id");
    expect(memberRoles?.length).toBeGreaterThan(0);

    // reportContentTypes is deliberately absent: content types are derived from
    // each app's own schema now rather than stored as a per-client label list,
    // so the table it used to deny access to no longer exists. contentTypes,
    // which holds the overrides and declarations that replaced it, is in the
    // same category and carries the same restrictive policy.
    for (const table of [
      "roles",
      "reportReasons",
      "feedbackTopics",
      "contentTypes",
    ]) {
      const { data } = await testAccount.client.from(table).select("*");
      expect(data, `${table} should be invisible to a test identity`).toEqual(
        [],
      );
    }
  });

  it("cannot write the config either", async () => {
    const { error } = await testAccount.client.from("roles").insert({
      title: "sneaky",
      description: "",
      roleType: "custom",
      rank: 1,
    });
    expect(error).not.toBeNull();
  });
});

describe("platform.apps", () => {
  it("is publicly readable and lists the registered schemas", async () => {
    const { data } = await anon().from("apps").select("slug, schemaName");
    const slugs = (data ?? []).map((r) => r.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "platform",
        "schedule_builder",
        "study_group_finder",
      ]),
    );
  });

  it("rejects a registration naming a schema that does not exist", async () => {
    const { error } = await admin().from("apps").insert({
      slug: "ghost",
      schemaName: "no_such_schema",
      displayName: "Ghost",
    });
    expect(error?.message).toMatch(/does not exist/);
  });

  it("cannot be written by a client", async () => {
    const { error } = await member.client.from("apps").insert({
      slug: "rogue",
      schemaName: "platform",
      displayName: "Rogue",
    });
    expect(error).not.toBeNull();
  });
});

describe("platform.reports", () => {
  it("is not directly writable, even by a moderator", async () => {
    // Reports are created through an RPC that resolves the content and fills
    // the snapshot from source. A client that could insert directly would be
    // able to fabricate both.
    const { error } = await moderator.client.from("reports").insert({
      appId: "00000000-0000-0000-0000-000000000000",
      reporterUserId: moderator.userId,
      reportedUserId: member.userId,
      contentType: "post",
      contentRef: "1",
      contentSnapshot: "fabricated",
      reasonId: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("is readable by a moderator and not by an ordinary member", async () => {
    const { error: modError } = await moderator.client
      .from("reports")
      .select("id");
    expect(modError).toBeNull();

    const { data: memberRows } = await member.client
      .from("reports")
      .select("id");
    expect(memberRows).toEqual([]);
  });
});

describe("platform.feedback", () => {
  it("lets a member read their own and not another's", async () => {
    const a = admin();
    const platformApp = await a
      .from("apps")
      .select("id")
      .eq("slug", "platform")
      .single();

    const { data: inserted } = await a
      .from("feedback")
      .insert({
        userId: member.userId,
        appId: platformApp.data!.id,
        type: "bug_report",
        title: "Persona feedback",
        description: "Filed by the persona suite.",
      })
      .select("id")
      .single();

    try {
      const { data: own } = await member.client
        .from("feedback")
        .select("id")
        .eq("id", inserted!.id);
      expect(own).toHaveLength(1);

      const { data: other } = await moderator.client
        .from("feedback")
        .select("id")
        .eq("id", inserted!.id);
      expect(other).toEqual([]);
    } finally {
      await a.from("feedback").delete().eq("id", inserted!.id);
    }
  });
});

describe("platform.claim_root", () => {
  it("refuses on a production instance", async () => {
    await withEnvironment("production", async () => {
      const { error } = await member.client.rpc("claim_root");
      expect(error?.message).toMatch(/not available on a production instance/);
    });
  });

  it("grants Root when unheld, then refuses a second claim", async () => {
    const a = admin();
    const { data: existing } = await a
      .from("userRoles")
      .select("userId")
      .eq("roleId", ROOT_ROLE_ID);

    // The seeded instance may already have a Root holder; park it so this test
    // exercises the unheld path, and restore it afterwards.
    const priorHolder = existing?.[0]?.userId as string | undefined;
    if (priorHolder) {
      await a
        .from("userRoles")
        .delete()
        .eq("roleId", ROOT_ROLE_ID)
        .eq("userId", priorHolder);
    }

    try {
      const { error } = await member.client.rpc("claim_root");
      expect(error).toBeNull();

      const { data: held } = await a
        .from("userRoles")
        .select("userId")
        .eq("roleId", ROOT_ROLE_ID)
        .single();
      expect(held?.userId).toBe(member.userId);

      // Root confers every permission through the matview's special case.
      const { data: canModerate } = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canModerate",
      });
      expect(canModerate).toBe(true);

      const { error: second } = await moderator.client.rpc("claim_root");
      expect(second?.message).toMatch(/already held/);
    } finally {
      await a
        .from("userRoles")
        .delete()
        .eq("roleId", ROOT_ROLE_ID)
        .eq("userId", member.userId);
      if (priorHolder) {
        await a
          .from("userRoles")
          .insert({ userId: priorHolder, roleId: ROOT_ROLE_ID });
      }
    }
  });

  it("requires a session", async () => {
    const { error } = await anon().rpc("claim_root");
    expect(error).not.toBeNull();
  });
});

describe("platform.profile durable identity", () => {
  // The profile UPDATE policy is a permissive `auth.uid() = "userId"`, which
  // decides which ROW a member may write, not which columns. Keeping them out
  // of `ugaEmail` / `legal*` is column-level grants instead, so these cases
  // exercise a different mechanism from every other test in this file — and
  // one that fails open if the table-wide UPDATE grant is ever restored.
  beforeAll(async () => {
    await admin().from("profile").insert({
      userId: member.userId,
      preferredName: "Member Persona",
      ugaEmail: "member-persona@uga.edu",
      legalFirstName: "Member",
      legalLastName: "Persona",
    });
  }, 30_000);

  it("lets a member edit the profile fields that are theirs", async () => {
    const { error } = await member.client
      .from("profile")
      .update({ bio: "edited by the member" })
      .eq("userId", member.userId);
    expect(error).toBeNull();
  });

  it("refuses a member rewriting their own UGA email", async () => {
    const { error } = await member.client
      .from("profile")
      .update({ ugaEmail: "someone-else@uga.edu" })
      .eq("userId", member.userId);
    expect(error).not.toBeNull();

    const { data } = await admin()
      .from("profile")
      .select("ugaEmail")
      .eq("userId", member.userId)
      .single();
    expect(data?.ugaEmail).toBe("member-persona@uga.edu");
  });

  it("refuses a member rewriting their own legal name", async () => {
    const { error } = await member.client
      .from("profile")
      .update({ legalFirstName: "Someone" })
      .eq("userId", member.userId);
    expect(error).not.toBeNull();
  });

  it("holds one row per UGA email, case-folded", async () => {
    const a = admin();
    // Its own address rather than the member's: the cases above write to that
    // one, so reusing it would make this test pass or fail on ordering.
    const address = `dup-${crypto.randomUUID().slice(0, 8)}@uga.edu`;

    const { error: first } = await a.from("profile").insert({
      userId: moderator.userId,
      preferredName: "Moderator Persona",
      ugaEmail: address,
    });
    expect(first).toBeNull();

    const { error: duplicate } = await a.from("profile").insert({
      userId: suspended.userId,
      preferredName: "Suspended Persona",
      ugaEmail: address,
    });
    expect(duplicate?.code).toBe("23505");

    // Uppercase is rejected outright rather than stored as a second identity
    // for the same person — the import lowercases, and this is what keeps a
    // future writer from bypassing it.
    const { error: mixedCase } = await a.from("profile").insert({
      userId: suspended.userId,
      preferredName: "Suspended Persona",
      ugaEmail: address.toUpperCase(),
    });
    expect(mixedCase?.code).toBe("23514");
  });
});

describe("platform meetings, teams and attendance", () => {
  const projectId = "aaaaaaaa-0000-4000-a000-000000000001";
  const meetingId = "bbbbbbbb-0000-4000-a000-000000000001";
  const workshopId = "cccccccc-0000-4000-a000-000000000001";
  const competitionId = "dddddddd-0000-4000-a000-000000000001";
  const teamId = "eeeeeeee-0000-4000-a000-000000000001";

  beforeAll(async () => {
    const a = admin();
    const now = Date.now();
    await a
      .from("projects")
      .insert({ id: projectId, slug: "rls-proj", displayName: "RLS Project" });
    await a.from("meetings").insert({
      id: meetingId,
      slug: "rls-meeting",
      name: "RLS Meeting",
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
      checkInClosesAt: new Date(now + 3_600_000).toISOString(),
    });
    await a.from("workshops").insert({ id: workshopId, meetingId, projectId });
    await a
      .from("competitions")
      .insert({ id: competitionId, slug: "rls-comp", workshopId });
    await a.from("teams").insert({
      id: teamId,
      competitionId,
      slug: "rls-team",
      name: "RLS Team",
      joinCode: "SECRET-CODE",
      createdBy: member.userId,
    });
    await a
      .from("teamMembers")
      .insert({ teamId, competitionId, userId: member.userId, role: "lead" });
    await a.from("attendance").insert({
      meetingId,
      workshopId,
      userId: member.userId,
      method: "code",
    });
  }, 60_000);

  afterAll(async () => {
    // meetings cascades to workshops -> competitions -> teams -> members,
    // and to attendance; projects is restricted by workshops so it goes last.
    await admin().from("meetings").delete().eq("id", meetingId);
    await admin().from("projects").delete().eq("id", projectId);
  });

  it("publishes the schedule to logged-out visitors", async () => {
    const client = anon();
    for (const table of [
      "projects",
      "meetings",
      "workshops",
      "competitions",
    ] as const) {
      const { data, error } = await client.from(table).select("id");
      expect(error, `${table} should be anon-readable`).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("refuses client writes to the schedule", async () => {
    // As with platform.instance above: a denied UPDATE is not an error, it
    // matches no rows. Read the value back rather than asserting on `error`,
    // which would pass just as happily if the write had landed.
    for (const client of [anon(), member.client, moderator.client]) {
      await client
        .from("meetings")
        .update({ name: "hacked" })
        .eq("id", meetingId);
    }

    const { data } = await admin()
      .from("meetings")
      .select("name")
      .eq("id", meetingId)
      .single();
    expect(data?.name).toBe("RLS Meeting");

    // INSERT does surface an error, so the deny side is directly observable.
    const { error: insert } = await member.client.from("meetings").insert({
      slug: "rogue-meeting",
      name: "Rogue",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      checkInClosesAt: new Date(Date.now() + 1_800_000).toISOString(),
    });
    expect(insert).not.toBeNull();
  });

  // The join code is the entire secret a join code consists of. A row policy
  // cannot say "every column but one", so this is a column grant — and the
  // case that matters is the signed-in member, not the anonymous visitor.
  it("never serves joinCode to any client", async () => {
    const { error: anonRead } = await anon()
      .from("teams")
      .select("joinCode")
      .eq("id", teamId);
    expect(anonRead).not.toBeNull();

    const { error: memberRead } = await member.client
      .from("teams")
      .select("joinCode")
      .eq("id", teamId);
    expect(memberRead).not.toBeNull();

    // The rest of the row still reads, or the meetings page breaks.
    const { data, error } = await anon()
      .from("teams")
      .select("id, name, slug, competitionId")
      .eq("id", teamId)
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("RLS Team");
  });

  it("keeps rosters signed-in-only", async () => {
    const { data: anonRows } = await anon()
      .from("teamMembers")
      .select("userId");
    expect(anonRows ?? []).toHaveLength(0);

    const { data: memberRows, error } = await member.client
      .from("teamMembers")
      .select("userId");
    expect(error).toBeNull();
    expect(memberRows?.length ?? 0).toBeGreaterThan(0);
  });

  // Officers read other people's attendance through a server action holding
  // canEditAttendance, so no broad `authenticated` read has to exist.
  it("shows a member their own attendance and nobody else's", async () => {
    const { data: own, error } = await member.client
      .from("attendance")
      .select("userId");
    expect(error).toBeNull();
    expect(own?.length ?? 0).toBeGreaterThan(0);
    expect(own?.every((r) => r.userId === member.userId)).toBe(true);

    const { data: other } = await moderator.client
      .from("attendance")
      .select("userId")
      .eq("userId", member.userId);
    expect(other ?? []).toHaveLength(0);
  });

  it("resolves the three new permissions", async () => {
    const a = admin();
    for (const perm of [
      "canEditAttendance",
      "canExportStars",
      "canTriggerSync",
    ] as const) {
      const { data: before } = await a.rpc("has_permission", {
        uid: member.userId,
        perm,
      });
      expect(before, `${perm} should start false`).toBe(false);
    }

    const roleId = await grantRole(member, "Attendance Officer", {
      canEditAttendance: true,
    });
    try {
      const { data: granted } = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canEditAttendance",
      });
      expect(granted).toBe(true);

      // Granting one must not grant its neighbours — they are separate
      // columns precisely because they have different audiences.
      const { data: neighbour } = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canExportStars",
      });
      expect(neighbour).toBe(false);
    } finally {
      await deleteRole(roleId);
    }
  });
});
