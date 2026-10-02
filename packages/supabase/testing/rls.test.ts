/**
 * RLS persona tests for the permission helpers and the app registry.
 *
 * Every case asserts both an allow and a deny. A policy test that only checks
 * the allow side passes just as happily when the policy is missing entirely.
 *
 * Requires the local stack (`pnpm devtools link`) with migrations and
 * seeds applied (`pnpm devtools reset`). Run via
 * `pnpm --filter @devdogsuga/supabase test:rls`, which supplies the local credentials.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  createPersona,
  deleteRole,
  destroyPersonas,
  grantRole,
  makeTestAccount,
  sql,
  suspend,
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

    // reportContentTypes is deliberately absent: content types are derived
    // from each app's own schema rather than stored as a per-client label
    // list, and no such table exists. contentTypes, which holds the
    // overrides and declarations, is in the same category and carries the
    // same restrictive policy.
    for (const table of ["roles", "reportReasons", "contentTypes"]) {
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

describe("platform.profile durable identity", () => {
  // The profile UPDATE policy is a permissive `auth.uid() = "userId"`, which
  // decides which ROW a member may write, not which columns. Keeping them out
  // of `ugaEmail` / `legal*` is column-level grants instead. These cases
  // exercise a different mechanism from every other test in this file, one
  // that fails open if the table-wide UPDATE grant is ever restored.
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
    // for the same person. The import lowercases, and this check is what keeps
    // a future writer from bypassing it.
    const { error: mixedCase } = await a.from("profile").insert({
      userId: suspended.userId,
      preferredName: "Suspended Persona",
      ugaEmail: address.toUpperCase(),
    });
    expect(mixedCase?.code).toBe("23514");
  });
});

describe("platform meetings, teams and attendance", () => {
  const meetingId = "bbbbbbbb-0000-4000-a000-000000000001";
  const workshopId = "cccccccc-0000-4000-a000-000000000001";
  const competitionId = "dddddddd-0000-4000-a000-000000000001";
  const teamId = "eeeeeeee-0000-4000-a000-000000000001";
  const reflectionId = "ffffffff-0000-4000-a000-000000000001";
  const auditEventId = "11111111-0000-4000-a000-000000000001";

  beforeAll(async () => {
    const a = admin();
    const now = Date.now();
    await a.from("meetings").insert({
      id: meetingId,
      slug: "rls-meeting",
      nameOverride: "RLS Meeting",
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    });
    await a
      .from("workshops")
      .insert({ id: workshopId, meetingId, project: "RLS Project" });
    await a.from("competitions").insert({
      id: competitionId,
      slug: "rls-comp",
      issueNodeId: "RLS_ISSUE_NODE_ID",
      issueNumber: 1,
      repo: "DevDogsUGA/DevDogsUGA",
      url: "https://github.com/DevDogsUGA/DevDogsUGA/issues/1",
      title: "RLS Competition",
      kickedOffAt: new Date(now).toISOString(),
    });
    await a.from("teams").insert({
      id: teamId,
      slug: "rls-team",
      name: "RLS Team",
      joinCode: "SECRET-CODE",
      createdBy: member.userId,
    });
    await a
      .from("teamMembers")
      .insert({ teamId, userId: member.userId, role: "lead" });
    // A departed stint: joined and left before this fixture ran, so it
    // exercises the "leftAt is not null" branch of the roster policy rather
    // than only ever the current-roster branch.
    await a.from("teamMembers").insert({
      teamId,
      userId: moderator.userId,
      role: "member",
      joinedAt: new Date(now - 172_800_000).toISOString(),
      leftAt: new Date(now - 86_400_000).toISOString(),
    });
    await a.from("attendance").insert({
      meetingId,
      userId: member.userId,
      method: "qr",
    });
    await a.from("reflections").insert({
      id: reflectionId,
      meetingId,
      userId: member.userId,
      content: "A draft reflection",
    });
    await a.from("auditEvents").insert({
      id: auditEventId,
      actorType: "system",
      source: "system",
      action: "test.fixture.created",
      targetType: "meeting",
      targetId: meetingId,
    });
  }, 60_000);

  afterAll(async () => {
    // Append-only triggers intentionally apply to service-role calls as well.
    // Test cleanup uses the database-owner connection and disables replication
    // triggers only around these deterministic fixture rows.
    await sql()`set session_replication_role = replica`;
    try {
      await sql()`delete from platform."reflectionRevisions" where "reflectionId" = ${reflectionId}`;
      await sql()`delete from platform."auditEvents" where id = ${auditEventId}`;
    } finally {
      await sql()`set session_replication_role = origin`;
    }
    await admin().from("reflections").delete().eq("id", reflectionId);
    // Attendance deliberately restricts hard deletion of its meeting, so
    // evidence is removed explicitly before this test fixture's schedule.
    await admin().from("attendance").delete().eq("meetingId", meetingId);
    await admin().from("meetings").delete().eq("id", meetingId);
  });

  it("publishes the schedule to logged-out visitors", async () => {
    const client = anon();
    for (const table of ["meetings", "workshops", "competitions"] as const) {
      const { data, error } = await client.from(table).select("id");
      expect(error, `${table} should be anon-readable`).toBeNull();
      expect(data?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // No fixture row here: this is a read-only-policy check, so an empty
  // table is a legitimate answer. In production the pull_request webhook
  // and reconcileEntries backstop keep this table populated, but the RLS
  // policy under test doesn't care whether any rows exist.
  it("publishes competition entries to logged-out visitors, read-only", async () => {
    const client = anon();
    const { data, error } = await client
      .from("competitionEntries")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: insert } = await member.client
      .from("competitionEntries")
      .insert({
        competitionId,
        teamId,
        prNodeId: "PR_rogue",
        prNumber: 1,
        url: "https://github.com/DevDogsUGA/DevDogsUGA/pull/1",
        openedAt: new Date().toISOString(),
      });
    expect(insert?.code).toBe("42501");
  });

  it("refuses client writes to the schedule", async () => {
    // A denied UPDATE is not an error under RLS, it
    // matches no rows. Read the value back rather than asserting on `error`,
    // which would pass just as happily if the write had landed.
    for (const client of [anon(), member.client, moderator.client]) {
      await client
        .from("meetings")
        .update({ nameOverride: "hacked" })
        .eq("id", meetingId);
    }

    const { data } = await admin()
      .from("meetings")
      .select("nameOverride")
      .eq("id", meetingId)
      .single();
    expect(data?.nameOverride).toBe("RLS Meeting");

    // INSERT does surface an error, so the deny side is directly observable.
    const { error: insert } = await member.client.from("meetings").insert({
      slug: "rogue-meeting",
      nameOverride: "Rogue",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    // ⚠️ Assert the code, not that some error happened.
    //
    // `expect(insert).not.toBeNull()` was the whole assertion, and it stopped
    // meaning anything the moment this fixture went stale: PostgREST rejected
    // the insert for naming a column that no longer existed, which is an
    // error, so the test passed. It would have passed identically with RLS
    // switched off entirely.
    //
    // 42501 is insufficient_privilege, which is what a policy denial raises.
    // PGRST204 (unknown column) and 23502 (not-null violation) now fail here
    // instead of masquerading as a pass.
    expect(insert?.code).toBe("42501");
  });

  // The join code is the whole secret. A row policy cannot say "every column
  // but one", so this is a column grant. The case that matters is the
  // signed-in member, not the anonymous visitor.
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
      .select("id, name, slug, createdBy")
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

  // A departed stint is history, not roster: it names when someone joined and
  // left, which the design note's "the team page shows who is on each team"
  // does not extend to every signed-in account. Only the team's own current
  // members can see it; `suspended` is on no team at all.
  it("hides a departed member's stint from non-members but shows it to the team", async () => {
    const { data: outsiderRows } = await suspended.client
      .from("teamMembers")
      .select("userId")
      .eq("teamId", teamId)
      .not("leftAt", "is", null);
    expect(outsiderRows ?? []).toHaveLength(0);

    const { data: insiderRows, error } = await member.client
      .from("teamMembers")
      .select("userId")
      .eq("teamId", teamId)
      .not("leftAt", "is", null);
    expect(error).toBeNull();
    expect(insiderRows?.some((r) => r.userId === moderator.userId)).toBe(true);
  });

  // Officers read other people's attendance through a server action holding
  // canManageAttendance, so no broad `authenticated` read has to exist.
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

  it("does not let any client forge attendance", async () => {
    const { error } = await member.client.from("attendance").insert({
      meetingId,
      userId: moderator.userId,
      method: "manual_code",
    });
    expect(error?.code).toBe("42501");
  });

  it("shows a member their own reflection and keeps it server-written", async () => {
    const { data: own, error: ownError } = await member.client
      .from("reflections")
      .select("id, content")
      .eq("id", reflectionId);
    expect(ownError).toBeNull();
    expect(own).toEqual([{ id: reflectionId, content: "A draft reflection" }]);

    const { data: other } = await moderator.client
      .from("reflections")
      .select("id")
      .eq("id", reflectionId);
    expect(other).toEqual([]);

    await member.client
      .from("reflections")
      .update({ content: "A forged edit" })
      .eq("id", reflectionId);
    const { data: stored } = await admin()
      .from("reflections")
      .select("content")
      .eq("id", reflectionId)
      .single();
    expect(stored?.content).toBe("A draft reflection");
  });

  it("limits revision and audit history to the owner or an auditor", async () => {
    const { data: revision, error: revisionError } = await admin()
      .from("reflectionRevisions")
      .insert({
        reflectionId,
        userId: member.userId,
        meetingId,
        content: "Submitted reflection snapshot",
        createdByUserId: member.userId,
      })
      .select("id")
      .single();
    expect(revisionError).toBeNull();

    const { data: own } = await member.client
      .from("reflectionRevisions")
      .select("id")
      .eq("id", revision!.id);
    expect(own).toHaveLength(1);

    const { data: beforeGrant } = await moderator.client
      .from("reflectionRevisions")
      .select("id")
      .eq("id", revision!.id);
    expect(beforeGrant).toEqual([]);

    const roleId = await grantRole(moderator, "Audit Reader", {
      canViewAuditLog: true,
    });
    try {
      const { data: revisions } = await moderator.client
        .from("reflectionRevisions")
        .select("id")
        .eq("id", revision!.id);
      expect(revisions).toHaveLength(1);

      const { data: events } = await moderator.client
        .from("auditEvents")
        .select("id")
        .eq("id", auditEventId);
      expect(events).toHaveLength(1);
    } finally {
      await deleteRole(roleId);
    }
  });

  it("enforces append-only audit events below the application layer", async () => {
    const { error } = await admin()
      .from("auditEvents")
      .update({ action: "test.fixture.rewritten" })
      .eq("id", auditEventId);
    expect(error?.code).toBe("55000");

    const { data } = await member.client
      .from("auditEvents")
      .select("id")
      .eq("id", auditEventId);
    expect(data).toEqual([]);
  });

  it("resolves the two new permissions", async () => {
    const a = admin();
    for (const perm of ["canManageAttendance", "canPreviewDocs"] as const) {
      const { data: before } = await a.rpc("has_permission", {
        uid: member.userId,
        perm,
      });
      expect(before, `${perm} should start false`).toBe(false);
    }

    const roleId = await grantRole(member, "Attendance Officer", {
      canManageAttendance: true,
    });
    try {
      const { data: granted } = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canManageAttendance",
      });
      expect(granted).toBe(true);

      // Granting one must not grant its neighbours. They are separate
      // columns because they have different audiences.
      const { data: neighbour } = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canPreviewDocs",
      });
      expect(neighbour).toBe(false);
    } finally {
      await deleteRole(roleId);
    }
  });
});

describe("platform check-in survey", () => {
  const meetingId = "bbbbbbbb-0000-4000-a000-000000000047";
  const questionId = "rls_survey_question";

  beforeAll(async () => {
    const a = admin();
    const now = Date.now();
    await a.from("meetings").insert({
      id: meetingId,
      slug: "rls-survey-meeting",
      nameOverride: "RLS Survey Meeting",
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
      surveyQuestionIds: [questionId],
    });
    await a.from("surveyQuestions").insert({
      id: questionId,
      scope: "meeting",
      type: "text",
      definition: {
        id: questionId,
        scope: "meeting",
        prompt: "RLS?",
        type: "text",
      },
    });
    await a.from("surveyAnswers").insert({
      userId: member.userId,
      questionId,
      meetingId,
      answer: { text: "Mine" },
    });
    await a.from("surveyAnswerRevisions").insert({
      userId: member.userId,
      questionId,
      meetingId,
      answer: { text: "Mine" },
    });
  }, 60_000);

  afterAll(async () => {
    await sql()`set session_replication_role = replica`;
    try {
      await sql()`delete from platform."surveyAnswerRevisions" where "questionId" = ${questionId}`;
    } finally {
      await sql()`set session_replication_role = origin`;
    }
    await admin().from("surveyAnswers").delete().eq("questionId", questionId);
    await admin().from("surveyQuestions").delete().eq("id", questionId);
    await admin().from("meetings").delete().eq("id", meetingId);
  });

  it("publishes questions read-only, even to logged-out visitors", async () => {
    const { data } = await anon()
      .from("surveyQuestions")
      .select("id")
      .eq("id", questionId);
    expect(data).toEqual([{ id: questionId }]);

    const { error } = await member.client.from("surveyQuestions").insert({
      id: "rls_forged_question",
      scope: "member",
      type: "text",
      definition: {},
    });
    expect(error?.code).toBe("42501");
  });

  it("shows a member their own answers, nobody else's, and keeps them server-written", async () => {
    const { data: own } = await member.client
      .from("surveyAnswers")
      .select("answer")
      .eq("questionId", questionId);
    expect(own).toEqual([{ answer: { text: "Mine" } }]);

    const { data: other } = await moderator.client
      .from("surveyAnswers")
      .select("id")
      .eq("questionId", questionId);
    expect(other).toEqual([]);

    const { error } = await moderator.client.from("surveyAnswers").insert({
      userId: moderator.userId,
      questionId,
      meetingId,
      answer: { text: "Forged" },
    });
    expect(error?.code).toBe("42501");

    await member.client
      .from("surveyAnswers")
      .update({ answer: { text: "Edited directly" } })
      .eq("questionId", questionId);
    const { data: stored } = await admin()
      .from("surveyAnswers")
      .select("answer")
      .eq("questionId", questionId)
      .single();
    expect(stored?.answer).toEqual({ text: "Mine" });
  });

  it("keeps answer history append-only and readable by the owner or an auditor", async () => {
    const { error } = await admin()
      .from("surveyAnswerRevisions")
      .update({ answer: { text: "Rewritten" } })
      .eq("questionId", questionId);
    expect(error?.code).toBe("55000");

    const { data: own } = await member.client
      .from("surveyAnswerRevisions")
      .select("id")
      .eq("questionId", questionId);
    expect(own).toHaveLength(1);

    const { data: beforeGrant } = await moderator.client
      .from("surveyAnswerRevisions")
      .select("id")
      .eq("questionId", questionId);
    expect(beforeGrant).toEqual([]);

    const roleId = await grantRole(moderator, "Survey Audit Reader", {
      canViewAuditLog: true,
    });
    try {
      const { data } = await moderator.client
        .from("surveyAnswerRevisions")
        .select("id")
        .eq("questionId", questionId);
      expect(data).toHaveLength(1);
    } finally {
      await deleteRole(roleId);
    }
  });
});

describe("platform.docsPages", () => {
  const paths = ["t372/live", "t372/past", "t372/future"];

  afterAll(async () => {
    await sql()`delete from platform."docsPages" where path like 't372/%'`;
  });

  it("shows a page from its scheduled time on, and hides it before", async () => {
    await sql()`
      insert into platform."docsPages" (path, title, "plainText", "publishAt")
      values
        (${paths[0]!}, 'live', 'x', null),
        (${paths[1]!}, 'past', 'x', now() - interval '1 hour'),
        (${paths[2]!}, 'future', 'x', now() + interval '1 hour')
      on conflict (path) do nothing`;

    // Anonymous readers are the ones the policy exists for: the table is
    // reachable through PostgREST with the public key, so a scheduled page's
    // text must not be readable there.
    for (const client of [anon(), member.client]) {
      const { data, error } = await client
        .from("docsPages")
        .select("path")
        .like("path", "t372/%");
      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.path).sort()).toEqual([
        "t372/live",
        "t372/past",
      ]);
    }

    // The service role bypasses RLS, which is how the indexer sees them all.
    const { data: all } = await admin()
      .from("docsPages")
      .select("path")
      .like("path", "t372/%");
    expect(all).toHaveLength(3);
  });
});

describe("platform.replace_docs_index", () => {
  // The function replaces the whole search index, so only the service role may
  // call it. Success is not exercised here: it would wipe the index of the
  // database this suite runs against.
  const pages = [{ path: "t443/x", title: "x", plainText: "x" }];

  it("refuses the public key and a signed-in member", async () => {
    for (const client of [anon(), member.client]) {
      const { error } = await client.rpc("replace_docs_index", { pages });
      expect(error).not.toBeNull();
    }
  });

  it("refuses an empty index even for the service role", async () => {
    const { error } = await admin().rpc("replace_docs_index", { pages: [] });
    expect(error?.message).toMatch(/no pages/);
  });
});

describe("canPreviewDocs", () => {
  it("resolves for the role that holds it and for nobody else", async () => {
    const a = admin();
    const before = await a.rpc("has_permission", {
      uid: member.userId,
      perm: "canPreviewDocs",
    });
    expect(before.data).toBe(false);

    const roleId = await grantRole(member, "Docs previewer", {
      canPreviewDocs: true,
    });
    try {
      const granted = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canPreviewDocs",
      });
      expect(granted.data).toBe(true);

      // Its own column: granting it grants nothing next to it.
      const neighbour = await a.rpc("has_permission", {
        uid: member.userId,
        perm: "canManageAttendance",
      });
      expect(neighbour.data).toBe(false);
    } finally {
      await deleteRole(roleId);
    }

    const other = await a.rpc("has_permission", {
      uid: moderator.userId,
      perm: "canPreviewDocs",
    });
    expect(other.data).toBe(false);
  });
});
