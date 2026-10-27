// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { hasActiveConsent } from "./consentTarget";

/**
 * `hasActiveConsent` reads Supabase Auth's own approvals
 * (`auth.oauth_consents`, scopes stored space separated), so the first
 * sign-in shows the card and later ones skip it.
 */

const USER = "f7000000-0000-4000-a000-000000000001";
const OTHER = "f7000000-0000-4000-a000-000000000002";
const CLIENT = "f7000000-0000-4000-b000-000000000001";

async function cleanup() {
  await db.execute(
    sql`delete from auth.oauth_consents where client_id = ${CLIENT}::uuid`,
  );
  await db.execute(
    sql`delete from auth.oauth_clients where id = ${CLIENT}::uuid`,
  );
  for (const u of [USER, OTHER])
    await db.execute(sql`delete from auth.users where id = ${u}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  for (const [i, u] of [USER, OTHER].entries()) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${u}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${`consent-target-${i}@uga.edu`})
    `);
  }
  await db.execute(sql`
    insert into auth.oauth_clients (
      id, client_secret_hash, registration_type, redirect_uris, grant_types,
      client_name, client_type, token_endpoint_auth_method, created_at, updated_at
    ) values (${CLIENT}::uuid, '', 'manual', 'https://app.example.com/cb',
      'authorization_code,refresh_token', 'consent target test', 'public', 'none', now(), now())
  `);
  await db.execute(sql`
    insert into auth.oauth_consents (id, user_id, client_id, scopes)
    values (gen_random_uuid(), ${USER}::uuid, ${CLIENT}::uuid, 'openid email')
  `);
});

afterAll(cleanup);

describe("hasActiveConsent", () => {
  it("is true when the approval covers every scope asked for", async () => {
    expect(await hasActiveConsent(USER, CLIENT, "openid email")).toBe(true);
  });

  it("is true for a subset of what was approved", async () => {
    expect(await hasActiveConsent(USER, CLIENT, "openid")).toBe(true);
  });

  it("is false when the app now asks for more than was approved", async () => {
    expect(await hasActiveConsent(USER, CLIENT, "openid email profile")).toBe(
      false,
    );
  });

  it("is false for a member who never approved it", async () => {
    expect(await hasActiveConsent(OTHER, CLIENT, "openid")).toBe(false);
  });

  it("is false once the approval is revoked", async () => {
    await db.execute(sql`
      update auth.oauth_consents set revoked_at = now()
       where user_id = ${USER}::uuid and client_id = ${CLIENT}::uuid
    `);
    expect(await hasActiveConsent(USER, CLIENT, "openid")).toBe(false);
  });
});
