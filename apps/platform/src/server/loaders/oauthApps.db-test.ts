// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * Connected apps lists a member's unrevoked approvals; Console → Apps lists
 * DevDogs apps, published ones and members' Testing apps with the number of members holding an
 * approval. Run against the real schema, with the session replaced.
 */

const MEMBER = "f8000000-0000-4000-a000-000000000001";
const OTHER = "f8000000-0000-4000-a000-000000000002";
const OWNER = "f8000000-0000-4000-a000-000000000003";
const APP_LIVE = "f8000000-0000-4000-b000-000000000001";
const APP_TESTING = "f8000000-0000-4000-b000-000000000002";
const APP_DEVDOGS = "f8000000-0000-4000-b000-000000000003";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const { getConnectedApps, getConsoleApps } = await import("./oauthApps");

async function cleanup() {
  for (const c of [APP_LIVE, APP_TESTING, APP_DEVDOGS]) {
    await db.execute(
      sql`delete from auth.oauth_consents where client_id = ${c}::uuid`,
    );
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${c}::uuid`,
    );
    await db.execute(sql`delete from auth.oauth_clients where id = ${c}::uuid`);
  }
  for (const u of [MEMBER, OTHER, OWNER])
    await db.execute(sql`delete from auth.users where id = ${u}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  for (const [i, u] of [MEMBER, OTHER, OWNER].entries()) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${u}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`oauth-apps-loader-${i}@uga.edu`})
    `);
  }
  for (const [c, name] of [
    [APP_LIVE, "Live app"],
    [APP_TESTING, "Testing app"],
    [APP_DEVDOGS, "DevDogs app"],
  ] as const) {
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method, created_at, updated_at
      ) values (${c}::uuid, '', 'manual', 'https://app.example.com/cb',
        'authorization_code,refresh_token', ${name}, 'public', 'none', now(), now())
    `);
  }
  await db.execute(sql`
    insert into platform."oauthRegistrations"
      ("clientId", "userId", label, status, "logoPath", "homepageUrl", "privacyPolicyUrl")
    values
      (${APP_LIVE}::uuid, ${OWNER}::uuid, 'Live app', 'in_production',
       'apps/live.webp', 'https://live.example', 'https://live.example/p'),
      (${APP_TESTING}::uuid, ${OWNER}::uuid, 'Testing app', 'testing', null, null, null)
  `);
  await db.execute(sql`
    insert into platform."oauthRegistrations"
      ("clientId", "userId", label, status, "asksForConsent")
    values (${APP_DEVDOGS}::uuid, null, 'DevDogs app', 'in_production', false)
  `);
  for (const [u, c] of [
    [MEMBER, APP_LIVE],
    [OTHER, APP_LIVE],
    [MEMBER, APP_TESTING],
    [MEMBER, APP_DEVDOGS],
  ]) {
    await db.execute(sql`
      insert into auth.oauth_consents (id, user_id, client_id, scopes)
      values (gen_random_uuid(), ${u}::uuid, ${c}::uuid, 'openid email')
    `);
  }
  await db.execute(sql`
    update auth.oauth_consents set revoked_at = now()
     where user_id = ${MEMBER}::uuid and client_id = ${APP_DEVDOGS}::uuid
  `);
});

afterAll(cleanup);

describe("getConnectedApps", () => {
  it("lists the member's unrevoked approvals with the app's details", async () => {
    session.userId = MEMBER;
    const apps = await getConnectedApps();
    expect(apps.map((a) => a.clientId).sort()).toEqual(
      [APP_LIVE, APP_TESTING].sort(),
    );
    expect(apps.find((a) => a.clientId === APP_LIVE)).toMatchObject({
      label: "Live app",
      homepageUrl: "https://live.example",
    });
  });

  it("never lists another member's approvals", async () => {
    session.userId = OTHER;
    expect((await getConnectedApps()).map((a) => a.clientId)).toEqual([
      APP_LIVE,
    ]);
  });
});

describe("getConsoleApps", () => {
  it("lists DevDogs apps first, then published ones, then members' Testing apps", async () => {
    const mine = (await getConsoleApps()).filter((a) =>
      [APP_LIVE, APP_TESTING, APP_DEVDOGS].includes(a.clientId),
    );
    expect(mine.map((a) => a.clientId)).toEqual([
      APP_DEVDOGS,
      APP_LIVE,
      APP_TESTING,
    ]);
    // A member's Testing app is listed with what publishing still needs.
    expect(mine.find((a) => a.clientId === APP_TESTING)?.missing).toEqual([
      "a logo",
      "a homepage",
      "a privacy policy",
    ]);
  });

  it("counts the members holding an approval, ignoring revoked ones", async () => {
    const apps = await getConsoleApps();
    expect(apps.find((a) => a.clientId === APP_LIVE)?.approvedMembers).toBe(2);
    expect(apps.find((a) => a.clientId === APP_DEVDOGS)).toMatchObject({
      approvedMembers: 0,
      isDevDogs: true,
      asksForConsent: false,
    });
  });
});
