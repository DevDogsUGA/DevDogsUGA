// @vitest-environment node
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "~/env";
import { db } from "~/server/db";

/**
 * What deleting an `auth.users` row leaves behind (account-deletion Q3, Q42):
 * attendance and moderation records survive with the person nulled, an OAuth
 * registration goes with its registrant, and a deletion during a moderation
 * action leaves a block the sign-up hook honours.
 */

const IDS = {
  member: "f8000000-0000-4000-a000-000000000001",
  other: "f8000000-0000-4000-a000-000000000002",
  meeting: "f8000000-0000-4000-d000-000000000001",
  attendance: "f8000000-0000-4000-e000-000000000001",
  report: "f8000000-0000-4000-e000-000000000002",
  corroboration: "f8000000-0000-4000-e000-000000000003",
  resolution: "f8000000-0000-4000-e000-000000000004",
  client: "f8000000-0000-4000-b000-000000000001",
  delivery: "f8000000-0000-4000-c000-000000000001",
};
const USERS = [
  [IDS.member, "account-deletion-member@uga.edu"],
  [IDS.other, "account-deletion-other@uga.edu"],
] as const;
const KEY_NAME = "deleted_account_block_key";
const BLOCKED = "account-deletion-blocked@uga.edu";
const EXPIRED = "account-deletion-expired@uga.edu";

let createdKey = false;

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform."auditEvents" where "targetId" = ${IDS.report}`,
    );
  });
  await db.execute(
    sql`delete from platform."moderationDeliveries" where id = ${IDS.delivery}::uuid`,
  );
  await db.execute(
    sql`delete from platform.reports where id = ${IDS.report}::uuid`,
  );
  await db.execute(
    sql`delete from platform."oauthRegistrations" where "clientId" = ${IDS.client}::uuid`,
  );
  await db.execute(
    sql`delete from auth.oauth_clients where id = ${IDS.client}::uuid`,
  );
  await db.execute(
    sql`delete from platform.attendance where id = ${IDS.attendance}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform."deletedAccountBlocks"
        where "subjectHash" in (
          platform.deleted_account_hash(${BLOCKED}),
          platform.deleted_account_hash(${EXPIRED}))`,
  );
  for (const [id] of USERS) {
    await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
}

// As GoTrue calls it: its own login (supabase_auth_admin), so the hook's
// grants are exercised.
const goTrueUrl = new URL(env.DB_URL);
goTrueUrl.username = "supabase_auth_admin";
const goTrueClient = postgres(goTrueUrl.toString(), { max: 1 });

async function runHook(email: string) {
  const [row] = await goTrueClient<
    { result: { error?: { message: string } } }[]
  >`
    select platform.require_uga_signup_email(
      jsonb_build_object('user', jsonb_build_object('email', ${email}::text))
    ) as result`;
  return row!.result;
}

beforeAll(async () => {
  // The key is a Vault secret; a database that already has one keeps it.
  const [existing] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from vault.secrets where name = ${KEY_NAME}`,
  );
  if (existing!.n === 0) {
    await db.execute(
      sql`select vault.create_secret('account-deletion-test-key', ${KEY_NAME})`,
    );
    createdKey = true;
  }
  await cleanup();

  for (const [id, email] of USERS) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt", "countsForCredit")
    values (${IDS.meeting}::uuid, 'account-deletion-meeting',
            now() - interval '1 day', now() - interval '1 day' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "meetingId", "userId", method)
    values (${IDS.attendance}::uuid, ${IDS.meeting}::uuid, ${IDS.member}::uuid, 'manual_code')
  `);
  await db.execute(sql`
    insert into platform.reports (
      id, "appId", "reporterUserId", "reportedUserId", "contentType",
      "contentRef", "contentSnapshot", reason
    )
    select ${IDS.report}::uuid, a.id, ${IDS.member}::uuid, ${IDS.other}::uuid,
           'profile', 'account-deletion-ref', 'snapshot', 'spam'
    from platform.apps a where a.slug = 'platform'
  `);
  await db.execute(sql`
    insert into platform."reportCorroborations" (id, "reportId", "reporterUserId", reason)
    values (${IDS.corroboration}::uuid, ${IDS.report}::uuid, ${IDS.member}::uuid, 'spam')
  `);
  await db.execute(sql`
    insert into platform."reportResolutions" (
      id, "reportId", "moderatorUserId", "subjectAction", "filerAction", "contentAction"
    )
    values (${IDS.resolution}::uuid, ${IDS.report}::uuid, ${IDS.member}::uuid,
            'no_action', 'no_action', 'no_action')
  `);
  await db.execute(sql`
    insert into auth.oauth_clients (
      id, client_secret_hash, registration_type, redirect_uris, grant_types,
      client_name, client_type, token_endpoint_auth_method, created_at, updated_at
    )
    values (
      ${IDS.client}::uuid, '', 'manual', 'http://127.0.0.1:54321/auth/v1/callback',
      'authorization_code,refresh_token', 'account deletion test',
      'public', 'none', now(), now()
    )
  `);
  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId")
    values (${IDS.client}::uuid, ${IDS.member}::uuid)
  `);
});

afterAll(async () => {
  await goTrueClient.end();
  await cleanup();
  if (createdKey) {
    await db.execute(sql`delete from vault.secrets where name = ${KEY_NAME}`);
  }
});

describe("deleting a user", () => {
  beforeAll(async () => {
    await db.execute(
      sql`delete from auth.users where id = ${IDS.member}::uuid`,
    );
  });

  it("keeps their attendance with the member nulled", async () => {
    const rows = await db.execute<{ userId: string | null }>(
      sql`select "userId" from platform.attendance where id = ${IDS.attendance}::uuid`,
    );
    expect(rows).toEqual([{ userId: null }]);
  });

  it("keeps reports, corroborations and resolutions with the person nulled", async () => {
    const [report] = await db.execute<{
      reporterUserId: string | null;
      reportedUserId: string | null;
    }>(
      sql`select "reporterUserId", "reportedUserId" from platform.reports
          where id = ${IDS.report}::uuid`,
    );
    expect(report).toEqual({ reporterUserId: null, reportedUserId: IDS.other });

    const [corroboration] = await db.execute<{ reporterUserId: string | null }>(
      sql`select "reporterUserId" from platform."reportCorroborations"
          where id = ${IDS.corroboration}::uuid`,
    );
    expect(corroboration).toEqual({ reporterUserId: null });

    const [resolution] = await db.execute<{ moderatorUserId: string | null }>(
      sql`select "moderatorUserId" from platform."reportResolutions"
          where id = ${IDS.resolution}::uuid`,
    );
    expect(resolution).toEqual({ moderatorUserId: null });
  });

  it("deletes their OAuth registration", async () => {
    const rows = await db.execute(
      sql`select 1 from platform."oauthRegistrations" where "clientId" = ${IDS.client}::uuid`,
    );
    expect(rows).toHaveLength(0);
  });

  it("allows an ownerless (DevDogs) registration, a Testing DevDogs app included", async () => {
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (${IDS.client}::uuid, null)
    `);
    await db.execute(sql`delete from auth.users where id = ${IDS.other}::uuid`);
    const rows = await db.execute(
      sql`select 1 from platform."oauthRegistrations" where "clientId" = ${IDS.client}::uuid`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("before-user-created hook and deleted-account blocks", () => {
  it("refuses a sign-up whose subject has an unexpired block, ban or timed", async () => {
    await db.execute(sql`
      insert into platform."deletedAccountBlocks" ("subjectHash", "expiresAt")
      values (platform.deleted_account_hash(${BLOCKED}), null)
    `);
    expect((await runHook(BLOCKED)).error?.message).toContain("deleted");
    // Case and surrounding spaces do not make a different subject.
    expect((await runHook(` ${BLOCKED.toUpperCase()} `)).error).toBeDefined();

    await db.execute(sql`
      update platform."deletedAccountBlocks"
         set "expiresAt" = now() + interval '1 day'
       where "subjectHash" = platform.deleted_account_hash(${BLOCKED})
    `);
    expect((await runHook(BLOCKED)).error).toBeDefined();
  });

  it("accepts a sign-up once the block has expired", async () => {
    await db.execute(sql`
      insert into platform."deletedAccountBlocks" ("subjectHash", "expiresAt")
      values (platform.deleted_account_hash(${EXPIRED}), now() - interval '1 minute')
    `);
    expect(await runHook(EXPIRED)).toEqual({});
  });

  it("does not store the subject itself", async () => {
    const rows = await db.execute<{ hash: string }>(
      sql`select encode("subjectHash", 'hex') as hash
          from platform."deletedAccountBlocks"
          where "subjectHash" = platform.deleted_account_hash(${BLOCKED})`,
    );
    expect(rows[0]!.hash).toHaveLength(64);
    expect(rows[0]!.hash).not.toContain(BLOCKED);
  });

  it("is not readable or writable by clients", async () => {
    const rows = await db.execute<{ anon: boolean; authenticated: boolean }>(
      sql`select
            has_table_privilege('anon', 'platform."deletedAccountBlocks"', 'select') as anon,
            has_table_privilege('authenticated', 'platform."deletedAccountBlocks"', 'select') as authenticated`,
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false });
  });
});

describe("moderationDeliveries_type_check", () => {
  it("accepts user.delete and still refuses an unknown type", async () => {
    await db.execute(sql`
      insert into platform."moderationDeliveries" (id, "appId", type, payload)
      select ${IDS.delivery}::uuid, a.id, 'user.delete', '{}'::jsonb
      from platform.apps a where a.slug = 'platform'
    `);
    await expect(
      db.execute(sql`
        insert into platform."moderationDeliveries" ("appId", type, payload)
        select a.id, 'user.vanish', '{}'::jsonb
        from platform.apps a where a.slug = 'platform'
      `),
    ).rejects.toThrow();
  });
});
