// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";

/**
 * Deleting a member takes their reflections and revision history with them,
 * without loosening the append-only guards (migration 51).
 *
 * The audit event that pointed at the deleted revision stays, with only that
 * pointer cleared. Direct deletes of a revision and direct edits of an audit
 * event are still refused, including clearing a pointer to a revision that
 * still exists.
 */

const IDS = {
  member: "f7000000-0000-4000-a000-000000000001",
  meeting: "f7000000-0000-4000-d000-000000000001",
  reflection: "f7000000-0000-4000-e000-000000000001",
  revision: "f7000000-0000-4000-e000-000000000002",
  auditEvent: "f7000000-0000-4000-e000-000000000003",
};

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform."auditEvents" where id = ${IDS.auditEvent}::uuid`,
    );
    await tx.execute(
      sql`delete from platform."reflectionRevisions" where id = ${IDS.revision}::uuid`,
    );
  });
  await db.execute(
    sql`delete from platform.reflections where id = ${IDS.reflection}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'member-deletion-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt", "countsForCredit")
    values (${IDS.meeting}::uuid, 'member-deletion-meeting',
            now() - interval '1 day', now() - interval '1 day' + interval '2 hours', true)
  `);
  await db.execute(sql`
    insert into platform.reflections (id, "userId", "meetingId", content)
    values (${IDS.reflection}::uuid, ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'draft')
  `);
  await db.execute(sql`
    insert into platform."reflectionRevisions"
      (id, "reflectionId", "userId", "meetingId", content, "createdByUserId")
    values (${IDS.revision}::uuid, ${IDS.reflection}::uuid, ${IDS.member}::uuid,
            ${IDS.meeting}::uuid, 'draft', ${IDS.member}::uuid)
  `);
  await db.execute(sql`
    insert into platform."auditEvents"
      (id, "actorType", "actorUserId", source, action, "targetType", "targetId",
       "afterReflectionRevisionId")
    values (${IDS.auditEvent}::uuid, 'user', ${IDS.member}::uuid, 'platform',
            'reflection.saved', 'reflection', ${IDS.reflection},
            ${IDS.revision}::uuid)
  `);
});

afterAll(cleanup);

async function rejects(statement: ReturnType<typeof sql>) {
  const error: unknown = await db
    .transaction(async (tx) => {
      await tx.execute(statement);
    })
    .then(
      () => null,
      (err: unknown) => err,
    );
  // Drizzle wraps the driver error; the trigger's message is on `cause`.
  const cause = error instanceof Error ? error.cause : undefined;
  expect(cause instanceof Error ? cause.message : String(cause)).toMatch(
    /append-only/,
  );
}

describe("member deletion", () => {
  it("still refuses a direct delete of a revision", async () => {
    await rejects(
      sql`delete from platform."reflectionRevisions" where id = ${IDS.revision}::uuid`,
    );
  });

  it("still refuses editing an audit event", async () => {
    await rejects(
      sql`update platform."auditEvents" set action = 'tampered' where id = ${IDS.auditEvent}::uuid`,
    );
  });

  it("still refuses clearing a pointer to a revision that exists", async () => {
    await rejects(
      sql`update platform."auditEvents" set "afterReflectionRevisionId" = null where id = ${IDS.auditEvent}::uuid`,
    );
  });

  it("deletes the member's reflections and history and keeps the audit event", async () => {
    await db.execute(
      sql`delete from auth.users where id = ${IDS.member}::uuid`,
    );

    const [reflections] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform.reflections where id = ${IDS.reflection}::uuid`,
    );
    const [revisions] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from platform."reflectionRevisions" where id = ${IDS.revision}::uuid`,
    );
    const [event] = await db.execute<{
      action: string;
      after: string | null;
    }>(sql`
      select action, "afterReflectionRevisionId" as after
      from platform."auditEvents" where id = ${IDS.auditEvent}::uuid
    `);

    expect(reflections!.n).toBe(0);
    expect(revisions!.n).toBe(0);
    expect(event).toEqual({ action: "reflection.saved", after: null });
  });
});
