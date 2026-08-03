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
