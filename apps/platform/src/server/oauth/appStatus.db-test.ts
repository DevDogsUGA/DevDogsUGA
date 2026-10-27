// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  forgetApproval,
  missingForPublishing,
  setAppStatus,
  setAsksForConsent,
  transferToDevDogs,
} from "./appStatus";

/**
 * The domain steps behind the status actions, against a real database: what
 * publishing needs, what each change records, and who each kill switch reaches.
 */

const id = (kind: string, n: number) =>
  `fa100000-0000-4000-${kind}000-0000000000${String(n).padStart(2, "0")}`;
const HOLDER = id("a", 1);
const OWNER = id("a", 2);
const OWNER_TEST = id("a", 3);
const MEMBER = id("a", 4);
const USERS = [HOLDER, OWNER, OWNER_TEST, MEMBER];
const APP = id("b", 1);

async function audit(action: string) {
  return db.execute<{ actor: string; metadata: Record<string, unknown> }>(sql`
    select "actorUserId" as actor, metadata from platform."auditEvents"
     where "targetId" = ${APP} and action = ${action} order by "createdAt", id
  `);
}

async function app() {
  const [row] = await db.execute<{
    status: string;
    owner: string | null;
    asks: boolean;
  }>(sql`
    select status::text as status, "userId" as owner, "asksForConsent" as asks
      from platform."oauthRegistrations" where "clientId" = ${APP}::uuid
  `);
  return row!;
}

async function liveSessions(): Promise<string[]> {
  const rows = await db.execute<{ u: string }>(sql`
    select user_id::text as u from auth.sessions
     where oauth_client_id = ${APP}::uuid order by user_id`);
  return rows.map((r) => r.u);
}

async function cleanup() {
  await db.execute(
    sql`delete from auth.sessions where oauth_client_id = ${APP}::uuid`,
  );
  await db.execute(
    sql`delete from auth.oauth_consents where client_id = ${APP}::uuid`,
  );
  await db.execute(
    sql`delete from platform."oauthRegistrations" where "clientId" = ${APP}::uuid`,
  );
  await db.execute(sql`delete from auth.oauth_clients where id = ${APP}::uuid`);
  await db.execute(
    sql`delete from platform."oauthTestAccounts" where "testUserId" = ${OWNER_TEST}::uuid`,
  );
  for (const u of USERS)
    await db.execute(sql`delete from auth.users where id = ${u}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  for (const [i, u] of USERS.entries()) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${u}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`app-status-${i}@uga.edu`})
    `);
  }
  await db.execute(sql`
    insert into auth.oauth_clients (
      id, client_secret_hash, registration_type, redirect_uris, grant_types,
      client_name, client_type, token_endpoint_auth_method, created_at, updated_at
    ) values (${APP}::uuid, '', 'manual', 'https://app.example.com/cb',
      'authorization_code,refresh_token', 'app status test', 'public', 'none', now(), now())
  `);
  await db.execute(sql`
    insert into platform."oauthRegistrations" ("clientId", "userId", label)
    values (${APP}::uuid, ${OWNER}::uuid, 'Status app')
  `);
  await db.execute(sql`
    insert into platform."oauthTestAccounts" ("testUserId", "ownerUserId")
    values (${OWNER_TEST}::uuid, ${OWNER}::uuid)
  `);
  for (const u of [OWNER, OWNER_TEST, MEMBER]) {
    await db.execute(sql`
      insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id)
      values (gen_random_uuid(), ${u}::uuid, now(), now(), ${APP}::uuid)`);
    await db.execute(sql`
      insert into auth.oauth_consents (id, user_id, client_id, scopes)
      values (gen_random_uuid(), ${u}::uuid, ${APP}::uuid, 'openid')`);
  }
});

afterAll(cleanup);

describe("missingForPublishing", () => {
  it("names what is absent", () => {
    expect(
      missingForPublishing({
        logoPath: null,
        homepageUrl: null,
        privacyPolicyUrl: null,
      }),
    ).toEqual(["a logo", "a homepage", "a privacy policy"]);
    expect(
      missingForPublishing({
        logoPath: "x.png",
        homepageUrl: "https://a.dev",
        privacyPolicyUrl: "https://a.dev/p",
      }),
    ).toEqual([]);
  });
});

describe("setAppStatus", () => {
  it("refuses to publish without a logo, homepage and privacy policy, and changes nothing", async () => {
    await expect(
      setAppStatus({
        actorUserId: HOLDER,
        clientId: APP,
        status: "in_production",
      }),
    ).rejects.toThrow(/add a logo, a homepage, a privacy policy/);
    expect((await app()).status).toBe("testing");
    expect(await audit("oauth_app.published")).toHaveLength(0);
  });

  it("publishes: ends the test accounts' sessions and approvals, keeps members', and audits the counts", async () => {
    await db.execute(sql`
      update platform."oauthRegistrations"
         set "logoPath" = 'oauth/app.png', "homepageUrl" = 'https://app.example.com',
             "privacyPolicyUrl" = 'https://app.example.com/privacy'
       where "clientId" = ${APP}::uuid`);
    const result = await setAppStatus({
      actorUserId: HOLDER,
      clientId: APP,
      status: "in_production",
    });
    expect(result).toEqual({
      changed: true,
      counts: { consents: 1, sessions: 1, authorizations: 0 },
    });
    expect((await app()).status).toBe("in_production");
    expect(await liveSessions()).toEqual([OWNER, MEMBER].sort());
    const [entry] = await audit("oauth_app.published");
    expect(entry).toMatchObject({
      actor: HOLDER,
      metadata: {
        label: "Status app",
        ownerUserId: OWNER,
        consents: 1,
        sessions: 1,
        authorizations: 0,
      },
    });
  });

  it("is a no-op, and records nothing, when the status already matches", async () => {
    expect(
      await setAppStatus({
        actorUserId: HOLDER,
        clientId: APP,
        status: "in_production",
      }),
    ).toEqual({ changed: false, counts: null });
    expect(await audit("oauth_app.published")).toHaveLength(1);
  });

  it("returns to Testing: cuts off everyone but the owner, turns consent back on, audits the counts", async () => {
    const result = await setAppStatus({
      actorUserId: HOLDER,
      clientId: APP,
      status: "testing",
    });
    expect(result.counts).toEqual({
      consents: 1,
      sessions: 1,
      authorizations: 0,
    });
    expect(await liveSessions()).toEqual([OWNER]);
    expect(await app()).toMatchObject({ status: "testing", asks: true });
    expect(await audit("oauth_app.returned_to_testing")).toHaveLength(1);
  });

  it("refuses an app nobody registered", async () => {
    await expect(
      setAppStatus({
        actorUserId: HOLDER,
        clientId: id("b", 99),
        status: "testing",
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("setAsksForConsent", () => {
  it("refuses to skip consent for a member's app, or for one in Testing", async () => {
    await expect(
      setAsksForConsent({
        actorUserId: HOLDER,
        clientId: APP,
        asksForConsent: false,
      }),
    ).rejects.toThrow(/DevDogs app/);
  });

  it("transfers to DevDogs, one way, with an audit entry", async () => {
    expect(
      await transferToDevDogs({ actorUserId: HOLDER, clientId: APP }),
    ).toEqual({ changed: true });
    expect((await app()).owner).toBeNull();
    expect((await audit("oauth_app.transferred_to_devdogs"))[0]).toMatchObject({
      actor: HOLDER,
      metadata: { formerOwnerUserId: OWNER },
    });
    expect(
      await transferToDevDogs({ actorUserId: HOLDER, clientId: APP }),
    ).toEqual({ changed: false });
  });

  it("refuses to skip consent while the DevDogs app is in Testing", async () => {
    await expect(
      setAsksForConsent({
        actorUserId: HOLDER,
        clientId: APP,
        asksForConsent: false,
      }),
    ).rejects.toThrow(/In production/);
  });

  it("skips consent once ownerless and In production, then asks again on request", async () => {
    await setAppStatus({
      actorUserId: HOLDER,
      clientId: APP,
      status: "in_production",
    });
    expect(
      await setAsksForConsent({
        actorUserId: HOLDER,
        clientId: APP,
        asksForConsent: false,
      }),
    ).toEqual({ changed: true });
    expect((await app()).asks).toBe(false);
    // Back to Testing turns it back on by itself.
    await setAppStatus({
      actorUserId: HOLDER,
      clientId: APP,
      status: "testing",
    });
    expect((await app()).asks).toBe(true);
    expect(await audit("oauth_app.consent_changed")).toHaveLength(1);
  });

  it("returning an ownerless app to Testing cuts off everybody, the former owner included", async () => {
    expect(await liveSessions()).toEqual([]);
  });
});

describe("forgetApproval", () => {
  it("ends one member's approval and sessions and audits the counts", async () => {
    await db.execute(sql`
      insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id)
      values (gen_random_uuid(), ${MEMBER}::uuid, now(), now(), ${APP}::uuid),
             (gen_random_uuid(), ${OWNER}::uuid, now(), now(), ${APP}::uuid)`);
    await db.execute(sql`
      update auth.oauth_consents set revoked_at = null
       where client_id = ${APP}::uuid and user_id = ${MEMBER}::uuid`);
    const counts = await forgetApproval({
      actorUserId: MEMBER,
      clientId: APP,
      userId: MEMBER,
    });
    expect(counts).toEqual({ consents: 1, sessions: 1, authorizations: 0 });
    expect(await liveSessions()).toEqual([OWNER]);
    expect((await audit("oauth_app.approval_forgotten"))[0]).toMatchObject({
      actor: MEMBER,
      metadata: { userId: MEMBER, consents: 1, sessions: 1 },
    });
  });
});
