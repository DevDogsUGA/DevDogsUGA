// @vitest-environment node
import { sql, type SQL } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import { listPublicProfiles } from "~/server/loaders/publicProfiles";
import { createOauthClientAndRegister } from "~/server/oauth/registerClient";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * Scheduling, cancelling and running an account deletion against a real
 * database (account-deletion Q4, Q5, Q13, Q42; Q168): the pending row and its
 * audit entry, the President block, the officer permission, what the job
 * leaves behind, and that a failed step is retried without doing anything
 * twice.
 *
 * Faked, because they reach outside the database: the email binding, the
 * permission lookup (the permission system has its own tests), the delivery
 * queue, the Discord API, and GoTrue's user deletion (the test users are raw
 * `auth.users` rows, which GoTrue's own deleteUser is not guaranteed to scan).
 * Everything else, including the OAuth app removal through a real local GoTrue
 * and the `enqueue_user_standing` SQL function, is real.
 */

type EmailResult =
  { ok: true } | { ok: false; reason: string; message: string };

const fake = vi.hoisted(() => ({
  sent: [] as { to: string; name: string; props: Record<string, string> }[],
  /** Null sends successfully. */
  emailResult: null as EmailResult | null,
  officers: new Set<string>(),
  queued: [] as string[],
  stripped: [] as string[],
}));

vi.mock("next/cache", () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}));
vi.mock("~/server/email/send", () => ({
  sendTemplate: (to: string, name: string, props: Record<string, string>) => {
    fake.sent.push({ to, name, props });
    return Promise.resolve(fake.emailResult ?? { ok: true });
  },
}));
vi.mock("~/server/actions/permissions", () => ({
  canUserDeleteAccounts: (id: string) => Promise.resolve(fake.officers.has(id)),
}));
vi.mock("~/server/moderation/queue", () => ({
  queueDeliveriesQuietly: (ids: string[]) => {
    fake.queued.push(...ids);
    return Promise.resolve();
  },
}));
vi.mock("~/server/discord/memberSync", () => ({
  stripSyncedRolesFromGuild: (id: string) => {
    fake.stripped.push(id);
    return Promise.resolve(0);
  },
}));

const { scheduleAccountDeletion, cancelAccountDeletion, getPendingDeletion } =
  await import("./schedule");
const { PRESIDENT_ROLE_ID, SOLE_PRESIDENT_ERROR } = await import("./schedule");
const { runDueDeletions } = await import("./job");

const id = (n: number) =>
  `fa000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const MEMBER = id(1);
const OFFICER = id(2);
const OTHER = id(3);
const BANNED = id(4);
const PLAIN = id(5);
const ALL = [MEMBER, OFFICER, OTHER, BANNED, PLAIN] as const;

const emailOf = (userId: string) => `pp-dbtest-${userId}@persona.test`;
const PREFIX = "account-deletion-job-db-test";
const APP_SLUG = `${PREFIX}-app`;
const KEY_NAME = "deleted_account_block_key";
const DOGDAYS = "https://dogdays.supabase.co/auth/v1/callback";

let createdKey = false;
const NOW = new Date("2026-10-23T15:30:00.000Z");
const LONG_AGO = new Date("2026-09-01T12:00:00.000Z");

function rows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  return db.execute<T>(query) as unknown as Promise<T[]>;
}

async function one<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T | undefined> {
  return (await rows<T>(query))[0];
}

async function count(query: SQL): Promise<number> {
  const row = await one<{ n: number }>(query);
  return row?.n ?? 0;
}

const userIdList = () =>
  sql.join(
    ALL.map((u) => sql`${u}::uuid`),
    sql`, `,
  );

async function cleanup() {
  // Audit entries are append-only; a trigger refuses the delete unless the
  // session skips triggers.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."auditEvents"
      where "targetId" in (${sql.join(
        ALL.map((u) => sql`${u}`),
        sql`, `,
      )})
         or "actorUserId" in (${userIdList()})`);
  });
  await db.execute(
    sql`delete from platform."moderationDeliveries"
        where "payload" -> 'data' ->> 'userId' in (${sql.join(
          ALL.map((u) => sql`${u}`),
          sql`, `,
        )})`,
  );
  await db.execute(
    sql`delete from platform."accountDeletions" where "userId" in (${userIdList()})`,
  );
  await db.execute(
    sql`delete from platform."deletedAccountBlocks"
        where "subjectHash" in (${sql.join(
          ALL.map((u) => sql`platform.deleted_account_hash(${emailOf(u)})`),
          sql`, `,
        )})`,
  );
  for (const table of [
    "userPlanDraftCourses",
    "userPlanDrafts",
    "userSavedPlans",
    "userPreferences",
  ]) {
    await db.execute(
      sql`delete from "schedule_builder".${sql.identifier(table)}
          where "userId" in (${userIdList()})`,
    );
  }
  await db.execute(
    sql`delete from platform."oauthRegistrations" where label like ${`${PREFIX}%`}`,
  );
  await db.execute(
    sql`delete from auth.oauth_clients where client_name like ${`${PREFIX}%`}`,
  );
  await db.execute(sql`delete from platform.apps where slug = ${APP_SLUG}`);
  await deleteMembers(ALL);
}

/** The fake `deleteUser` removes the row, or fails once with this message. */
let failDeleteUser: string | null = null;
let deleteUserCalls = 0;

beforeAll(async () => {
  const existing = await one<{ n: number }>(
    sql`select count(*)::int as n from vault.secrets where name = ${KEY_NAME}`,
  );
  if ((existing?.n ?? 0) === 0) {
    await db.execute(
      sql`select vault.create_secret('account-deletion-job-test-key', ${KEY_NAME})`,
    );
    createdKey = true;
  }

  vi.spyOn(supabaseAdmin.auth.admin, "deleteUser").mockImplementation(
    async (userId: string) => {
      deleteUserCalls++;
      if (failDeleteUser) {
        const message = failDeleteUser;
        failDeleteUser = null;
        return {
          data: { user: null },
          error: { message, status: 500 },
        } as never;
      }
      await db.execute(sql`delete from auth.users where id = ${userId}::uuid`);
      return { data: { user: null }, error: null } as never;
    },
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
  if (createdKey) {
    await db.execute(sql`delete from vault.secrets where name = ${KEY_NAME}`);
  }
});

beforeEach(async () => {
  await cleanup();
  fake.sent.length = 0;
  fake.queued.length = 0;
  fake.stripped.length = 0;
  fake.emailResult = null;
  fake.officers.clear();
  failDeleteUser = null;
  deleteUserCalls = 0;
  for (const [n, handle] of [
    [MEMBER, "ad-member"],
    [OFFICER, "ad-officer"],
    [OTHER, "ad-other"],
    [BANNED, "ad-banned"],
    [PLAIN, "ad-plain"],
  ] as const) {
    // The roster name doubles as the preferred name ("Deletion ad-member"), so
    // the member passes verification and is listed until deletion hides them.
    await insertMember({ id: n, handle, first: "Deletion", last: handle });
  }
});

afterEach(() => {
  fake.officers.clear();
});

async function auditRows(userId: string) {
  return rows<{
    action: string;
    actorUserId: string | null;
    actorType: string;
    metadata: Record<string, unknown>;
  }>(
    sql`select action, "actorUserId", "actorType", metadata
        from platform."auditEvents"
        where "targetType" = 'user' and "targetId" = ${userId}
        order by "createdAt", id`,
  );
}

const listedHandles = async () =>
  (await listPublicProfiles()).map((p) => p.handle);

describe("scheduleAccountDeletion", () => {
  it("schedules a member's own deletion fourteen days out", async () => {
    await db.execute(sql`
      insert into auth.sessions (id, user_id, created_at, updated_at)
      values (gen_random_uuid(), ${MEMBER}::uuid, now(), now()),
             (gen_random_uuid(), ${MEMBER}::uuid, now(), now())
    `);
    expect(await listedHandles()).toContain("ad-member");

    const result = await scheduleAccountDeletion(MEMBER, MEMBER, {
      now: NOW,
      reason: "  graduating  ",
    });

    expect(result.created).toBe(true);
    expect(result.scheduledFor.toISOString()).toBe("2026-11-06T15:30:00.000Z");
    const pending = await one<{
      requestedBy: string;
      reason: string;
      email: string;
      name: string;
    }>(sql`select "requestedBy", reason, email, name
           from platform."accountDeletions" where "userId" = ${MEMBER}::uuid`);
    expect(pending).toEqual({
      requestedBy: MEMBER,
      reason: "graduating",
      email: emailOf(MEMBER),
      name: "Deletion ad-member",
    });

    // Every session is revoked, and the profile is hidden.
    expect(
      await count(
        sql`select count(*)::int as n from auth.sessions where user_id = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    expect(await listedHandles()).not.toContain("ad-member");

    const audit = await auditRows(MEMBER);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "user.deletion_scheduled",
      actorUserId: MEMBER,
      actorType: "user",
      metadata: { byOfficer: false, hasReason: true },
    });
    // Ids and flags only: no name or address.
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain("persona.test");

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]).toMatchObject({
      to: emailOf(MEMBER),
      name: "AccountDeletionScheduled",
      props: {
        name: "Deletion ad-member",
        requestedLine: "You asked to delete your account.",
        scheduledDate: "Friday, November 6, 2026",
      },
    });
    expect(fake.sent[0]!.props.keepUrl).toMatch(/\/account\/deletion$/);
  });

  it("changes nothing when it is scheduled twice", async () => {
    const first = await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });
    const later = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    const second = await scheduleAccountDeletion(MEMBER, MEMBER, {
      now: later,
    });

    expect(second.created).toBe(false);
    expect(second.scheduledFor.toISOString()).toBe(
      first.scheduledFor.toISOString(),
    );
    expect(await auditRows(MEMBER)).toHaveLength(1);
    expect(fake.sent).toHaveLength(1);
  });

  it("refuses the sole holder of President, whoever asks", async () => {
    const others = await rows<{ userId: string }>(
      sql`select "userId" from platform."userRoles"
          where "roleId" = ${PRESIDENT_ROLE_ID}::uuid and "userId" <> ${MEMBER}::uuid`,
    );
    try {
      await db.execute(sql`
        delete from platform."userRoles"
        where "roleId" = ${PRESIDENT_ROLE_ID}::uuid`);
      await db.execute(sql`
        insert into platform."userRoles" ("userId", "roleId")
        values (${MEMBER}::uuid, ${PRESIDENT_ROLE_ID}::uuid)`);
      fake.officers.add(OFFICER);

      await expect(
        scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW }),
      ).rejects.toThrow(SOLE_PRESIDENT_ERROR);
      await expect(
        scheduleAccountDeletion(MEMBER, OFFICER, { now: NOW }),
      ).rejects.toThrow(SOLE_PRESIDENT_ERROR);
      expect(await getPendingDeletion(MEMBER)).toBeNull();
      expect(fake.sent).toHaveLength(0);

      // With a second President the first may go.
      await db.execute(sql`
        insert into platform."userRoles" ("userId", "roleId")
        values (${OTHER}::uuid, ${PRESIDENT_ROLE_ID}::uuid)`);
      await expect(
        scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW }),
      ).resolves.toMatchObject({ created: true });
    } finally {
      await db.execute(sql`
        delete from platform."userRoles"
        where "roleId" = ${PRESIDENT_ROLE_ID}::uuid
          and "userId" in (${MEMBER}::uuid, ${OTHER}::uuid)`);
      for (const { userId } of others) {
        await db.execute(sql`
          insert into platform."userRoles" ("userId", "roleId")
          values (${userId}::uuid, ${PRESIDENT_ROLE_ID}::uuid)
          on conflict do nothing`);
      }
    }
  });

  it("lets an officer with canDeleteAccounts schedule a member, audited as them", async () => {
    fake.officers.add(OFFICER);

    await scheduleAccountDeletion(MEMBER, OFFICER, { now: NOW });

    const pending = await one<{ requestedBy: string }>(
      sql`select "requestedBy" from platform."accountDeletions"
          where "userId" = ${MEMBER}::uuid`,
    );
    expect(pending?.requestedBy).toBe(OFFICER);
    const audit = await auditRows(MEMBER);
    expect(audit[0]).toMatchObject({
      action: "user.deletion_scheduled",
      actorUserId: OFFICER,
      metadata: { byOfficer: true },
    });
    expect(fake.sent[0]).toMatchObject({
      to: emailOf(MEMBER),
      props: {
        requestedLine: "A DevDogs officer scheduled your account for deletion.",
      },
    });
    expect(await getPendingDeletion(MEMBER)).toMatchObject({
      requestedByOfficer: true,
      started: false,
    });
  });

  it("refuses an officer without canDeleteAccounts, and an unknown member", async () => {
    await expect(
      scheduleAccountDeletion(MEMBER, OFFICER, { now: NOW }),
    ).rejects.toThrow("canDeleteAccounts");
    expect(await getPendingDeletion(MEMBER)).toBeNull();

    fake.officers.add(OFFICER);
    await expect(
      scheduleAccountDeletion(id(99), OFFICER, { now: NOW }),
    ).rejects.toThrow("No such member");
    expect(fake.sent).toHaveLength(0);
  });
});

describe("canDeleteAccounts", () => {
  const DEVOPS_DIRECTOR_ROLE_ID = "00000000-0000-4000-8000-000000000003";
  const can = async (userId: string) =>
    (
      await one<{ can: boolean }>(sql`
        select "canDeleteAccounts" as can
        from platform."resolvedUserPermissions"
        where "userId" = ${userId}::uuid`)
    )?.can ?? false;

  it("is held by the seeded President and DevOps Director roles, and not by a plain member", async () => {
    try {
      await db.execute(sql`
        insert into platform."userRoles" ("userId", "roleId")
        values (${OFFICER}::uuid, ${PRESIDENT_ROLE_ID}::uuid),
               (${OTHER}::uuid, ${DEVOPS_DIRECTOR_ROLE_ID}::uuid)`);
      expect(await can(OFFICER)).toBe(true);
      expect(await can(OTHER)).toBe(true);
      expect(await can(PLAIN)).toBe(false);
    } finally {
      await db.execute(sql`
        delete from platform."userRoles"
        where "userId" in (${OFFICER}::uuid, ${OTHER}::uuid)
          and "roleId" in (${PRESIDENT_ROLE_ID}::uuid, ${DEVOPS_DIRECTOR_ROLE_ID}::uuid)`);
    }
  });
});

describe("cancelAccountDeletion", () => {
  it("restores the profile and writes an audit entry", async () => {
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });
    expect(await listedHandles()).not.toContain("ad-member");

    expect(await cancelAccountDeletion(MEMBER)).toBe(true);

    expect(await getPendingDeletion(MEMBER)).toBeNull();
    expect(await listedHandles()).toContain("ad-member");
    const audit = await auditRows(MEMBER);
    expect(audit.map((a) => a.action)).toEqual([
      "user.deletion_scheduled",
      "user.deletion_cancelled",
    ]);
    expect(audit[1]).toMatchObject({ actorUserId: MEMBER });
  });

  it("lets an officer holding canDeleteAccounts cancel, as the actor", async () => {
    fake.officers.add(OFFICER);
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });

    expect(await cancelAccountDeletion(MEMBER, OFFICER)).toBe(true);

    const audit = await auditRows(MEMBER);
    expect(audit.at(-1)).toMatchObject({
      action: "user.deletion_cancelled",
      actorUserId: OFFICER,
    });
  });

  it("refuses an officer without canDeleteAccounts, and leaves it pending", async () => {
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });

    await expect(cancelAccountDeletion(MEMBER, OTHER)).rejects.toThrow(
      "canDeleteAccounts",
    );
    expect(await getPendingDeletion(MEMBER)).not.toBeNull();
  });

  it("has nothing to cancel without a pending deletion", async () => {
    expect(await cancelAccountDeletion(MEMBER)).toBe(false);
  });

  it("is too late once the job has started", async () => {
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });
    await db.execute(
      sql`update platform."accountDeletions" set "lastAttemptAt" = now()
          where "userId" = ${MEMBER}::uuid`,
    );

    expect(await cancelAccountDeletion(MEMBER)).toBe(false);
    expect(await getPendingDeletion(MEMBER)).toMatchObject({ started: true });
  });
});

describe("runDueDeletions", () => {
  it("leaves a deletion whose window has not ended alone", async () => {
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: NOW });

    const run = await runDueDeletions(new Date(NOW.getTime() + 60_000));

    expect(run.completed).not.toContain(MEMBER);
    expect(await getPendingDeletion(MEMBER)).not.toBeNull();
    expect(
      await count(
        sql`select count(*)::int as n from auth.users where id = ${MEMBER}::uuid`,
      ),
    ).toBe(1);
  });

  it("deletes the account and everything the plan lists", async () => {
    // A suspended member who owns an OAuth app, has schedule-builder rows, and
    // sits beside an app that is owed a user.delete.
    await db.execute(sql`
      insert into platform."userSuspensions" ("userId", service, reason)
      values (${MEMBER}::uuid, 'global', 'test')`);
    const owned = await createOauthClientAndRegister({
      label: `${PREFIX}-owned`,
      redirectUris: ["http://localhost:3000/auth"],
      userId: MEMBER,
    });
    // A production app the member published is deleted with them (Q160).
    const published = await createOauthClientAndRegister({
      label: `${PREFIX}-published`,
      redirectUris: [DOGDAYS],
      userId: MEMBER,
      tier: "production",
    });
    const devdogs = await createOauthClientAndRegister({
      label: `${PREFIX}-devdogs`,
      redirectUris: [DOGDAYS],
      userId: OFFICER,
      tier: "production",
    });
    await db.execute(sql`
      update platform."oauthRegistrations" set "userId" = null
      where "clientId" = ${devdogs.clientId}::uuid`);
    await db.execute(sql`
      insert into "schedule_builder"."userPreferences" ("userId", "currentAcademicPeriod")
      values (${MEMBER}::uuid, 202608)`);
    await db.execute(sql`
      insert into "schedule_builder"."userPlanDrafts" ("userId", "academicPeriod")
      values (${MEMBER}::uuid, 202608)`);
    await db.execute(sql`
      insert into "schedule_builder"."userSavedPlans" ("userId", "academicPeriod", title, crns)
      values (${MEMBER}::uuid, 202608, 'plan', '{1,2}')`);
    const course = await one<{ id: number }>(
      sql`select id from "schedule_builder".courses limit 1`,
    );
    if (course) {
      await db.execute(sql`
        insert into "schedule_builder"."userPlanDraftCourses" ("userId", "academicPeriod", "courseId")
        values (${MEMBER}::uuid, 202608, ${course.id})`);
    }
    const [app] = await rows<{ id: string }>(sql`
      insert into platform.apps (slug, "displayName", kind)
      values (${APP_SLUG}, 'Deletion job test app', 'external')
      returning id`);

    await scheduleAccountDeletion(MEMBER, MEMBER, { now: LONG_AGO });
    const run = await runDueDeletions(NOW);

    expect(run.failed).toEqual([]);
    expect(run.completed).toEqual([MEMBER]);

    // The auth user, the pending row and the profile are gone.
    for (const query of [
      sql`select count(*)::int as n from auth.users where id = ${MEMBER}::uuid`,
      sql`select count(*)::int as n from platform.profile where "userId" = ${MEMBER}::uuid`,
      sql`select count(*)::int as n from platform."accountDeletions" where "userId" = ${MEMBER}::uuid`,
    ]) {
      expect(await count(query)).toBe(0);
    }

    // A moderated member leaves a block that matches their address, for good.
    const block = await one<{ expiresAt: Date | null }>(sql`
      select "expiresAt" from platform."deletedAccountBlocks"
      where "subjectHash" = platform.deleted_account_hash(${emailOf(MEMBER)})`);
    expect(block).toBeDefined();
    expect(block!.expiresAt).toBeNull();

    // Their app is deleted through the shared path; a DevDogs app (no owner)
    // is not touched.
    expect(
      await count(sql`select count(*)::int as n from platform."oauthRegistrations"
                      where "clientId" = ${owned.clientId}::uuid`),
    ).toBe(0);
    const goTrue = await one<{ deleted: boolean }>(sql`
      select deleted_at is not null as deleted from auth.oauth_clients
      where id = ${owned.clientId}::uuid`);
    expect(goTrue?.deleted).toBe(true);
    expect(
      await count(sql`select count(*)::int as n from platform."oauthRegistrations"
                      where "clientId" = ${published.clientId}::uuid`),
    ).toBe(0);
    const publishedGoTrue = await one<{ deleted: boolean }>(sql`
      select deleted_at is not null as deleted from auth.oauth_clients
      where id = ${published.clientId}::uuid`);
    expect(publishedGoTrue?.deleted).toBe(true);
    expect(
      await count(sql`select count(*)::int as n from platform."auditEvents"
                      where action = 'oauth_client.owner_cleared'
                        and "targetId" = ${published.clientId}`),
    ).toBe(0);
    const kept = await one<{ userId: string | null; deleted: boolean }>(sql`
      select r."userId", c.deleted_at is not null as deleted
      from platform."oauthRegistrations" r
      join auth.oauth_clients c on c.id = r."clientId"
      where r."clientId" = ${devdogs.clientId}::uuid`);
    expect(kept).toEqual({ userId: null, deleted: false });

    // The schedule builder's tables have no foreign key and are erased.
    for (const table of [
      "userPlanDraftCourses",
      "userPlanDrafts",
      "userSavedPlans",
      "userPreferences",
    ]) {
      expect(
        await count(sql`select count(*)::int as n from "schedule_builder".${sql.identifier(table)}
                        where "userId" = ${MEMBER}::uuid`),
      ).toBe(0);
    }

    // Every registered app is owed one user.delete, and it is queued.
    const deliveries = await rows<{ id: string; type: string; status: string }>(
      sql`select id, type, status::text as status from platform."moderationDeliveries"
          where "appId" = ${app!.id}::uuid
            and "payload" -> 'data' ->> 'userId' = ${MEMBER}`,
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.type).toBe("user.delete");
    // The Discord roles the platform synced are taken off before the link goes.
    expect(fake.stripped).toEqual([MEMBER]);

    // One user.deleted entry, written by the system, with no personal data.
    const audit = (await auditRows(MEMBER)).filter(
      (a) => a.action === "user.deleted",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: null,
      actorType: "system",
      metadata: { blocked: true, byOfficer: false },
    });
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain("persona.test");

    // The deletion-complete email goes to the address the account used.
    const completion = fake.sent.filter(
      (s) => s.name === "AccountDeletionComplete",
    );
    expect(completion).toHaveLength(1);
    expect(completion[0]!.to).toBe(emailOf(MEMBER));
  });

  it("writes no block for a member who is not suspended or banned", async () => {
    await scheduleAccountDeletion(PLAIN, PLAIN, { now: LONG_AGO });

    const run = await runDueDeletions(NOW);

    expect(run.completed).toEqual([PLAIN]);
    expect(
      await count(sql`select count(*)::int as n from platform."deletedAccountBlocks"
                      where "subjectHash" = platform.deleted_account_hash(${emailOf(PLAIN)})`),
    ).toBe(0);
    const audit = (await auditRows(PLAIN)).find(
      (a) => a.action === "user.deleted",
    );
    expect(audit?.metadata).toMatchObject({ blocked: false });
  });

  it("blocks a banned member too", async () => {
    await db.execute(sql`
      update auth.users set banned_until = now() + interval '10 years'
      where id = ${BANNED}::uuid`);
    await scheduleAccountDeletion(BANNED, BANNED, { now: LONG_AGO });

    const run = await runDueDeletions(NOW);

    expect(run.completed).toEqual([BANNED]);
    const block = await one<{ expiresAt: Date | null }>(sql`
      select "expiresAt" from platform."deletedAccountBlocks"
      where "subjectHash" = platform.deleted_account_hash(${emailOf(BANNED)})`);
    expect(block).toBeDefined();
    expect(block!.expiresAt).toBeNull();
  });

  it("retries a deletion whose auth user could not be deleted, without repeating work", async () => {
    await db.execute(sql`
      insert into platform."userSuspensions" ("userId", service, reason)
      values (${MEMBER}::uuid, 'global', 'test')`);
    const [app] = await rows<{ id: string }>(sql`
      insert into platform.apps (slug, "displayName", kind)
      values (${APP_SLUG}, 'Deletion job test app', 'external')
      returning id`);
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: LONG_AGO });

    failDeleteUser = "GoTrue is down";
    const first = await runDueDeletions(NOW);

    expect(first.completed).toEqual([]);
    expect(first.failed).toHaveLength(1);
    expect(first.failed[0]).toMatchObject({ userId: MEMBER });
    expect(first.failed[0]!.error).toContain("GoTrue is down");
    // Still pending, still there, error recorded, nothing announced.
    const pending = await one<{ attempts: number; lastError: string }>(
      sql`select attempts, "lastError" from platform."accountDeletions"
          where "userId" = ${MEMBER}::uuid`,
    );
    expect(pending?.attempts).toBe(1);
    expect(pending?.lastError).toContain("GoTrue is down");
    expect(
      await count(
        sql`select count(*)::int as n from auth.users where id = ${MEMBER}::uuid`,
      ),
    ).toBe(1);
    expect(
      (await auditRows(MEMBER)).filter((a) => a.action === "user.deleted"),
    ).toHaveLength(0);
    expect(
      fake.sent.filter((s) => s.name === "AccountDeletionComplete"),
    ).toHaveLength(0);

    const second = await runDueDeletions(NOW);

    expect(second.failed).toEqual([]);
    expect(second.completed).toEqual([MEMBER]);
    expect(
      await count(
        sql`select count(*)::int as n from platform."accountDeletions" where "userId" = ${MEMBER}::uuid`,
      ),
    ).toBe(0);
    // The block is one row, the deliveries were enqueued once, the audit entry
    // written once, the email sent once.
    expect(
      await count(sql`select count(*)::int as n from platform."deletedAccountBlocks"
                      where "subjectHash" = platform.deleted_account_hash(${emailOf(MEMBER)})`),
    ).toBe(1);
    expect(
      await count(sql`select count(*)::int as n from platform."moderationDeliveries"
                      where "appId" = ${app!.id}::uuid
                        and "payload" -> 'data' ->> 'userId' = ${MEMBER}`),
    ).toBe(1);
    expect(
      (await auditRows(MEMBER)).filter((a) => a.action === "user.deleted"),
    ).toHaveLength(1);
    expect(
      fake.sent.filter((s) => s.name === "AccountDeletionComplete"),
    ).toHaveLength(1);
  });

  it("does not let a failing deletion take every batch from the members after it", async () => {
    await scheduleAccountDeletion(MEMBER, MEMBER, { now: LONG_AGO });
    await scheduleAccountDeletion(OTHER, OTHER, {
      now: new Date(LONG_AGO.getTime() + 60_000),
    });

    // One deletion per run. The older one fails first.
    failDeleteUser = "GoTrue is down";
    const first = await runDueDeletions(NOW, 1);
    expect(first.failed.map((f) => f.userId)).toEqual([MEMBER]);

    // The failure stays due, but the member never tried goes ahead of it.
    const second = await runDueDeletions(NOW, 1);
    expect(second.completed).toEqual([OTHER]);

    const third = await runDueDeletions(NOW, 1);
    expect(third.completed).toEqual([MEMBER]);
  });

  it("finishes the audit entry and email after the auth user is already gone", async () => {
    await scheduleAccountDeletion(PLAIN, PLAIN, { now: LONG_AGO });

    // The auth user is deleted, then the completion email fails for no stated
    // reason: the row outlives the user so the rest is retried.
    fake.emailResult = { ok: false, reason: "unknown", message: "timeout" };
    const first = await runDueDeletions(NOW);
    expect(first.failed).toHaveLength(1);
    expect(
      await count(
        sql`select count(*)::int as n from auth.users where id = ${PLAIN}::uuid`,
      ),
    ).toBe(0);
    expect(await getPendingDeletion(PLAIN)).not.toBeNull();

    fake.emailResult = null;
    const callsBefore = deleteUserCalls;
    const second = await runDueDeletions(NOW);

    expect(second.completed).toEqual([PLAIN]);
    // Nothing was deleted a second time.
    expect(deleteUserCalls).toBe(callsBefore);
    expect(
      (await auditRows(PLAIN)).filter((a) => a.action === "user.deleted"),
    ).toHaveLength(1);
    expect(await getPendingDeletion(PLAIN)).toBeNull();
  });

  it("leaves a deletion cancellable when the member became the sole President", async () => {
    const others = await rows<{ userId: string }>(
      sql`select "userId" from platform."userRoles"
          where "roleId" = ${PRESIDENT_ROLE_ID}::uuid and "userId" <> ${PLAIN}::uuid`,
    );
    try {
      await scheduleAccountDeletion(PLAIN, PLAIN, { now: LONG_AGO });
      await db.execute(sql`
        delete from platform."userRoles" where "roleId" = ${PRESIDENT_ROLE_ID}::uuid`);
      await db.execute(sql`
        insert into platform."userRoles" ("userId", "roleId")
        values (${PLAIN}::uuid, ${PRESIDENT_ROLE_ID}::uuid)`);

      const run = await runDueDeletions(NOW);

      expect(run.completed).toEqual([]);
      expect(run.failed[0]?.error).toContain(SOLE_PRESIDENT_ERROR);
      expect((await getPendingDeletion(PLAIN))?.started).toBe(false);
      await expect(cancelAccountDeletion(PLAIN)).resolves.toBe(true);
    } finally {
      await db.execute(sql`
        delete from platform."userRoles"
        where "roleId" = ${PRESIDENT_ROLE_ID}::uuid and "userId" = ${PLAIN}::uuid`);
      for (const { userId } of others) {
        await db.execute(sql`
          insert into platform."userRoles" ("userId", "roleId")
          values (${userId}::uuid, ${PRESIDENT_ROLE_ID}::uuid)
          on conflict do nothing`);
      }
    }
  });

  it("does not wait on an email that can never be delivered", async () => {
    await scheduleAccountDeletion(PLAIN, PLAIN, { now: LONG_AGO });
    fake.emailResult = { ok: false, reason: "suppressed", message: "bounced" };

    const run = await runDueDeletions(NOW);

    expect(run.completed).toEqual([PLAIN]);
    expect(run.failed).toEqual([]);
  });
});

describe("what account deletion does with the new tables", () => {
  it("accountDeletions: the job removes the row; deleting the user directly keeps it for the job to finish", async () => {
    await scheduleAccountDeletion(OTHER, OTHER, { now: NOW });
    await db.execute(sql`delete from auth.users where id = ${OTHER}::uuid`);

    // No foreign key on userId: the row survives the user, by design.
    expect(await getPendingDeletion(OTHER)).not.toBeNull();

    // requestedBy is nulled, not blocked, when the officer who asked goes.
    await db.execute(sql`
      insert into platform."accountDeletions" ("userId", "scheduledFor", "requestedBy", email)
      values (${BANNED}::uuid, now(), ${OFFICER}::uuid, 'x@uga.edu')
      on conflict do nothing`);
    await db.execute(sql`delete from auth.users where id = ${OFFICER}::uuid`);
    const row = await one<{ requestedBy: string | null }>(
      sql`select "requestedBy" from platform."accountDeletions" where "userId" = ${BANNED}::uuid`,
    );
    expect(row).toEqual({ requestedBy: null });
  });

  it("deletedAccountBlocks: survives the member, which is its purpose", async () => {
    await db.execute(sql`
      insert into platform."deletedAccountBlocks" ("subjectHash", "expiresAt")
      select platform.deleted_account_hash(${emailOf(PLAIN)}), null`);
    await db.execute(sql`delete from auth.users where id = ${PLAIN}::uuid`);
    expect(
      await count(sql`select count(*)::int as n from platform."deletedAccountBlocks"
                      where "subjectHash" = platform.deleted_account_hash(${emailOf(PLAIN)})`),
    ).toBe(1);
  });
});
