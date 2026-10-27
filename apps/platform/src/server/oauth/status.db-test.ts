// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { auditEvents } from "~/server/db/schema";
import { oauthAuditEvent } from "./audit";
import { findConsentTarget } from "./consentTarget";

/**
 * The status and consent columns with their checks, the three-app cap, the
 * `canManageOAuthApps` permission, the audit entry shape and the consent
 * lookup, against a real database.
 */

const IDS = {
  owner: "f6000000-0000-4000-a000-000000000001",
  holder: "f6000000-0000-4000-a000-000000000002",
  bystander: "f6000000-0000-4000-a000-000000000003",
  devClient: "f6000000-0000-4000-b000-000000000001",
  productionClient: "f6000000-0000-4000-b000-000000000002",
  role: "f6000000-0000-4000-d000-000000000001",
  devAuthorization: "f6000000-0000-4000-e000-000000000001",
  productionAuthorization: "f6000000-0000-4000-e000-000000000002",
};

const USERS = [
  [IDS.owner, "tiers-owner@uga.edu"],
  [IDS.holder, "tiers-holder@uga.edu"],
  [IDS.bystander, "tiers-bystander@uga.edu"],
] as const;

const CLIENTS = [IDS.devClient, IDS.productionClient];
const callback = "https://dogdays.supabase.co/auth/v1/callback";

const PRESIDENT = "00000000-0000-0000-0000-000000000002";
const DEVOPS_DIRECTOR = "00000000-0000-4000-8000-000000000003";
const VICE_PRESIDENT = "00000000-0000-4000-8000-000000000002";

/** Drizzle wraps the driver error; the SQL message is on `cause`. */
async function rejectsWith(query: ReturnType<typeof sql>, pattern: RegExp) {
  const error = (await db.execute(query).then(
    () => null,
    (e: unknown) => e,
  )) as { message: string; cause?: { message: string } } | null;
  expect(error, "the statement should have been rejected").not.toBeNull();
  expect(error?.cause?.message ?? error?.message).toMatch(pattern);
}

async function cleanup() {
  await db.execute(
    sql`delete from auth.oauth_authorizations where authorization_id like 'tiers-db-test-%'`,
  );
  await db.execute(
    sql`delete from platform."userRoles" where "roleId" = ${IDS.role}::uuid`,
  );
  await db.execute(
    sql`delete from platform.roles where id = ${IDS.role}::uuid`,
  );
  for (const id of CLIENTS) {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${id}::uuid`,
    );
    await db.execute(
      sql`delete from auth.oauth_clients where id = ${id}::uuid`,
    );
  }
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
  for (const id of CLIENTS) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method,
        created_at, updated_at
      )
      values (
        ${id}::uuid, '', 'manual', ${callback},
        'authorization_code,refresh_token', 'tiers test',
        'public', 'none', now(), now()
      )
    `);
  }
});

afterAll(cleanup);

describe("oauthRegistrations.status and asksForConsent", () => {
  const insert = (client: string, owner: string | null) => sql`
    insert into platform."oauthRegistrations" ("clientId", "userId")
    values (${client}::uuid, ${owner}::uuid)
  `;

  it("a new app is Testing and asks for consent", async () => {
    await db.execute(insert(IDS.devClient, IDS.owner));
    const [row] = await db.execute<{ status: string; asks: boolean }>(sql`
      select status::text as status, "asksForConsent" as asks
      from platform."oauthRegistrations" where "clientId" = ${IDS.devClient}::uuid
    `);
    expect(row).toEqual({ status: "testing", asks: true });
  });

  it("only an ownerless In production app may stop asking for consent (Q162)", async () => {
    // owned + In production
    await rejectsWith(
      sql`update platform."oauthRegistrations"
             set status = 'in_production', "asksForConsent" = false
           where "clientId" = ${IDS.devClient}::uuid`,
      /consent_skip_check/,
    );
    // ownerless but Testing
    await rejectsWith(
      sql`update platform."oauthRegistrations"
             set "userId" = null, "asksForConsent" = false
           where "clientId" = ${IDS.devClient}::uuid`,
      /consent_skip_check/,
    );
    // ownerless and In production: allowed
    await db.execute(sql`
      update platform."oauthRegistrations"
         set "userId" = null, status = 'in_production', "asksForConsent" = false
       where "clientId" = ${IDS.devClient}::uuid
    `);
    // Back to Testing while still skipping: refused, so the action resets it.
    await rejectsWith(
      sql`update platform."oauthRegistrations" set status = 'testing'
           where "clientId" = ${IDS.devClient}::uuid`,
      /consent_skip_check/,
    );
    // Giving it an owner again while it skips: refused.
    await rejectsWith(
      sql`update platform."oauthRegistrations" set "userId" = ${IDS.owner}::uuid
           where "clientId" = ${IDS.devClient}::uuid`,
      /consent_skip_check/,
    );
  });

  it("no longer locks the retired tier column", async () => {
    await db.execute(sql`
      update platform."oauthRegistrations" set tier = 'production'
       where "clientId" = ${IDS.devClient}::uuid
    `);
    await db.execute(sql`
      update platform."oauthRegistrations" set tier = 'development'
       where "clientId" = ${IDS.devClient}::uuid
    `);
  });

  it("checks the homepage and privacy policy are https addresses", async () => {
    for (const column of ["homepageUrl", "privacyPolicyUrl"]) {
      for (const bad of [
        "http://example.com",
        "javascript:alert(1)",
        "https://",
        "https://user@example.com",
        "https://exa mple.com",
      ]) {
        await rejectsWith(
          sql`update platform."oauthRegistrations"
                 set ${sql.identifier(column)} = ${bad}
               where "clientId" = ${IDS.devClient}::uuid`,
          /https/,
        );
      }
      await db.execute(sql`
        update platform."oauthRegistrations"
           set ${sql.identifier(column)} = 'https://dogdays.dev/legal?x=1'
         where "clientId" = ${IDS.devClient}::uuid
      `);
    }
  });
});

describe("the three-app cap (Q163)", () => {
  const extra = [1, 2, 3, 4].map(
    (n) => `f6000000-0000-4000-b000-00000000010${n}`,
  );

  async function register(client: string, owner: string | null) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method, created_at, updated_at
      ) values (${client}::uuid, '', 'manual', ${callback},
        'authorization_code,refresh_token', 'tiers cap test', 'public', 'none', now(), now())
      on conflict do nothing
    `);
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (${client}::uuid, ${owner}::uuid)
    `);
  }

  afterAll(async () => {
    for (const id of extra) {
      await db.execute(
        sql`delete from platform."oauthRegistrations" where "clientId" = ${id}::uuid`,
      );
      await db.execute(
        sql`delete from auth.oauth_clients where id = ${id}::uuid`,
      );
    }
  });

  it("refuses a fourth app for one owner, in the insert", async () => {
    // IDS.devClient is already the bystander-free owner's first... use a clean owner.
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "userId" = ${IDS.bystander}::uuid`,
    );
    await register(extra[0]!, IDS.bystander);
    await register(extra[1]!, IDS.bystander);
    await register(extra[2]!, IDS.bystander);
    await rejectsWith(
      sql`insert into platform."oauthRegistrations" ("clientId", "userId")
          values (${IDS.productionClient}::uuid, ${IDS.bystander}::uuid)`,
      /at most 3/,
    );
  });

  it("counts In production apps too, and does not count DevDogs apps", async () => {
    await db.execute(sql`
      update platform."oauthRegistrations" set status = 'in_production'
       where "clientId" = ${extra[0]!}::uuid
    `);
    await rejectsWith(
      sql`insert into platform."oauthRegistrations" ("clientId", "userId")
          values (${IDS.productionClient}::uuid, ${IDS.bystander}::uuid)`,
      /at most 3/,
    );
    // An ownerless app is not owned by anybody, however many exist.
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (${IDS.productionClient}::uuid, null)
    `);
  });

  it("refuses handing a fourth app to an owner at the cap, and frees a slot on transfer", async () => {
    await rejectsWith(
      sql`update platform."oauthRegistrations" set "userId" = ${IDS.bystander}::uuid
           where "clientId" = ${IDS.productionClient}::uuid`,
      /at most 3/,
    );
    await db.execute(sql`
      update platform."oauthRegistrations" set "userId" = null
       where "clientId" = ${extra[0]!}::uuid
    `);
    await register(extra[3]!, IDS.bystander);
  });

  it("lets an update that leaves the owner alone through at the cap", async () => {
    await db.execute(sql`
      update platform."oauthRegistrations" set label = 'Renamed'
       where "clientId" = ${extra[3]!}::uuid
    `);
  });
});

describe("canManageOAuthApps", () => {
  it("is granted to President and DevOps Director, and to no other seeded role", async () => {
    const rows = await db.execute<{ id: string; granted: boolean | null }>(sql`
      select id, "canManageOAuthApps" as granted from platform.roles
      where "roleType" = 'custom' and "isLeadership"
    `);
    const granted = new Set(rows.filter((r) => r.granted).map((r) => r.id));
    expect(granted).toEqual(new Set([PRESIDENT, DEVOPS_DIRECTOR]));
    expect(rows.some((r) => r.id === VICE_PRESIDENT)).toBe(true);
  });

  it("resolves through the materialized view for a member holding such a role", async () => {
    await db.execute(sql`
      insert into platform.roles (id, title, rank, "canManageOAuthApps")
      values (${IDS.role}::uuid, 'Tiers db-test role', 987654, true)
    `);
    await db.execute(sql`
      insert into platform."userRoles" ("userId", "roleId")
      values (${IDS.holder}::uuid, ${IDS.role}::uuid)
    `);

    const rows = await db.execute<{ uid: string; allowed: boolean }>(sql`
      select u.id as uid,
             platform.has_permission(u.id, 'canManageOAuthApps') as allowed
      from auth.users u
      where u.id in (${IDS.holder}::uuid, ${IDS.bystander}::uuid)
    `);
    expect(Object.fromEntries(rows.map((r) => [r.uid, r.allowed]))).toEqual({
      [IDS.holder]: true,
      [IDS.bystander]: false,
    });
  });
});

describe("audit entries", () => {
  it("fit platform.auditEvents and carry the client and no secret", async () => {
    const event = oauthAuditEvent({
      actorUserId: IDS.owner,
      action: "oauth_client.created",
      clientId: IDS.productionClient,
      metadata: { label: "DogDays", redirectUris: callback },
    });
    const [row] = await db.insert(auditEvents).values(event).returning({
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      source: auditEvents.source,
      actorType: auditEvents.actorType,
    });

    expect(row).toEqual({
      action: "oauth_client.created",
      targetType: "oauth_client",
      targetId: IDS.productionClient,
      source: "platform",
      actorType: "user",
      metadata: {
        label: "DogDays",
        redirectUris: callback,
      },
    });
  });

  it("are append-only", async () => {
    await rejectsWith(
      sql`update platform."auditEvents" set action = 'tampered'
          where "actorUserId" = ${IDS.owner}::uuid`,
      /append-only/,
    );
  });
});

describe("findConsentTarget", () => {
  beforeAll(async () => {
    await db.execute(sql`
      delete from platform."oauthRegistrations"
       where "clientId" in (${IDS.devClient}::uuid, ${IDS.productionClient}::uuid)
    `);
    await db.execute(sql`
      insert into platform."oauthRegistrations"
        ("clientId", "userId", label, status, "homepageUrl")
      values
        (${IDS.devClient}::uuid, ${IDS.owner}::uuid, 'Dev app', 'testing', null),
        (${IDS.productionClient}::uuid, ${IDS.owner}::uuid, 'Prod app', 'in_production', 'https://dogdays.dev')
    `);
    await db.execute(sql`
      insert into auth.oauth_authorizations
        (id, authorization_id, client_id, user_id, redirect_uri, scope, status)
      values
        (gen_random_uuid(), 'tiers-db-test-dev', ${IDS.devClient}::uuid, null,
         'http://127.0.0.1:54321/auth/v1/callback', 'openid email profile', 'pending'),
        (gen_random_uuid(), 'tiers-db-test-production', ${IDS.productionClient}::uuid, null,
         ${callback}, 'openid email profile', 'pending')
    `);
  });

  it("reads the status, the owner, the details and the stored return address", async () => {
    expect(await findConsentTarget("tiers-db-test-production")).toEqual({
      ownerUserId: IDS.owner,
      status: "in_production",
      asksForConsent: true,
      redirectUri: callback,
      label: "Prod app",
      logoPath: null,
      homepageUrl: "https://dogdays.dev",
      privacyPolicyUrl: null,
    });
    expect(await findConsentTarget("tiers-db-test-dev")).toMatchObject({
      ownerUserId: IDS.owner,
      status: "testing",
      redirectUri: "http://127.0.0.1:54321/auth/v1/callback",
    });
  });

  it("is null for an id nobody issued", async () => {
    expect(await findConsentTarget("tiers-db-test-nope")).toBeNull();
  });

  it("is null when the client was never registered", async () => {
    await db.execute(sql`
      delete from platform."oauthRegistrations"
      where "clientId" = ${IDS.productionClient}::uuid
    `);
    expect(await findConsentTarget("tiers-db-test-production")).toBeNull();
  });
});

describe("platform.oauth_refuses_user", () => {
  it("refuses a test identity on an In production app only", async () => {
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId", status)
      values (${IDS.productionClient}::uuid, ${IDS.owner}::uuid, 'in_production')
    `);
    await db.execute(sql`
      insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId")
      values (${IDS.holder}::uuid, ${IDS.owner}::uuid)
      on conflict do nothing
    `);
    const refuses = async (client: string, user: string) => {
      const [row] = await db.execute<{ r: boolean }>(
        sql`select platform.oauth_refuses_user(${client}::uuid, ${user}::uuid) as r`,
      );
      return row!.r;
    };
    expect(await refuses(IDS.productionClient, IDS.holder)).toBe(true);
    expect(await refuses(IDS.productionClient, IDS.bystander)).toBe(false);
    expect(await refuses(IDS.devClient, IDS.holder)).toBe(false);
    await db.execute(
      sql`delete from platform."oauthTestAccounts" where "testUserId" = ${IDS.holder}::uuid`,
    );
  });
});
