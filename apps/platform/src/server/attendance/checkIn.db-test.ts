// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";

/**
 * Check-in, against a real database.
 *
 * The interesting question is not whether the query runs — it is whether a
 * `CheckInError` thrown INSIDE `db.transaction` still arrives at the catch
 * block as a `CheckInError`. Drizzle wraps query failures in
 * `DrizzleQueryError`, and if it wrapped user-thrown errors too, the
 * `instanceof` check would silently never match and every refusal would reach
 * the member as an unhandled 500 rather than as "check-in has closed".
 *
 * That is precisely the assumption that was already wrong once here, for
 * `isUniqueViolation`. Asserting it rather than reasoning about it is the
 * whole point.
 */

const IDS = {
  project: "b1111111-1111-1111-1111-111111111111",
  meetingOpen: "b2222222-2222-2222-2222-222222222222",
  meetingClosed: "b2222222-2222-2222-2222-222222222223",
  member: "b9999999-9999-9999-9999-999999999999",
};

async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where id in (${IDS.meetingOpen}::uuid, ${IDS.meetingClosed}::uuid)`,
  );
  await db.execute(
    sql`delete from platform.projects where id = ${IDS.project}::uuid`,
  );
  await db.execute(sql`delete from auth.users where id = ${IDS.member}::uuid`);
}

beforeAll(async () => {
  await cleanup();

  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${IDS.member}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'checkin-test@uga.edu')
    on conflict (id) do nothing
  `);
  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.project}::uuid, 'checkin-test', 'Check-in Test')
  `);

  // Open: started an hour ago, check-in closes in an hour.
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt", "checkInClosesAt")
    values (${IDS.meetingOpen}::uuid, 'checkin-open', 'Open Meeting',
            now() - interval '1 hour', now() + interval '2 hours',
            now() + interval '1 hour')
  `);
  // Closed: check-in closed an hour ago while the meeting is STILL RUNNING.
  // That gap is the whole reason `checkInClosesAt` is its own column — someone
  // arriving at the end for the free pizza must not earn the same star.
  await db.execute(sql`
    insert into platform.meetings (id, slug, name, "startsAt", "endsAt", "checkInClosesAt")
    values (${IDS.meetingClosed}::uuid, 'checkin-closed', 'Closed Meeting',
            now() - interval '3 hours', now() + interval '1 hour',
            now() - interval '1 hour')
  `);

  await db.execute(sql`
    insert into platform."checkInCodes" (code, "meetingId")
    values ('OPEN01', ${IDS.meetingOpen}::uuid), ('SHUT01', ${IDS.meetingClosed}::uuid)
  `);
});

afterAll(cleanup);

// The action calls `expectSession`, which needs a request context. Mocking it
// is what lets the rest of the action — the part worth testing — run for real
// against the real schema.
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve("b9999999-9999-9999-9999-999999999999"),
}));

const { checkIn } = await import("~/server/actions/attendance");

describe("checkIn", () => {
  it("records attendance for a valid code", async () => {
    const result = await checkIn("open01");

    // Lowercased on purpose: the code is read aloud in a room, so it is
    // normalized rather than demanding the member match the case on screen.
    expect(result).toEqual({
      ok: true,
      meetingId: IDS.meetingOpen,
      workshopId: null,
    });
  });

  it("reports a second redemption rather than failing", async () => {
    // A member attends a meeting once no matter how many workshops it holds,
    // so this is a no-op worth reporting, not an error worth failing on.
    expect(await checkIn("OPEN01")).toEqual({
      ok: false,
      error: "already_checked_in",
    });
  });

  it("refuses a code nobody issued", async () => {
    expect(await checkIn("NOPE99")).toEqual({
      ok: false,
      error: "code_not_found",
    });
  });

  it("refuses after check-in closes, even while the meeting runs", async () => {
    // Validated against `checkInClosesAt`, never `endsAt`. This meeting has
    // over an hour left and check-in is still shut.
    expect(await checkIn("SHUT01")).toEqual({
      ok: false,
      error: "check_in_closed",
    });
  });

  it("wrote exactly one attendance row across all of that", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.attendance
      where "userId" = ${IDS.member}::uuid
    `);
    expect(rows[0]!.n).toBe(1);
  });
});
