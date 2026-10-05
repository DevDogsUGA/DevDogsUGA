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
 * OAuth client is recognised by its `client_id` claim or, failing that, by
 * the `oauth_client_id` on its session row, and is issued only to the
 * client's owner or one of the owner's test accounts, re-roled to
 * `oauth_identity`. The last case proves that role really cannot read data.
 */

const IDS = {
  owner: "f5000000-0000-4000-a000-000000000001",
  other: "f5000000-0000-4000-a000-000000000002",
  testAccount: "f5000000-0000-4000-a000-000000000003",
  otherTestAccount: "f5000000-0000-4000-a000-000000000004",
  client: "f5000000-0000-4000-b000-000000000001",
  unregisteredClient: "f5000000-0000-4000-b000-000000000002",
  session: "f5000000-0000-4000-c000-000000000001",
};

const USERS = [
  [IDS.owner, "oauth-hook-owner@uga.edu"],
  [IDS.other, "oauth-hook-other@uga.edu"],
  [IDS.testAccount, "oh00001@oauth-hook-owner.devdogsuga.test"],
  [IDS.otherTestAccount, "oh00002@oauth-hook-other.devdogsuga.test"],
] as const;

const CLIENTS = [IDS.client, IDS.unregisteredClient];

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
    insert into platform."oauthRegistrations" ("clientId", "userId")
    values (${IDS.client}::uuid, ${IDS.owner}::uuid)
  `);
  await db.execute(sql`
    insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId")
    values (${IDS.testAccount}::uuid, ${IDS.owner}::uuid),
           (${IDS.otherTestAccount}::uuid, ${IDS.other}::uuid)
  `);
  await db.execute(sql`
    insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id)
    values (${IDS.session}::uuid, ${IDS.other}::uuid, now(), now(), ${IDS.client}::uuid)
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

  it("issues the owner a token with no data access", async () => {
    const result = await hook(IDS.owner, { client_id: IDS.client });
    expect(result.error).toBeUndefined();
    expect(result.claims?.role).toBe("oauth_identity");
    expect(result.claims?.client_id).toBe(IDS.client);
  });

  it("issues the owner's test account a token with no data access", async () => {
    const result = await hook(IDS.testAccount, { client_id: IDS.client });
    expect(result.claims?.role).toBe("oauth_identity");
  });

  it("refuses any other member", async () => {
    const result = await hook(IDS.other, { client_id: IDS.client });
    expect(result.error?.http_code).toBe(403);
    expect(result.claims).toBeUndefined();
  });

  it("refuses another member's test account", async () => {
    const result = await hook(IDS.otherTestAccount, { client_id: IDS.client });
    expect(result.error?.http_code).toBe(403);
  });

  it("refuses a client nobody registered, even for its would-be owner", async () => {
    const result = await hook(IDS.owner, {
      client_id: IDS.unregisteredClient,
    });
    expect(result.error?.http_code).toBe(403);
  });

  it("recognises an OAuth session by its session row when the claim is absent", async () => {
    const result = await hook(IDS.other, { session_id: IDS.session });
    expect(result.error?.http_code).toBe(403);
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
