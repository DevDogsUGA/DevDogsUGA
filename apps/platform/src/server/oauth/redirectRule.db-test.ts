// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { ACCEPTED, REFUSED } from "./redirectRule.corpus";
import { isValidRedirectUri } from "./redirectRule";

/**
 * The redirect rule in the database (`platform.oauth_redirect_is_valid`) and in
 * TypeScript (`./redirectRule`) agree on one corpus, and the migration's check
 * (`platform.check_oauth_redirects`, run by supabase/e1-data-step.sql) fails
 * loudly on a stored redirect the rule refuses.
 */

const CLIENT = "f8000000-0000-4000-b000-000000000001";
const OWNER = "f8000000-0000-4000-a000-000000000001";

async function sqlSays(uri: string): Promise<boolean> {
  const [row] = await db.execute<{ ok: boolean }>(
    sql`select platform.oauth_redirect_is_valid(${uri}) as ok`,
  );
  return row!.ok;
}

async function cleanup() {
  await db.execute(
    sql`delete from platform."oauthRegistrations" where "clientId" = ${CLIENT}::uuid`,
  );
  await db.execute(
    sql`delete from auth.oauth_clients where id = ${CLIENT}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${OWNER}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${OWNER}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'redirect-rule@uga.edu')
  `);
});
afterAll(cleanup);

describe("platform.oauth_redirect_is_valid", () => {
  it.each(ACCEPTED)("accepts %s, like the TypeScript rule", async (uri) => {
    expect(await sqlSays(uri)).toBe(true);
    expect(isValidRedirectUri(uri)).toBe(true);
  });

  it.each(REFUSED)("refuses %j, like the TypeScript rule", async (uri) => {
    expect(await sqlSays(uri)).toBe(false);
    expect(isValidRedirectUri(uri)).toBe(false);
  });

  it("refuses null and an address over 2048 characters", async () => {
    const [row] = await db.execute<{ ok: boolean | null }>(
      sql`select platform.oauth_redirect_is_valid(null) as ok`,
    );
    expect(row!.ok).toBe(false);
    const long = `https://example.com/${"a".repeat(2100)}`;
    expect(await sqlSays(long)).toBe(false);
    expect(isValidRedirectUri(long)).toBe(false);
  });
});

describe("platform.check_oauth_redirects (the migration's check)", () => {
  async function store(redirectUris: string, deleted = false) {
    await db.execute(
      sql`delete from platform."oauthRegistrations" where "clientId" = ${CLIENT}::uuid`,
    );
    await db.execute(
      sql`delete from auth.oauth_clients where id = ${CLIENT}::uuid`,
    );
    await db.execute(sql`
      insert into auth.oauth_clients (
        id, client_secret_hash, registration_type, redirect_uris, grant_types,
        client_name, client_type, token_endpoint_auth_method,
        created_at, updated_at, deleted_at
      ) values (${CLIENT}::uuid, '', 'manual', ${redirectUris},
        'authorization_code,refresh_token', 'redirect rule test', 'public', 'none',
        now(), now(), ${deleted ? sql`now()` : sql`null`})
    `);
    await db.execute(sql`
      insert into platform."oauthRegistrations" ("clientId", "userId")
      values (${CLIENT}::uuid, ${OWNER}::uuid)
    `);
  }
  const check = () => db.execute(sql`select platform.check_oauth_redirects()`);

  it("passes when every stored redirect passes, comma-separated lists included", async () => {
    await store(
      "https://dogdays.dev/cb,http://localhost:3000/auth, http://[::1]:1/x",
    );
    await expect(check()).resolves.toBeDefined();
  });

  it("raises, naming the client and the address, on one that does not", async () => {
    await store("https://dogdays.dev/cb,http://192.168.1.5:3000/cb");
    const error = (await check().then(
      () => null,
      (e: unknown) => e,
    )) as { message: string; cause?: { message: string } } | null;
    expect(error).not.toBeNull();
    const message = error?.cause?.message ?? error?.message ?? "";
    expect(message).toContain(CLIENT);
    expect(message).toContain("http://192.168.1.5:3000/cb");
  });

  it("ignores a client GoTrue has already deleted", async () => {
    await store("myapp://callback", true);
    await expect(check()).resolves.toBeDefined();
  });
});
