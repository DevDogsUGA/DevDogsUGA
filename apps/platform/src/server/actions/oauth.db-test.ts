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
import { findClient } from "~/server/moderation/store";
import { createOauthClientAndRegister } from "~/server/oauth/registerClient";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * `/tools/oauth`'s action and `createOauthClientAndRegister` against a real
 * database and a real local GoTrue: tiers, the permission check, the audit
 * entries a production client writes, replacement-before-delete, and the
 * orphan-client fix. Only the session is faked (the actions read it from
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
const DOGDAYS = "https://dogdays.supabase.co/auth/v1/callback";
const DOGPACK = "https://dogpack.supabase.co/auth/v1/callback";
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
    tier: string;
    label: string;
  }>(
    sql`select "userId", tier::text as tier, label
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

async function cleanup() {
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
  it("creates a development client for a member with GitHub, with no audit entry", async () => {
    signInAs(IDS.member);
    const result = await act({
      intent: "create-client",
      label: `${PREFIX}-dev`,
    });

    expect(result.clientId).toBeTruthy();
    expect(result.clientSecret).toBeTruthy();
    expect(await registration(result.clientId!)).toEqual({
      userId: IDS.member,
      tier: "development",
      label: `${PREFIX}-dev`,
    });
    expect(await auditRows(result.clientId!)).toHaveLength(0);
  });

  it("needs a linked GitHub account for a development client", async () => {
    signInAs(IDS.member, false);
    await expect(
      act({ intent: "create-client", label: `${PREFIX}-nogithub` }),
    ).rejects.toThrow(/GitHub/);
    expect(await liveClientCount(`${PREFIX}-nogithub`)).toBe(0);
  });

  it("refuses a production client to a member without canManageOAuthApps, and makes nothing", async () => {
    signInAs(IDS.member);
    await expect(
      act({
        intent: "create-client",
        tier: "production",
        label: `${PREFIX}-prod-denied`,
        callbackUri: DOGDAYS,
      }),
    ).rejects.toThrow(/canManageOAuthApps/);
    expect(await liveClientCount(`${PREFIX}-prod-denied`)).toBe(0);
  });

  it("refuses a production client whose return address is not a Supabase callback", async () => {
    signInAs(IDS.officer);
    for (const callbackUri of [
      "http://localhost:3000/auth",
      "https://example.com/auth/v1/callback",
      "http://dogdays.supabase.co/auth/v1/callback",
      "",
    ]) {
      await expect(
        act({
          intent: "create-client",
          tier: "production",
          label: `${PREFIX}-prod-badcb`,
          callbackUri,
        }),
      ).rejects.toThrow(/supabase\.co\/auth\/v1\/callback/);
    }
    expect(await liveClientCount(`${PREFIX}-prod-badcb`)).toBe(0);
  });

  it("creates a production client for a holder, and audits it without the secret", async () => {
    signInAs(IDS.officer, false); // no GitHub needed for production
    const result = await act({
      intent: "create-client",
      tier: "production",
      label: `${PREFIX}-dogdays`,
      callbackUri: DOGDAYS,
    });

    expect(await registration(result.clientId!)).toEqual({
      userId: IDS.officer,
      tier: "production",
      label: `${PREFIX}-dogdays`,
    });
    const audit = await auditRows(result.clientId!);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "oauth_client.created",
      actor: IDS.officer,
      metadata: {
        tier: "production",
        label: `${PREFIX}-dogdays`,
        redirectUris: DOGDAYS,
      },
    });
    expect(JSON.stringify(audit)).not.toContain(result.clientSecret!);
  });

  it("treats an unknown tier as development", async () => {
    signInAs(IDS.officer);
    const result = await act({
      intent: "create-client",
      tier: "root",
      label: `${PREFIX}-unknown-tier`,
    });
    expect((await registration(result.clientId!))?.tier).toBe("development");
  });
});

describe("managing a client", () => {
  let production: string;
  let development: string;

  beforeAll(async () => {
    signInAs(IDS.officer);
    production = (
      await act({
        intent: "create-client",
        tier: "production",
        label: `${PREFIX}-manage-prod`,
        callbackUri: DOGPACK,
      })
    ).clientId!;
    signInAs(IDS.member);
    development = (
      await act({ intent: "create-client", label: `${PREFIX}-manage-dev` })
    ).clientId!;
  });

  it("hides a production client from a member without the permission", async () => {
    signInAs(IDS.member);
    for (const intent of ["reset-secret", "revoke-client"]) {
      await expect(act({ intent, clientId: production })).rejects.toThrow(
        /not found/,
      );
    }
    await expect(
      act({ intent: "add-uri", clientId: production, uri: DOGDAYS }),
    ).rejects.toThrow(/not found/);
  });

  it("hides a development client from anyone but its owner, officers included", async () => {
    signInAs(IDS.officer);
    await expect(
      act({ intent: "reset-secret", clientId: development }),
    ).rejects.toThrow(/not found/);
  });

  it("lets a holder who did not create a production client roll its secret, with an audit entry", async () => {
    // Created by the officer above; a second holder would behave the same, so
    // sign in as the officer and check the entry names them as the actor.
    signInAs(IDS.officer);
    const result = await act({ intent: "reset-secret", clientId: production });
    expect(result.clientId).toBe(production);
    expect(result.clientSecret).toBeTruthy();

    const rotated = (await auditRows(production)).filter(
      (row) => row.action === "oauth_client.secret_rotated",
    );
    expect(rotated).toHaveLength(1);
    expect(JSON.stringify(rotated)).not.toContain(result.clientSecret!);
  });

  it("rolls a development client's secret for its owner without an audit entry", async () => {
    signInAs(IDS.member);
    const result = await act({ intent: "reset-secret", clientId: development });
    expect(result.clientSecret).toBeTruthy();
    expect(await auditRows(development)).toHaveLength(0);
  });

  it("accepts only a Supabase callback as a production redirect URI, and audits changes", async () => {
    signInAs(IDS.officer);
    await expect(
      act({
        intent: "add-uri",
        clientId: production,
        uri: "http://localhost:3000/auth",
      }),
    ).rejects.toThrow(/supabase\.co\/auth\/v1\/callback/);

    await act({ intent: "add-uri", clientId: production, uri: DOGDAYS });
    await act({ intent: "remove-uri", clientId: production, uri: DOGDAYS });

    const actions = (await auditRows(production)).map((row) => row.action);
    expect(actions).toContain("oauth_client.redirect_uri_added");
    expect(actions).toContain("oauth_client.redirect_uri_removed");
  });

  it("records nothing, and says so, when GoTrue refuses a production change", async () => {
    signInAs(IDS.officer);
    const before = (await auditRows(production)).length;
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
        act({ intent: "add-uri", clientId: production, uri: DOGDAYS }),
      ).rejects.toThrow(/boom/);
      await expect(
        act({
          intent: "remove-uri",
          clientId: production,
          uri: DOGPACK,
        }),
      ).rejects.toThrow(/(boom|at least one)/);
      await expect(
        act({ intent: "reset-secret", clientId: production }),
      ).rejects.toThrow(/boom/);
    } finally {
      update.mockRestore();
      rotate.mockRestore();
    }
    expect(await auditRows(production)).toHaveLength(before);
  });

  it("keeps at least one redirect URI on a production client", async () => {
    signInAs(IDS.officer);
    await expect(
      act({ intent: "remove-uri", clientId: production, uri: DOGPACK }),
    ).rejects.toThrow(/at least one redirect URI/);
  });

  it("allows a development client any http(s) URI, as before", async () => {
    signInAs(IDS.member);
    await act({
      intent: "add-uri",
      clientId: development,
      uri: "http://localhost:4000/cb",
    });
    expect(await auditRows(development)).toHaveLength(0);
  });
});

describe("deleting a production client", () => {
  let first: string;
  let second: string;
  let development: string;

  beforeAll(async () => {
    signInAs(IDS.officer);
    first = (
      await act({
        intent: "create-client",
        tier: "production",
        label: `${PREFIX}-del-first`,
        callbackUri: DOGDAYS,
      })
    ).clientId!;
    second = (
      await act({
        intent: "create-client",
        tier: "production",
        label: `${PREFIX}-del-second`,
        callbackUri: DOGPACK,
      })
    ).clientId!;
    signInAs(IDS.member);
    development = (
      await act({ intent: "create-client", label: `${PREFIX}-del-dev` })
    ).clientId!;
  });

  it("refuses without a replacement, with itself, with a development client, or with an unknown id", async () => {
    signInAs(IDS.officer);
    const attempts: Record<string, string>[] = [
      {},
      { replacementClientId: first },
      { replacementClientId: development },
      { replacementClientId: "f7000000-0000-4000-b000-0000000000ff" },
    ];
    for (const extra of attempts) {
      await expect(
        act({ intent: "revoke-client", clientId: first, ...extra }),
      ).rejects.toThrow(/replac/i);
    }
    expect(await registration(first)).not.toBeNull();
    expect(await liveClientCount(`${PREFIX}-del-first`)).toBe(1);
  });

  it("deletes once another live production client takes over, and records which", async () => {
    signInAs(IDS.officer);
    await act({
      intent: "revoke-client",
      clientId: first,
      replacementClientId: second,
    });

    expect(await registration(first)).toBeNull();
    expect(await liveClientCount(`${PREFIX}-del-first`)).toBe(0);

    const deleted = (await auditRows(first)).filter(
      (row) => row.action === "oauth_client.deleted",
    );
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({
      actor: IDS.officer,
      metadata: {
        tier: "production",
        label: `${PREFIX}-del-first`,
        replacementClientId: second,
        replacementLabel: `${PREFIX}-del-second`,
      },
    });
  });

  it("will not let the last production client go to a deleted one", async () => {
    signInAs(IDS.officer);
    // `first` is gone, so it cannot be the replacement for `second`.
    await expect(
      act({
        intent: "revoke-client",
        clientId: second,
        replacementClientId: first,
      }),
    ).rejects.toThrow(/live production client/);
    expect(await registration(second)).not.toBeNull();
  });

  it("deletes a development client without a replacement or an audit entry", async () => {
    signInAs(IDS.member);
    await act({ intent: "revoke-client", clientId: development });
    expect(await registration(development)).toBeNull();
    expect(await liveClientCount(`${PREFIX}-del-dev`)).toBe(0);
    expect(await auditRows(development)).toHaveLength(0);
  });
});

describe("deleting a production client that is a registered moderation app", () => {
  const ENDPOINT = "https://receiver.example.com/moderation";

  async function production(label: string, callbackUri: string) {
    signInAs(IDS.officer);
    return (
      await act({
        intent: "create-client",
        tier: "production",
        label: `${PREFIX}-${label}`,
        callbackUri,
      })
    ).clientId!;
  }

  async function register(slug: string, clientId: string) {
    await db.execute(sql`
      select platform.register_external_app(
        ${`${PREFIX}-${slug}`}, ${`Moderation ${slug}`}, ${clientId}::uuid,
        ${ENDPOINT},
        ${JSON.stringify([{ contentType: "session", label: "Session" }])}::jsonb)
    `);
  }

  async function moderationRow(clientId: string) {
    const rows = await db.execute<{ slug: string | null; endpoint: string }>(
      sql`select a.slug, m."endpointUrl" as endpoint
          from platform."moderationClients" m
          left join platform.apps a on a.id = m."appId"
          where m."clientId" = ${clientId}::uuid`,
    );
    return rows[0] ?? null;
  }

  it("hands the registration to the replacement, and the deleted client is unknown", async () => {
    const deleted = await production("mod-a", DOGDAYS);
    const replacement = await production("mod-b", DOGPACK);
    await register("app-a", deleted);
    expect(await findClient(deleted)).not.toBeNull();
    expect(await findClient(replacement)).toBeNull();

    signInAs(IDS.officer);
    await act({
      intent: "revoke-client",
      clientId: deleted,
      replacementClientId: replacement,
    });

    expect(await moderationRow(deleted)).toBeNull();
    expect(await moderationRow(replacement)).toEqual({
      slug: `${PREFIX}-app-a`,
      endpoint: ENDPOINT,
    });
    expect(await findClient(deleted)).toBeNull();
    expect(await findClient(replacement)).toMatchObject({
      clientId: replacement,
    });
    const entry = (await auditRows(deleted)).find(
      (row) => row.action === "oauth_client.deleted",
    );
    expect(entry?.metadata).toMatchObject({ moderation: "transferred" });
  });

  it("keeps a replacement's own registration and drops the deleted client's", async () => {
    const deleted = await production("mod-c", DOGDAYS);
    const replacement = await production("mod-d", DOGPACK);
    await register("app-c", deleted);
    await register("app-d", replacement);

    signInAs(IDS.officer);
    await act({
      intent: "revoke-client",
      clientId: deleted,
      replacementClientId: replacement,
    });

    expect(await moderationRow(deleted)).toBeNull();
    expect(await moderationRow(replacement)).toMatchObject({
      slug: `${PREFIX}-app-d`,
    });
    const entry = (await auditRows(deleted)).find(
      (row) => row.action === "oauth_client.deleted",
    );
    expect(entry?.metadata).toMatchObject({ moderation: "dropped" });
  });

  it("drops the registration of any soft-deleted client, whoever deleted it", async () => {
    const client = await production("mod-e", DOGDAYS);
    await register("app-e", client);
    expect(await moderationRow(client)).not.toBeNull();

    // What GoTrue's delete does: it sets deleted_at and removes nothing.
    await db.execute(
      sql`update auth.oauth_clients set deleted_at = now() where id = ${client}::uuid`,
    );

    expect(await moderationRow(client)).toBeNull();
    expect(await findClient(client)).toBeNull();
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

  it("deletes the Supabase client when a production client's audit entry fails", async () => {
    const label = `${PREFIX}-orphan-prod`;
    await expect(
      createOauthClientAndRegister({
        label,
        redirectUris: [DOGDAYS],
        userId: "f7000000-0000-4000-a000-0000000000fe",
        tier: "production",
      }),
    ).rejects.toThrow();

    expect(await liveClientCount(label)).toBe(0);
  });

  it("does not even create a production client for a bad return address", async () => {
    const before = await supabaseAdmin.auth.admin.oauth.listClients();
    await expect(
      createOauthClientAndRegister({
        label: `${PREFIX}-never`,
        redirectUris: ["http://localhost:3000/auth"],
        userId: IDS.officer,
        tier: "production",
      }),
    ).rejects.toThrow(/supabase\.co/);
    expect(await liveClientCount(`${PREFIX}-never`)).toBe(0);
    expect(before.error).toBeNull();
  });
});
