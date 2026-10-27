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
import { createOauthClientAndRegister } from "~/server/oauth/registerClient";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * `/tools/oauth`'s action and `createOauthClientAndRegister` against a real
 * database and a real local GoTrue: ownership, the three-app cap, the redirect
 * rule, the audit entries an In production or DevDogs app writes, deletion,
 * and the orphan-client fix. Only the session is faked (the actions read it from
 * cookies); everything else, including the permission lookup through the
 * `resolvedUserPermissions` materialized view, is the real thing.
 */

const session = vi.hoisted(() => ({
  user: null as { id: string; githubIdentity: { id: number } | null } | null,
}));

vi.mock("~/server/auth", () => ({
  expectUserWith: () =>
    session.user
      ? Promise.resolve(session.user)
      : Promise.reject(new Error("signed out")),
  authenticate: () => Promise.reject(new Error("sign-in required")),
}));

const { default: oauthAction } = await import("./oauth");

const IDS = {
  officer: "f7000000-0000-4000-a000-000000000001",
  member: "f7000000-0000-4000-a000-000000000002",
  role: "f7000000-0000-4000-d000-000000000001",
};
const USERS = [
  [IDS.officer, "oauth-action-officer@uga.edu"],
  [IDS.member, "oauth-action-member@uga.edu"],
] as const;

const PREFIX = "oauth-action-db-test";
const EMPTY = { clientId: null, clientSecret: null };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function act(fields: Record<string, string>) {
  return oauthAction(EMPTY, form(fields));
}

function signInAs(id: string, github = true) {
  session.user = { id, githubIdentity: github ? { id: 1 } : null };
}

async function registration(clientId: string) {
  const rows = await db.execute<{
    userId: string | null;
    status: string;
    asksForConsent: boolean;
    label: string;
  }>(
    sql`select "userId", status::text as status, "asksForConsent", label
        from platform."oauthRegistrations" where "clientId" = ${clientId}::uuid`,
  );
  return rows[0] ?? null;
}

async function auditRows(clientId: string) {
  return db.execute<{
    action: string;
    actor: string;
    metadata: Record<string, unknown>;
  }>(
    sql`select action, "actorUserId" as actor, metadata
        from platform."auditEvents"
        where "targetType" = 'oauth_client' and "targetId" = ${clientId}
        order by "createdAt", id`,
  );
}

async function liveClientCount(name: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from auth.oauth_clients
        where client_name = ${name} and deleted_at is null`,
  );
  return rows[0]!.n;
}

/** Puts an app into the state the holder-only actions would leave it in. */
async function setState(
  clientId: string,
  state: { status: string; owner?: string | null; asksForConsent?: boolean },
) {
  await db.execute(sql`
    update platform."oauthRegistrations"
       set status = ${state.status}::platform."oauthStatus",
           "userId" = ${state.owner === undefined ? sql`"userId"` : state.owner}::uuid,
           "asksForConsent" = ${state.asksForConsent ?? true}
     where "clientId" = ${clientId}::uuid
  `);
}

/** Forgets the apps a user owns, so a test starts under the three-app cap. */
async function clearOwned(...userIds: string[]) {
  for (const id of userIds) {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "userId" = ${id}::uuid`,
    );
  }
}

async function cleanup() {
  await db.execute(
    sql`delete from platform."oauthRegistrations"
        where "clientId" in (select id from auth.oauth_clients
                             where client_name like ${`${PREFIX}%`})`,
  );
  await db.execute(
    sql`delete from auth.oauth_clients where client_name like ${`${PREFIX}%`}`,
  );
  await db.execute(
    sql`delete from platform.apps where slug like ${`${PREFIX}%`}`,
  );
  await db.execute(
    sql`delete from platform."userRoles" where "roleId" = ${IDS.role}::uuid`,
  );
  await db.execute(
    sql`delete from platform.roles where id = ${IDS.role}::uuid`,
  );
  for (const [id] of USERS) {
    await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
}

beforeAll(async () => {
  await cleanup();
  for (const [id, email] of USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "canManageOAuthApps")
    values (${IDS.role}::uuid, 'OAuth action db-test role', 987655, true)
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${IDS.officer}::uuid, ${IDS.role}::uuid)
  `);
});

afterAll(cleanup);

beforeEach(() => {
  session.user = null;
});

describe("creating a client", () => {
  it("creates a Testing app that asks for consent, owned by the member, with no audit entry", async () => {
    signInAs(IDS.member);
    const result = await act({
      intent: "create-client",
      label: `${PREFIX}-dev`,
    });

    expect(result.clientId).toBeTruthy();
    expect(result.clientSecret).toBeTruthy();
    expect(await registration(result.clientId!)).toEqual({
      userId: IDS.member,
      status: "testing",
      asksForConsent: true,
      label: `${PREFIX}-dev`,
    });
    expect(await auditRows(result.clientId!)).toHaveLength(0);
  });

  it("needs a linked GitHub account", async () => {
    signInAs(IDS.member, false);
    await expect(
      act({ intent: "create-client", label: `${PREFIX}-nogithub` }),
    ).rejects.toThrow(/GitHub/);
    expect(await liveClientCount(`${PREFIX}-nogithub`)).toBe(0);
  });

  it("ignores a requested tier: a holder's app starts as a Testing app too", async () => {
    signInAs(IDS.officer);
    const result = await act({
      intent: "create-client",
      tier: "production",
      label: `${PREFIX}-officer-tier`,
    });
    expect((await registration(result.clientId!))?.status).toBe("testing");
  });

  it("refuses a return address the redirect rule refuses, and makes nothing", async () => {
    signInAs(IDS.member);
    for (const callbackUri of [
      "http://example.com/auth",
      "myapp://callback",
      "https://user:pw@example.com/cb",
    ]) {
      await expect(
        act({
          intent: "create-client",
          label: `${PREFIX}-badcb`,
          callbackUri,
        }),
      ).rejects.toThrow(/Redirect URIs must be/);
    }
    expect(await liveClientCount(`${PREFIX}-badcb`)).toBe(0);
  });

  it("accepts any https address and a local http one", async () => {
    signInAs(IDS.officer);
    const created = await act({
      intent: "create-client",
      label: `${PREFIX}-custom-host`,
      callbackUri: "https://api.example.com/auth/v1/callback",
    });
    expect(created.clientId).toBeTruthy();
  });
});

describe("the three-app cap", () => {
  const CAPPED = "f7000000-0000-4000-a000-000000000003";

  beforeAll(async () => {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${CAPPED}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', 'oauth-action-capped@uga.edu')
      on conflict do nothing
    `);
  });

  afterAll(async () => {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "userId" = ${CAPPED}::uuid`,
    );
    await db.execute(sql`delete from auth.users where id = ${CAPPED}::uuid`);
  });

  it("refuses a fourth app, whatever the status of the first three, and creates no client", async () => {
    signInAs(CAPPED);
    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const created = await act({
        intent: "create-client",
        label: `${PREFIX}-cap-${n}`,
      });
      ids.push(created.clientId!);
    }
    // One of them In production still counts.
    await setState(ids[0]!, { status: "in_production" });

    await expect(
      act({ intent: "create-client", label: `${PREFIX}-cap-4` }),
    ).rejects.toThrow(/at most 3/);
    expect(await liveClientCount(`${PREFIX}-cap-4`)).toBe(0);
  });

  it("frees a slot when an app is transferred to DevDogs", async () => {
    signInAs(CAPPED);
    const [first] = await db.execute<{ clientId: string }>(
      sql`select "clientId" from platform."oauthRegistrations"
          where "userId" = ${CAPPED}::uuid order by label limit 1`,
    );
    await setState(first!.clientId, {
      status: "in_production",
      owner: null,
      asksForConsent: false,
    });
    const created = await act({
      intent: "create-client",
      label: `${PREFIX}-cap-4`,
    });
    expect(created.clientId).toBeTruthy();
  });
});

describe("managing a client", () => {
  let owned: string;
  let published: string;
  let devdogs: string;

  beforeAll(async () => {
    await clearOwned(IDS.member, IDS.officer);
    signInAs(IDS.member);
    owned = (
      await act({ intent: "create-client", label: `${PREFIX}-manage-dev` })
    ).clientId!;
    published = (
      await act({ intent: "create-client", label: `${PREFIX}-manage-pub` })
    ).clientId!;
    await setState(published, { status: "in_production" });

    signInAs(IDS.officer);
    devdogs = (
      await act({ intent: "create-client", label: `${PREFIX}-manage-dd` })
    ).clientId!;
    await setState(devdogs, {
      status: "in_production",
      owner: null,
      asksForConsent: false,
    });
  });

  it("hides an app from anyone but its owner, holders included", async () => {
    signInAs(IDS.officer);
    for (const clientId of [owned, published]) {
      await expect(act({ intent: "reset-secret", clientId })).rejects.toThrow(
        /not found/,
      );
    }
  });

  it("hides a DevDogs app from a member without the permission", async () => {
    signInAs(IDS.member);
    for (const intent of ["reset-secret", "revoke-client"]) {
      await expect(act({ intent, clientId: devdogs })).rejects.toThrow(
        /not found/,
      );
    }
  });

  it("lets every holder roll a DevDogs app's secret, with an audit entry", async () => {
    signInAs(IDS.officer);
    const result = await act({ intent: "reset-secret", clientId: devdogs });
    expect(result.clientSecret).toBeTruthy();
    const rotated = (await auditRows(devdogs)).filter(
      (row) => row.action === "oauth_client.secret_rotated",
    );
    expect(rotated).toHaveLength(1);
    expect(JSON.stringify(rotated)).not.toContain(result.clientSecret!);
  });

  it("lets the owner of a published app keep its secret, audited", async () => {
    signInAs(IDS.member);
    await act({ intent: "reset-secret", clientId: published });
    expect((await auditRows(published)).map((row) => row.action)).toContain(
      "oauth_client.secret_rotated",
    );
  });

  it("rolls a Testing app's secret for its owner without an audit entry", async () => {
    signInAs(IDS.member);
    const result = await act({ intent: "reset-secret", clientId: owned });
    expect(result.clientSecret).toBeTruthy();
    expect(await auditRows(owned)).toHaveLength(0);
  });

  it("applies one redirect rule to every app, and audits an audited app's changes", async () => {
    signInAs(IDS.member);
    for (const uri of ["http://example.com/cb", "myapp://cb"]) {
      await expect(
        act({ intent: "add-uri", clientId: owned, uri }),
      ).rejects.toThrow(/Redirect URIs must be/);
    }
    await act({
      intent: "add-uri",
      clientId: owned,
      uri: "http://localhost:4000/cb",
    });
    expect(await auditRows(owned)).toHaveLength(0);

    await act({
      intent: "add-uri",
      clientId: published,
      uri: "https://app.example.com/cb",
    });
    await act({
      intent: "remove-uri",
      clientId: published,
      uri: "https://app.example.com/cb",
    });
    const actions = (await auditRows(published)).map((row) => row.action);
    expect(actions).toContain("oauth_client.redirect_uri_added");
    expect(actions).toContain("oauth_client.redirect_uri_removed");
  });

  it("records nothing, and says so, when GoTrue refuses an audited change", async () => {
    signInAs(IDS.officer);
    const before = (await auditRows(devdogs)).length;
    const failure = { data: null, error: { message: "boom", status: 500 } };
    const oauth = supabaseAdmin.auth.admin.oauth;
    const update = vi
      .spyOn(oauth, "updateClient")
      .mockResolvedValue(failure as never);
    const rotate = vi
      .spyOn(oauth, "regenerateClientSecret")
      .mockResolvedValue(failure as never);
    try {
      await expect(
        act({
          intent: "add-uri",
          clientId: devdogs,
          uri: "https://x.example.com/cb",
        }),
      ).rejects.toThrow(/boom/);
      await expect(
        act({ intent: "reset-secret", clientId: devdogs }),
      ).rejects.toThrow(/boom/);
    } finally {
      update.mockRestore();
      rotate.mockRestore();
    }
    expect(await auditRows(devdogs)).toHaveLength(before);
  });
});

describe("deleting an app", () => {
  beforeAll(() => clearOwned(IDS.member, IDS.officer));

  it("deletes any app for its owner with no replacement, audits an In production one", async () => {
    signInAs(IDS.member);
    const testing = (
      await act({ intent: "create-client", label: `${PREFIX}-del-testing` })
    ).clientId!;
    const published = (
      await act({ intent: "create-client", label: `${PREFIX}-del-pub` })
    ).clientId!;
    await setState(published, { status: "in_production" });

    await act({ intent: "revoke-client", clientId: testing });
    await act({ intent: "revoke-client", clientId: published });

    for (const [id, label] of [
      [testing, `${PREFIX}-del-testing`],
      [published, `${PREFIX}-del-pub`],
    ] as const) {
      expect(await registration(id)).toBeNull();
      expect(await liveClientCount(label)).toBe(0);
    }
    expect(await auditRows(testing)).toHaveLength(0);
    const entry = (await auditRows(published)).find(
      (row) => row.action === "oauth_client.deleted",
    );
    expect(entry).toMatchObject({
      actor: IDS.member,
      metadata: {
        label: `${PREFIX}-del-pub`,
        consents: 0,
        sessions: 0,
        authorizations: 0,
      },
    });
  });

  it("lets a holder delete a DevDogs app, the last one included", async () => {
    signInAs(IDS.officer);
    const id = (
      await act({ intent: "create-client", label: `${PREFIX}-del-dd` })
    ).clientId!;
    await setState(id, {
      status: "in_production",
      owner: null,
      asksForConsent: false,
    });
    await act({ intent: "revoke-client", clientId: id });
    expect(await registration(id)).toBeNull();
    expect(await liveClientCount(`${PREFIX}-del-dd`)).toBe(0);
  });
});

describe("a registration that fails leaves no orphan client", () => {
  it("deletes the Supabase client when the registration insert fails", async () => {
    const label = `${PREFIX}-orphan`;
    // No such user: the foreign key on oauthRegistrations."userId" rejects the
    // row after the Supabase client already exists.
    await expect(
      createOauthClientAndRegister({
        label,
        redirectUris: ["http://localhost:3000/auth"],
        userId: "f7000000-0000-4000-a000-0000000000ff",
      }),
    ).rejects.toThrow();

    expect(await liveClientCount(label)).toBe(0);
  });

  it("does not even create a client for a bad return address", async () => {
    await expect(
      createOauthClientAndRegister({
        label: `${PREFIX}-never`,
        redirectUris: ["http://example.com/auth"],
        userId: IDS.officer,
      }),
    ).rejects.toThrow(/Redirect URIs must be/);
    expect(await liveClientCount(`${PREFIX}-never`)).toBe(0);
  });
});
