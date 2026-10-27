// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * `saveReflection` against a real database.
 *
 * Reflections are written for meetings only. The meeting case guards a bug the
 * competition branch once hid: `eligibleActivity` reads `m."endsAt"` through
 * raw SQL, which comes back as text (see the note in reflections/load.ts), not
 * the `Date` its declared return type claimed. `reflectionDeadline` calls
 * `.getTime()` on it, so every meeting reflection threw before the fix.
 * `expectSession` is mocked so the action runs as a real member without a
 * request context.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));
// `saveReflection` revalidates the attendance page on success, which needs a
// request's static generation store that a plain Node test never has. Stub
// it the same way `expectSession` is stubbed above, rather than reaching for
// a full Next.js request context just to prove the action wrote correctly.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { saveReflection } = await import("~/server/actions/reflections");

const IDS = {
  member: "e4000000-0000-4000-a000-000000000001",
  meeting: "e4000000-0000-4000-a000-000000000006",
  unattendedMeeting: "e4000000-0000-4000-a000-000000000007",
  noWorkshopMeeting: "e4000000-0000-4000-a000-000000000008",
};

async function cleanup() {
  // Revisions and audit events are append-only (a trigger rejects
  // delete/update), so the fixture teardown has to step around it the same
  // way `recordAttendance`'s db-test does.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."reflectionRevisions" where "userId" = ${IDS.member}::uuid
    `);
    await tx.execute(sql`
      delete from platform."auditEvents" where "actorUserId" = ${IDS.member}::uuid
    `);
  });
  await db.execute(
    sql`delete from platform.reflections where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.attendance where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id in (${IDS.meeting}::uuid, ${IDS.unattendedMeeting}::uuid, ${IDS.noWorkshopMeeting}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.profile where "userId" = ${IDS.member}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'reflections-action-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Reflections Action Member')
  `);
  await db.execute(sql`
    insert into platform.meetings (id, slug, "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'reflections-action-meeting',
       now() - interval '1 days', now() - interval '1 days' + interval '2 hours'),
      (${IDS.unattendedMeeting}::uuid, 'reflections-action-unattended',
       now() - interval '1 days', now() - interval '1 days' + interval '2 hours'),
      (${IDS.noWorkshopMeeting}::uuid, 'reflections-action-no-workshop',
       now() - interval '1 days', now() - interval '1 days' + interval '2 hours')
  `);
  await db.execute(sql`
    insert into platform.workshops ("meetingId", "definitionId")
    values (${IDS.meeting}::uuid, 'reflections-action-workshop')
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "userId", "meetingId", method, "recordedAt")
    values (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.meeting}::uuid, 'qr', now()),
      (gen_random_uuid(), ${IDS.member}::uuid, ${IDS.noWorkshopMeeting}::uuid, 'qr', now())
  `);
});

afterAll(cleanup);

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("saveReflection", () => {
  it("refuses a meeting the member did not attend", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "meeting",
        activityId: IDS.unattendedMeeting,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "You are not eligible for this reflection.",
    });
  });

  it("refuses an attended meeting that links no workshop (Q165)", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "meeting",
        activityId: IDS.noWorkshopMeeting,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "You are not eligible for this reflection.",
    });
  });

  it("refuses an activity type that no longer exists", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "competition",
        activityId: IDS.meeting,
        content: "My reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({
      ok: false,
      message: "That reflection is invalid.",
    });
  });

  it("saves a meeting reflection instead of throwing on the decoded deadline", async () => {
    session.userId = IDS.member;
    const result = await saveReflection(
      { ok: false, message: "" },
      formData({
        activityType: "meeting",
        activityId: IDS.meeting,
        content: "My meeting reflection",
        intent: "save",
      }),
    );
    expect(result).toEqual({ ok: true, message: "Draft saved." });
  });
});
