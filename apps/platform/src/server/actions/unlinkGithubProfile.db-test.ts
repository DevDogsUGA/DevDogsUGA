// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { createOauthClientAndRegister } from "~/server/oauth/registerClient";

/**
 * Unlinking GitHub takes a member's DEVELOPMENT OAuth clients (they are gated
 * on GitHub) and nothing else. A production client belongs to a DevDogs app's
 * sign-in; it leaves only through the audited, replacement-checked delete in
 * `oauth.ts`, so an officer unlinking GitHub on /account must not break an
 * app's sign-in, or delete a client without an audit entry.
 *
 * Only the session and the GitHub provider call are faked; the registrations,
 * GoTrue clients and audit table are real.
 */

const session = vi.hoisted(() => ({ id: "" }));

vi.mock("~/server/auth", async () => {
  const { db } = await import("~/server/db");
  return {
    expectUserWith: async (
      include: Parameters<typeof db.query.usersInAuth.findFirst>[0] extends
        { with?: infer W } | undefined
        ? W
        : never,
    ) => {
      const user = await db.query.usersInAuth.findFirst({
        columns: { id: true, email: true, rawUserMetaData: true },
        where: { id: session.id },
        with: include,
      });
      if (!user) throw new Error("User expected but not found.");
      return user;
    },
    authenticate: () => Promise.reject(new Error("sign-in required")),
  };
});
vi.mock("~/server/auth/providers/github", () => ({
  unlinkProfile: () => Promise.resolve(),
}));
vi.mock("next/cache", () => ({ refresh: () => undefined }));

const { default: unlinkGithubProfile } = await import("./unlinkGithubProfile");

const OFFICER = "f7000000-0000-4000-a000-000000000011";
const PREFIX = "unlink-github-db-test";
const DOGDAYS = "https://dogdays.supabase.co/auth/v1/callback";

async function cleanup() {
  await db.execute(
    sql`delete from auth.oauth_clients where client_name like ${`${PREFIX}%`}`,
  );
  await db.execute(
    sql`delete from platform.profile where "userId" = ${OFFICER}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${OFFICER}::uuid`);
}

async function registrations() {
  return db.execute<{ label: string; status: string }>(
    sql`select label, status::text as status from platform."oauthRegistrations"
        where "userId" = ${OFFICER}::uuid order by label`,
  );
}

async function liveClients() {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from auth.oauth_clients
        where client_name like ${`${PREFIX}%`} and deleted_at is null`,
  );
  return rows[0]!.n;
}

async function auditCount() {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from platform."auditEvents"
        where "targetType" = 'oauth_client' and "actorUserId" = ${OFFICER}::uuid`,
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  await cleanup();
  session.id = OFFICER;
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${OFFICER}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'unlink-github-officer@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${OFFICER}::uuid, 'Unlink Officer')
  `);
});

afterAll(cleanup);

describe("unlinking GitHub", () => {
  it("deletes development clients and leaves production clients, their GoTrue clients and their audit trail alone", async () => {
    // The audit table is append-only, so earlier runs leave rows behind:
    // count relative to now.
    const auditStart = await auditCount();
    await createOauthClientAndRegister({
      label: `${PREFIX}-dev`,
      redirectUris: ["http://localhost:3000/auth"],
      userId: OFFICER,
    });
    const prod = await createOauthClientAndRegister({
      label: `${PREFIX}-prod`,
      redirectUris: [DOGDAYS],
      userId: OFFICER,
    });
    await db.execute(sql`
      update platform."oauthRegistrations" set status = 'in_production'
      where "clientId" = ${prod.clientId}::uuid`);
    expect(await registrations()).toEqual([
      { label: `${PREFIX}-dev`, status: "testing" },
      { label: `${PREFIX}-prod`, status: "in_production" },
    ]);
    const auditBefore = await auditCount();
    expect(auditBefore).toBe(auditStart); // creating an app is not audited

    await unlinkGithubProfile();

    expect(await registrations()).toEqual([
      { label: `${PREFIX}-prod`, status: "in_production" },
    ]);
    // The development client is gone from GoTrue too; the production one is live.
    expect(await liveClients()).toBe(1);
    // No audit entry was lost, and none was invented for the development client.
    expect(await auditCount()).toBe(auditBefore);
  });

  it("does nothing to production clients when the member has no development client", async () => {
    await unlinkGithubProfile();
    expect(await registrations()).toEqual([
      { label: `${PREFIX}-prod`, status: "in_production" },
    ]);
    expect(await liveClients()).toBe(1);
  });
});
