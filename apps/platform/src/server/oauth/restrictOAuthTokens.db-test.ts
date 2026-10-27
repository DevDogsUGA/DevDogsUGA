// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";

/**
 * `platform.restrict_oauth_tokens`, the custom access token hook, against a
 * real database.
 *
 * GoTrue calls it for every token it issues; these call it directly with the
 * event shape GoTrue sends (`user_id` plus the draft `claims`). A token for an
 * OAuth client is recognised by its `client_id` claim or, failing that, by the
 * `oauth_client_id` on its session row, and is re-roled to `oauth_identity`
 * whatever the client's status and whoever signed in, except that a test
 * account is refused on an app that is In production. Who may sign in to which
 * client is the consent page's decision (`decideConsent`); the hook is the
 * downgrade, plus the Q164 backstop. The last case proves the role it
 * hands out really cannot read data.
 */

const IDS = {
  owner: "f5000000-0000-4000-a000-000000000001",
  other: "f5000000-0000-4000-a000-000000000002",
  testAccount: "f5000000-0000-4000-a000-000000000003",
  otherTestAccount: "f5000000-0000-4000-a000-000000000004",
  devClient: "f5000000-0000-4000-b000-000000000001",
  productionClient: "f5000000-0000-4000-b000-000000000002",
  unregisteredClient: "f5000000-0000-4000-b000-000000000003",
  devSession: "f5000000-0000-4000-c000-000000000001",
  productionSession: "f5000000-0000-4000-c000-000000000002",
};

const USERS = [
  [IDS.owner, "oauth-hook-owner@uga.edu"],
  [IDS.other, "oauth-hook-other@uga.edu"],
  [IDS.testAccount, "oh00001@oauth-hook-owner.devdogsuga.test"],
  [IDS.otherTestAccount, "oh00002@oauth-hook-other.devdogsuga.test"],
] as const;

const CLIENTS = [IDS.devClient, IDS.productionClient, IDS.unregisteredClient];

async function cleanup() {
  await db.execute(sql`
    delete from platform."oauthRegistrations"
    where "clientId" in (${sql.join(
      CLIENTS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from auth.oauth_clients
    where id in (${sql.join(
      CLIENTS.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from auth.users
    where id in (${sql.join(
      USERS.map(([id]) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
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

  for (const id of CLIENTS) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method,
        created_at, updated_at
      )
      values (
        ${id}::uuid, '', 'manual', 'http://localhost:3000/cb',
        'authorization_code,refresh_token', 'restrict_oauth_tokens test',
        'public', 'none', now(), now()
      )
    `);
  }

  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId", "status")
    values (${IDS.devClient}::uuid, ${IDS.owner}::uuid, 'testing'),
           (${IDS.productionClient}::uuid, ${IDS.owner}::uuid, 'in_production')
  `);
  await db.execute(sql`
    insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId")
    values (${IDS.testAccount}::uuid, ${IDS.owner}::uuid),
           (${IDS.otherTestAccount}::uuid, ${IDS.other}::uuid)
  `);
  await db.execute(sql`
    insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id)
    values (${IDS.devSession}::uuid, ${IDS.other}::uuid, now(), now(), ${IDS.devClient}::uuid),
           (${IDS.productionSession}::uuid, ${IDS.other}::uuid, now(), now(), ${IDS.productionClient}::uuid)
  `);
});

afterAll(cleanup);

type HookResult = {
  claims?: Record<string, unknown>;
  error?: { http_code: number; message: string };
};

async function hook(
  userId: string,
  claims: Record<string, unknown>,
): Promise<HookResult> {
  const event = {
    user_id: userId,
    claims: { role: "authenticated", ...claims },
  };
  const rows = await db.execute<{ result: HookResult }>(sql`
    select platform.restrict_oauth_tokens(${JSON.stringify(event)}::jsonb) as result
  `);
  return rows[0]!.result;
}

describe("platform.restrict_oauth_tokens", () => {
  it("passes a first-party token through unchanged", async () => {
    const result = await hook(IDS.other, { sub: IDS.other });
    expect(result).toEqual({
      claims: { role: "authenticated", sub: IDS.other },
    });
  });

  describe("a Testing client's token", () => {
    it("is downgraded for the owner", async () => {
      const result = await hook(IDS.owner, { client_id: IDS.devClient });
      expect(result.error).toBeUndefined();
      expect(result.claims?.role).toBe("oauth_identity");
      expect(result.claims?.client_id).toBe(IDS.devClient);
    });

    it("is downgraded for the owner's test account", async () => {
      const result = await hook(IDS.testAccount, {
        client_id: IDS.devClient,
      });
      expect(result.error).toBeUndefined();
      expect(result.claims?.role).toBe("oauth_identity");
    });

    it("is downgraded, not refused, for anyone else (consent decides who may sign in)", async () => {
      for (const user of [IDS.other, IDS.otherTestAccount]) {
        const result = await hook(user, { client_id: IDS.devClient });
        expect(result.error).toBeUndefined();
        expect(result.claims?.role).toBe("oauth_identity");
      }
    });
  });

  describe("an In production client's token", () => {
    it("is downgraded for the owner", async () => {
      const result = await hook(IDS.owner, { client_id: IDS.productionClient });
      expect(result.error).toBeUndefined();
      expect(result.claims?.role).toBe("oauth_identity");
      expect(result.claims?.client_id).toBe(IDS.productionClient);
    });

    it("is downgraded for any member signing in as themselves", async () => {
      const result = await hook(IDS.other, { client_id: IDS.productionClient });
      expect(result.error).toBeUndefined();
      expect(result.claims?.role).toBe("oauth_identity");
      expect(result.claims?.client_id).toBe(IDS.productionClient);
    });

    it("is refused for every test account, the owner's included (Q164)", async () => {
      for (const user of [IDS.testAccount, IDS.otherTestAccount]) {
        const byClaim = await hook(user, { client_id: IDS.productionClient });
        expect(byClaim.claims).toBeUndefined();
        expect(byClaim.error?.http_code).toBe(403);
      }
    });

    it("is refused for a test account found only by its session row", async () => {
      const result = await hook(IDS.testAccount, {
        session_id: IDS.productionSession,
      });
      expect(result.error?.http_code).toBe(403);
    });
  });

  it("downgrades a client nobody registered", async () => {
    const result = await hook(IDS.owner, {
      client_id: IDS.unregisteredClient,
    });
    expect(result.error).toBeUndefined();
    expect(result.claims?.role).toBe("oauth_identity");
  });

  it("recognises an OAuth session by its session row when the claim is absent", async () => {
    for (const session_id of [IDS.devSession, IDS.productionSession]) {
      const result = await hook(IDS.other, { session_id });
      expect(result.error).toBeUndefined();
      expect(result.claims?.role).toBe("oauth_identity");
    }
  });

  it("leaves a session that belongs to no OAuth client alone", async () => {
    const result = await hook(IDS.other, {
      session_id: "f5000000-0000-4000-c000-0000000000ff",
    });
    expect(result.claims?.role).toBe("authenticated");
  });

  it("gives oauth_identity no access to any API schema", async () => {
    for (const schema of [
      "platform",
      "schedule_builder",
      "study_group_finder",
      "storage",
      "graphql_public",
    ]) {
      const rows = await db.execute<{ usage: boolean }>(sql`
        select has_schema_privilege('oauth_identity', ${schema}, 'usage') as usage
      `);
      expect({ schema, usage: rows[0]!.usage }).toEqual({
        schema,
        usage: false,
      });
    }
  });
});
