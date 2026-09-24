// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { auditEvents, reflectionSettings } from "~/server/db/schema";

/**
 * `updateReflectionSettings` against a real database.
 *
 * `canUserManageAttendance` is mocked rather than seeded through a real role
 * -- no other `.db-test.ts` file in this app exercises the permission system
 * through `roles`/`userRoles`/the `resolvedUserPermissions` matview, and doing
 * so here would test the permission system a second time instead of this
 * action's own logic (validation bounds, the update, the audit event).
 * `expectSession` is mocked the same way `teams.db-test.ts` and
 * `reflections.db-test.ts` mock it.
 *
 * `reflectionSettings` is a global singleton -- every caller, including
 * `saveReflection` and `getReflectionActivities`, reads the same one row --
 * so this suite captures its starting values and restores them in `afterAll`
 * rather than asserting against the migration's hardcoded defaults, which the
 * local dev DB is free to have already diverged from.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));

const permissions = vi.hoisted(() => ({ canManageAttendance: false }));
vi.mock("~/server/actions/permissions", () => ({
  canUserManageAttendance: () =>
    Promise.resolve(permissions.canManageAttendance),
}));

// `updateReflectionSettings` revalidates two paths on success, which needs a
// request's static generation store a plain Node test never has. Stub it the
// same way `reflections.db-test.ts` stubs it.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { updateReflectionSettings } =
  await import("~/server/actions/reflectionSettings");

const IDS = {
  officer: "e4a00000-0000-4000-a000-000000000001",
};

let original: { minimumWordCount: number; submissionWindowDays: number };

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  const [row] = await db
    .select({
      minimumWordCount: reflectionSettings.minimumWordCount,
      submissionWindowDays: reflectionSettings.submissionWindowDays,
    })
    .from(reflectionSettings)
    .limit(1);
  if (!row) throw new Error("reflectionSettings singleton row is missing.");
  original = row;

  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.officer}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'reflection-settings-action-test@uga.edu')
    on conflict (id) do nothing
  `);
});

afterAll(async () => {
  await db
    .update(reflectionSettings)
    .set({ ...original, updatedAt: new Date() })
    .where(eq(reflectionSettings.id, true));
  await db.execute(sql`
    delete from platform."auditEvents" where "actorUserId" = ${IDS.officer}::uuid
  `);
  await db.execute(sql`delete from auth.users where id = ${IDS.officer}::uuid`);
});

describe("updateReflectionSettings", () => {
  it("refuses a caller without canManageAttendance", async () => {
    session.userId = IDS.officer;
    permissions.canManageAttendance = false;

    const result = await updateReflectionSettings(
      { ok: false, message: "" },
      formData({ minimumWordCount: "150", submissionWindowDays: "5" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Not authorized: canManageAttendance required.",
    });
  });

  it("refuses an out-of-bounds submission and leaves the row untouched", async () => {
    session.userId = IDS.officer;
    permissions.canManageAttendance = true;

    const result = await updateReflectionSettings(
      { ok: false, message: "" },
      formData({ minimumWordCount: "0", submissionWindowDays: "5" }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/minimum word count/i);

    const [row] = await db
      .select({ minimumWordCount: reflectionSettings.minimumWordCount })
      .from(reflectionSettings)
      .limit(1);
    expect(row?.minimumWordCount).toBe(original.minimumWordCount);
  });

  it("updates the singleton row and records an audit event", async () => {
    session.userId = IDS.officer;
    permissions.canManageAttendance = true;

    const result = await updateReflectionSettings(
      { ok: false, message: "" },
      formData({ minimumWordCount: "150", submissionWindowDays: "5" }),
    );

    expect(result).toEqual({
      ok: true,
      message: "Reflection settings updated.",
    });

    const [row] = await db
      .select({
        minimumWordCount: reflectionSettings.minimumWordCount,
        submissionWindowDays: reflectionSettings.submissionWindowDays,
      })
      .from(reflectionSettings)
      .limit(1);
    expect(row).toEqual({ minimumWordCount: 150, submissionWindowDays: 5 });

    const [event] = await db
      .select({ action: auditEvents.action, metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, IDS.officer))
      .limit(1);
    expect(event?.action).toBe("reflectionSettings.updated");
    expect(event?.metadata).toMatchObject({
      before: original,
      after: { minimumWordCount: 150, submissionWindowDays: 5 },
    });
  });
});
