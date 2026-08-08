// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";

/**
 * `resolve_sandbox_credential`, and the privileges around it.
 *
 * Two halves, and the second is the one that earned this file.
 *
 * The first exercises the function's contract: which outcome each situation
 * produces, and — the part the proxy's security rests on — that a publishable
 * credential cannot obtain the secret key. That check lives in SQL rather than
 * in the Worker precisely so a routing bug in the Worker cannot reach past it.
 *
 * The second asserts the SHAPE OF THE GRANTS, because the narrow role's whole
 * value is what it cannot do, and that is invisible to typechecking and to
 * every other test. Measured while building this: Postgres grants EXECUTE to
 * PUBLIC on every new function, so `sandbox_proxy` — created with no privileges
 * whatsoever — could initially execute 18 of this schema's functions, all of
 * them SECURITY DEFINER, `claim_root` among them. SECURITY DEFINER is what made
 * it matter: those run as the owner, so an empty set of table grants stops
 * nothing.
 *
 * The migration closes that with a schema-wide revoke plus an `alter default
 * privileges`. This test is what stops it coming back, and it will fail the
 * moment somebody adds a function without thinking about who may call it.
 */

const IDS = {
  ownerUser: "d1111111-1111-1111-1111-111111111101",
  memberUser: "d1111111-1111-1111-1111-111111111102",
  // A third account exists only so the disabled credential can sit on envA
  // alongside the active one. The unique constraint is (environment, user,
  // scope) and is deliberately unconditional, so one member cannot hold two
  // secret credentials for one environment -- which is the point of it.
  formerUser: "d1111111-1111-1111-1111-111111111103",
  envA: "e1111111-1111-1111-1111-11111111110a",
  envB: "e1111111-1111-1111-1111-11111111110b",
  envGone: "e1111111-1111-1111-1111-11111111110c",
};

const HOST = {
  a: "sbxtest-a-sandbox.devdogsuga.org",
  b: "sbxtest-b-sandbox.devdogsuga.org",
  gone: "sbxtest-c-sandbox.devdogsuga.org",
};

interface Resolved extends Record<string, unknown> {
  outcome: string;
  credential_id: string | null;
  user_id: string | null;
  publishable_key: string | null;
  secret_key: string | null;
  scope: string | null;
  environment_name: string | null;
}

function resolve(hostname: string, tokenHash: string) {
  return db.execute<Resolved>(
    sql`select * from platform.resolve_sandbox_credential(${hostname}, ${tokenHash})`,
  );
}

async function cleanup() {
  await db.execute(sql`
    delete from platform."sandboxEnvironments"
    where id in (${IDS.envA}::uuid, ${IDS.envB}::uuid, ${IDS.envGone}::uuid)
  `);
  await db.execute(sql`
    delete from auth.users
    where id in (${IDS.ownerUser}::uuid, ${IDS.memberUser}::uuid,
                 ${IDS.formerUser}::uuid)
  `);
  await db.execute(sql`delete from vault.secrets where name like 'sbxtest-%'`);
}

beforeAll(async () => {
  await cleanup();

  for (const [id, email] of [
    [IDS.ownerUser, "sbxtest-owner@uga.edu"],
    [IDS.memberUser, "sbxtest-member@uga.edu"],
    [IDS.formerUser, "sbxtest-former@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }

  // Real Vault secrets, not placeholder uuids: the function decrypts through
  // vault.decrypted_secrets, so a fake id would make the secret-key assertion
  // pass by returning null for the wrong reason.
  const secrets = await db.execute<{ a: string; b: string }>(sql`
    select vault.create_secret('SECRET-A', 'sbxtest-secret-a') as a,
           vault.create_secret('SECRET-B', 'sbxtest-secret-b') as b
  `);
  const { a: secretA, b: secretB } = secrets[0]!;

  for (const [id, host, ref, key, secretId, status] of [
    [IDS.envA, HOST.a, "sbxrefa", "sb_publishable_A", secretA, "active"],
    [IDS.envB, HOST.b, "sbxrefb", "sb_publishable_B", secretB, "active"],
    [IDS.envGone, HOST.gone, "sbxrefc", "sb_publishable_C", secretA, "revoked"],
  ] as const) {
    await db.execute(sql`
      insert into platform."sandboxEnvironments"
        (id, name, kind, "ownerUserId", "projectRef", "apiUrl", "publishableKey",
         "secretKeySecretId", "jwtSecretId", "proxyHostname", status)
      values (${id}::uuid, ${`Env ${ref}`}, 'owned', ${IDS.ownerUser}::uuid,
              ${ref}, ${`https://${ref}.supabase.co`}, ${key},
              ${secretId}::uuid, ${secretId}::uuid, ${host},
              ${status}::platform."envStatus")
    `);
  }

  for (const [env, user, hash, scope, status] of [
    [IDS.envA, IDS.memberUser, "sbxtest-pub-a", "publishable", "active"],
    [IDS.envA, IDS.memberUser, "sbxtest-sec-a", "secret", "active"],
    [IDS.envB, IDS.memberUser, "sbxtest-pub-b", "publishable", "active"],
    // On envA, so resolving it at envA's hostname fails because it is
    // disabled -- not because it belongs somewhere else.
    [IDS.envA, IDS.formerUser, "sbxtest-sec-disabled", "secret", "disabled"],
  ] as const) {
    await db.execute(sql`
      insert into platform."sandboxCredentials"
        ("environmentId", "userId", "tokenHash", scope, status)
      values (${env}::uuid, ${user}::uuid, ${hash},
              ${scope}::platform."proxyScope",
              ${status}::platform."credentialStatus")
    `);
  }
});

afterAll(cleanup);

describe("resolve_sandbox_credential", () => {
  it("withholds the secret key from a publishable credential", async () => {
    const [row] = await resolve(HOST.a, "sbxtest-pub-a");
    expect(row?.outcome).toBe("ok");
    expect(row?.scope).toBe("publishable");
    expect(row?.publishable_key).toBe("sb_publishable_A");
    // The whole elevation model in one assertion.
    expect(row?.secret_key).toBeNull();
  });

  it("decrypts the secret key for a secret credential", async () => {
    const [row] = await resolve(HOST.a, "sbxtest-sec-a");
    expect(row?.outcome).toBe("ok");
    expect(row?.secret_key).toBe("SECRET-A");
  });

  it("refuses a token issued for a different environment", async () => {
    // Without the hostname argument this would resolve happily and the Worker
    // would have to remember to compare environment ids on every path.
    const [row] = await resolve(HOST.a, "sbxtest-pub-b");
    expect(row?.outcome).toBe("bad_credential");
    expect(row?.secret_key).toBeNull();
  });

  it("refuses a disabled credential", async () => {
    const [row] = await resolve(HOST.a, "sbxtest-sec-disabled");
    expect(row?.outcome).toBe("bad_credential");
  });

  it("distinguishes an unknown host from a retired one", async () => {
    const [unknown] = await resolve(
      "sbxtest-nope.devdogsuga.org",
      "sbxtest-pub-a",
    );
    expect(unknown?.outcome).toBe("unknown_host");

    // The proxy owes a retired hostname a 410 and a body naming the environment,
    // so an already-installed build fails legibly instead of looking like a
    // network fault.
    const [retired] = await resolve(HOST.gone, "sbxtest-pub-a");
    expect(retired?.outcome).toBe("retired_host");
    expect(retired?.environment_name).toBe("Env sbxrefc");
  });

  it("checks the host before the token", async () => {
    const [row] = await resolve(HOST.gone, "sbxtest-sec-a");
    expect(row?.outcome).toBe("retired_host");
    expect(row?.secret_key).toBeNull();
  });
});

describe("log_proxy_request", () => {
  it("writes the row and stamps lastUsedAt", async () => {
    const [cred] = await resolve(HOST.a, "sbxtest-sec-a");
    const id = cred!.credential_id!;

    await db.execute(sql`
      select platform.log_proxy_request(${id}::uuid, 'GET', '/rest/v1/notes', 200::smallint)
    `);

    const [row] = await db.execute<{ logged: number; stamped: boolean }>(sql`
      select (select count(*)::int from platform."proxyRequestLog"
               where "credentialId" = ${id}::uuid) as logged,
             (select "lastUsedAt" is not null from platform."sandboxCredentials"
               where id = ${id}::uuid) as stamped
    `);
    expect(row?.logged).toBe(1);
    expect(row?.stamped).toBe(true);
  });

  it("ignores an unknown credential rather than raising", async () => {
    // A log write must never be what fails a request that already succeeded.
    await expect(
      db.execute(sql`
        select platform.log_proxy_request(gen_random_uuid(), 'GET', '/x', 200::smallint)
      `),
    ).resolves.toBeDefined();
  });
});

describe("the sandbox_proxy role's privilege surface", () => {
  it("holds no table privileges anywhere", async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select table_schema || '.' || table_name as table_name
        from information_schema.table_privileges
       where grantee = 'sandbox_proxy'
    `);
    expect(rows).toEqual([]);
  });

  it("can execute exactly the two functions it is meant to", async () => {
    const rows = await db.execute<{ proname: string }>(sql`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform'
         and has_function_privilege('sandbox_proxy', p.oid, 'execute')
       order by p.proname
    `);
    expect(rows.map((r) => r.proname)).toEqual([
      "log_proxy_request",
      "resolve_sandbox_credential",
    ]);
  });

  it("keeps PUBLIC off the schema's function surface", async () => {
    // The regression guard. A new function created without an explicit grant
    // policy would show up here, and would be reachable by every custom role in
    // the cluster.
    //
    // `coalesce(proacl, acldefault(...))` and not a bare `proacl`, because a
    // NULL proacl means "the built-in default" -- which for a function is owner
    // plus EXECUTE to PUBLIC. `aclexplode(NULL)` returns no rows, so a function
    // that was never granted OR revoked is wide open and, read the naive way,
    // INVISIBLE TO THIS ASSERTION. That is not hypothetical: it is exactly the
    // state a schema-scoped `alter default privileges ... revoke ... from
    // public` produces, which is the no-op that 20260807000000 exists to fix.
    // The guard has to see the case it was written for.
    const rows = await db.execute<{ proname: string }>(sql`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform'
         and exists (select 1
                       from aclexplode(coalesce(p.proacl,
                                                acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    `);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("keeps PUBLIC off future functions too", async () => {
    // The assertion above is about the functions that exist. This one is about
    // the rule, and it is the one that would have caught the original bug: the
    // schema-wide revoke in 20260805000002 was real, so every check of the
    // then-current surface passed, while the statement meant to hold the line
    // did nothing and the next migration to add a function reopened everything.
    //
    // Create one and look, rather than inspecting pg_default_acl -- the stored
    // row is a delta merged over acldefault() at creation time, so the row
    // reads clean in both the working and the broken configuration. Only the
    // created object tells the truth.
    await db.execute(
      sql`create function "platform".__public_execute_probe() returns int language sql as $$ select 1 $$`,
    );
    try {
      const [row] = await db.execute<{ public_can_execute: boolean }>(sql`
        select has_function_privilege('public',
                 'platform.__public_execute_probe()', 'execute') as public_can_execute
      `);
      expect(row!.public_can_execute).toBe(false);
    } finally {
      await db.execute(
        sql`drop function if exists "platform".__public_execute_probe()`,
      );
    }
  });

  it("did not take the API roles down with it", async () => {
    // The revoke is only correct because anon/authenticated hold explicit
    // grants. If a future change removes those, this catches it rather than the
    // moderation UI breaking in production.
    const [row] = await db.execute<{ anon: number; authed: number }>(sql`
      select count(*) filter (where has_function_privilege('anon', p.oid, 'execute'))::int          as anon,
             count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))::int as authed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'platform'
    `);
    expect(row!.anon).toBeGreaterThan(0);
    expect(row!.authed).toBeGreaterThan(0);
  });

  it("cannot reach resolve_sandbox_credential as anon or authenticated", async () => {
    const [row] = await db.execute<{
      anon: boolean;
      authed: boolean;
      svc: boolean;
    }>(sql`
      select has_function_privilege('anon',
               'platform.resolve_sandbox_credential(text,text)', 'execute') as anon,
             has_function_privilege('authenticated',
               'platform.resolve_sandbox_credential(text,text)', 'execute') as authed,
             has_function_privilege('service_role',
               'platform.resolve_sandbox_credential(text,text)', 'execute') as svc
    `);
    expect(row).toEqual({ anon: false, authed: false, svc: false });
  });
});
