// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { revokeAppAccess } from "./appStatus";

/**
 * The kill switch, `platform.oauth_revoke_app_access` (oauth-consent Q156): its
 * three scopes and their counts, the refresh tokens that go with the sessions,
 * and a pin on the Supabase Auth columns it touches, so that if a Supabase
 * upgrade renames one the test fails rather than the switch quietly doing
 * nothing.
 */

const id = (kind: string, n: number) =>
  `f9000000-0000-4000-${kind}000-0000000000${String(n).padStart(2, "0")}`;
const OWNER = id("a", 1);
const OWNER_TEST = id("a", 2); // the owner's test account
const OTHER_TEST = id("a", 3); // somebody else's test account
const SOMEONE = id("a", 4);
const ELSE = id("a", 5);
const OTHER_OWNER = id("a", 6);
const USERS = [OWNER, OWNER_TEST, OTHER_TEST, SOMEONE, ELSE, OTHER_OWNER];

const APP = id("b", 1);
const DEVDOGS_APP = id("b", 2);
const OTHER_APP = id("b", 3);
const CLIENTS = [APP, DEVDOGS_APP, OTHER_APP];

async function cleanup() {
  await db.execute(
    sql`delete from auth.oauth_authorizations where authorization_id like 'killswitch-%'`,
  );
  for (const c of CLIENTS) {
    await db.execute(
      sql`delete from auth.sessions where oauth_client_id = ${c}::uuid`,
    );
    await db.execute(
      sql`delete from auth.oauth_consents where client_id = ${c}::uuid`,
    );
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${c}::uuid`,
    );
    await db.execute(sql`delete from auth.oauth_clients where id = ${c}::uuid`);
  }
  for (const u of USERS) {
    await db.execute(sql`delete from auth.users where id = ${u}::uuid`);
  }
}

/** Gives `user` a consent, a session with a refresh token, and a pending authorization. */
async function seed(client: string, user: string, n: number) {
  const session = id(
    "c",
    n + (client === APP ? 0 : client === DEVDOGS_APP ? 20 : 40),
  );
  await db.execute(sql`
    insert into auth.oauth_consents (id, user_id, client_id, scopes)
    values (gen_random_uuid(), ${user}::uuid, ${client}::uuid, 'openid email')
  `);
  await db.execute(sql`
    insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id)
    values (${session}::uuid, ${user}::uuid, now(), now(), ${client}::uuid)
  `);
  await db.execute(sql`
    insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
    values (${`killswitch-${session}`}, ${user}, ${session}::uuid, false, now(), now())
  `);
  await db.execute(sql`
    insert into auth.oauth_authorizations
      (id, authorization_id, client_id, user_id, redirect_uri, scope, status)
    values (gen_random_uuid(), ${`killswitch-${client}-${user}`}, ${client}::uuid, ${user}::uuid,
            'http://localhost:3000/cb', 'openid email', 'pending')
  `);
}

async function state(client: string) {
  const [row] = await db.execute<{
    live_consents: string[] | null;
    sessions: string[] | null;
    tokens: number;
    pending: string[] | null;
  }>(sql`
    select
      (select array_agg(user_id::text order by user_id) from auth.oauth_consents
        where client_id = ${client}::uuid and revoked_at is null) as live_consents,
      (select array_agg(user_id::text order by user_id) from auth.sessions
        where oauth_client_id = ${client}::uuid) as sessions,
      (select count(*)::int from auth.refresh_tokens rt
        join auth.sessions s on s.id = rt.session_id
        where s.oauth_client_id = ${client}::uuid) as tokens,
      (select array_agg(user_id::text order by user_id) from auth.oauth_authorizations
        where client_id = ${client}::uuid and status = 'pending') as pending
  `);
  return {
    consents: row!.live_consents ?? [],
    sessions: row!.sessions ?? [],
    tokens: row!.tokens,
    pending: row!.pending ?? [],
  };
}

const sorted = (...users: string[]) => [...users].sort();

beforeAll(async () => {
  await cleanup();
  for (const [i, u] of USERS.entries()) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${u}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`killswitch-${i}@uga.edu`})
    `);
  }
  for (const c of CLIENTS) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method, created_at, updated_at
      ) values (${c}::uuid, '', 'manual', 'http://localhost:3000/cb',
        'authorization_code,refresh_token', 'kill switch test', 'public', 'none', now(), now())
    `);
  }
  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId", status, "asksForConsent")
    values (${APP}::uuid, ${OWNER}::uuid, 'in_production', true),
           (${OTHER_APP}::uuid, ${OTHER_OWNER}::uuid, 'in_production', true)
  `);
  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId", status, "asksForConsent")
    values (${DEVDOGS_APP}::uuid, null, 'in_production', false)
  `);
  await db.execute(sql`
    insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId")
    values (${OWNER_TEST}::uuid, ${OWNER}::uuid),
           (${OTHER_TEST}::uuid, ${OTHER_OWNER}::uuid)
  `);
});

afterAll(async () => {
  await db.execute(
    sql`delete from platform."oauthTestAccounts" where "testUserId" in (${OWNER_TEST}::uuid, ${OTHER_TEST}::uuid)`,
  );
  await cleanup();
});

describe("the auth columns the kill switch touches", () => {
  it("exist with the types it relies on", async () => {
    const wanted: [string, string, string][] = [
      ["oauth_consents", "client_id", "uuid"],
      ["oauth_consents", "user_id", "uuid"],
      ["oauth_consents", "revoked_at", "timestamp with time zone"],
      ["oauth_consents", "granted_at", "timestamp with time zone"],
      ["sessions", "oauth_client_id", "uuid"],
      ["sessions", "user_id", "uuid"],
      ["oauth_authorizations", "client_id", "uuid"],
      ["oauth_authorizations", "user_id", "uuid"],
      ["oauth_authorizations", "status", "USER-DEFINED"],
      ["refresh_tokens", "session_id", "uuid"],
    ];
    const rows = await db.execute<{ t: string; c: string; type: string }>(sql`
      select table_name as t, column_name as c, data_type as type
      from information_schema.columns where table_schema = 'auth'
    `);
    const found = new Set(rows.map((r) => `${r.t}.${r.c}:${r.type}`));
    for (const [t, c, type] of wanted) {
      expect(found.has(`${t}.${c}:${type}`), `auth.${t}.${c} (${type})`).toBe(
        true,
      );
    }
  });

  it("still cascades a deleted session to its refresh tokens", async () => {
    const [row] = await db.execute<{ rule: string }>(sql`
      select rc.delete_rule as rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage k on k.constraint_name = rc.constraint_name
       and k.constraint_schema = rc.constraint_schema
      where k.table_schema = 'auth' and k.table_name = 'refresh_tokens' and k.column_name = 'session_id'
    `);
    expect(row?.rule).toBe("CASCADE");
  });

  it("still has the pending authorization status the switch deletes", async () => {
    const rows = await db.execute<{ v: string }>(sql`
      select e.enumlabel as v from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'auth' and t.typname = 'oauth_authorization_status'
    `);
    expect(rows.map((r) => r.v)).toContain("pending");
  });
});

describe("platform.oauth_revoke_app_access", () => {
  async function seedApp(client: string) {
    await seed(client, OWNER, 1);
    await seed(client, OWNER_TEST, 2);
    await seed(client, OTHER_TEST, 3);
    await seed(client, SOMEONE, 4);
    await seed(client, ELSE, 5);
  }

  it("everyone_but_owner leaves the owner and the owner's test accounts, and counts what it ended", async () => {
    await seedApp(APP);
    const counts = await db.transaction((tx) =>
      revokeAppAccess(tx, APP, "everyone_but_owner"),
    );
    expect(counts).toEqual({ consents: 3, sessions: 3, authorizations: 3 });
    expect(await state(APP)).toEqual({
      consents: sorted(OWNER, OWNER_TEST),
      sessions: sorted(OWNER, OWNER_TEST),
      tokens: 2, // the three removed sessions took their refresh tokens with them
      pending: sorted(OWNER, OWNER_TEST),
    });
    // A second run has nothing left to end.
    expect(await revokeAppAccess(db, APP, "everyone_but_owner")).toEqual({
      consents: 0,
      sessions: 0,
      authorizations: 0,
    });
  });

  it("everyone_but_owner on an ownerless app reaches everybody", async () => {
    await seedApp(DEVDOGS_APP);
    const counts = await revokeAppAccess(db, DEVDOGS_APP, "everyone_but_owner");
    expect(counts).toEqual({ consents: 5, sessions: 5, authorizations: 5 });
    expect(await state(DEVDOGS_APP)).toEqual({
      consents: [],
      sessions: [],
      tokens: 0,
      pending: [],
    });
  });

  it("test_identities reaches every test account, the owner's included, and no member", async () => {
    await cleanup2(APP);
    await seedApp(APP);
    const counts = await revokeAppAccess(db, APP, "test_identities");
    expect(counts).toEqual({ consents: 2, sessions: 2, authorizations: 2 });
    expect(await state(APP)).toEqual({
      consents: sorted(OWNER, SOMEONE, ELSE),
      sessions: sorted(OWNER, SOMEONE, ELSE),
      tokens: 3,
      pending: sorted(OWNER, SOMEONE, ELSE),
    });
  });

  it("user reaches one member only, and leaves other apps alone", async () => {
    await cleanup2(APP);
    await seedApp(APP);
    await seedApp(OTHER_APP);
    const counts = await revokeAppAccess(db, APP, "user", SOMEONE);
    expect(counts).toEqual({ consents: 1, sessions: 1, authorizations: 1 });
    expect((await state(APP)).sessions).toEqual(
      sorted(OWNER, OWNER_TEST, OTHER_TEST, ELSE),
    );
    expect((await state(OTHER_APP)).sessions).toHaveLength(5);
    expect((await state(OTHER_APP)).consents).toHaveLength(5);
  });

  it("sets revoked_at rather than deleting the consent row", async () => {
    const [row] = await db.execute<{ revoked: boolean }>(sql`
      select revoked_at is not null as revoked from auth.oauth_consents
       where client_id = ${APP}::uuid and user_id = ${SOMEONE}::uuid
    `);
    expect(row?.revoked).toBe(true);
  });

  it("deletes a pending authorization that has no user yet, except for scope user", async () => {
    await db.execute(sql`
      insert into auth.oauth_authorizations
        (id, authorization_id, client_id, user_id, redirect_uri, scope, status)
      values (gen_random_uuid(), 'killswitch-nouser', ${APP}::uuid, null,
              'http://localhost:3000/cb', 'openid', 'pending')
    `);
    expect(await revokeAppAccess(db, APP, "user", ELSE)).toMatchObject({
      authorizations: 1,
    });
    const [still] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from auth.oauth_authorizations where authorization_id = 'killswitch-nouser'`);
    expect(still?.n).toBe(1);
    expect(await revokeAppAccess(db, APP, "everyone_but_owner")).toMatchObject({
      authorizations: 1 + 1,
    });
  });

  it("rejects an unknown scope, a user scope without a user, and an unregistered app", async () => {
    const message = async (run: () => Promise<unknown>) => {
      const error = (await run().then(
        () => null,
        (e: unknown) => e,
      )) as {
        message: string;
        cause?: { message: string };
      } | null;
      return error?.cause?.message ?? error?.message ?? "";
    };
    expect(
      await message(() =>
        db.execute(
          sql`select platform.oauth_revoke_app_access(${APP}::uuid, 'everybody', null)`,
        ),
      ),
    ).toMatch(/unknown scope/);
    expect(await message(() => revokeAppAccess(db, APP, "user"))).toMatch(
      /needs a user/,
    );
    expect(
      await message(() =>
        revokeAppAccess(db, id("b", 99), "everyone_but_owner"),
      ),
    ).toMatch(/no such OAuth app/);
  });

  it("is atomic: a failure after its first step rolls the first step back", async () => {
    await cleanup2(APP);
    await seedApp(APP);
    await db
      .transaction(async (tx) => {
        await revokeAppAccess(tx, APP, "everyone_but_owner");
        throw new Error("abort");
      })
      .catch(() => undefined);
    expect((await state(APP)).sessions).toHaveLength(5);
    expect((await state(APP)).consents).toHaveLength(5);
  });

  /** Clears one app's auth rows so a case can seed it afresh. */
  async function cleanup2(client: string) {
    await db.execute(
      sql`delete from auth.oauth_authorizations where client_id = ${client}::uuid`,
    );
    await db.execute(
      sql`delete from auth.sessions where oauth_client_id = ${client}::uuid`,
    );
    await db.execute(
      sql`delete from auth.oauth_consents where client_id = ${client}::uuid`,
    );
  }
});
