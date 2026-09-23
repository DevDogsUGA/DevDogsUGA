// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { streamAttendanceRows } from "./attendance";

const IDS = {
  member: "e1000000-0000-4000-a000-000000000001",
  countingMeeting: "e1000000-0000-4000-a000-000000000002",
  nonCountingMeeting: "e1000000-0000-4000-a000-000000000003",
};

async function collect(...args: Parameters<typeof streamAttendanceRows>) {
  const rows = [];
  for await (const row of streamAttendanceRows(...args)) rows.push(row);
  return rows;
}

async function cleanup() {
  await db.execute(sql`
    delete from platform.attendance where "userId" = ${IDS.member}::uuid
  `);
  await db.execute(sql`
    delete from platform.meetings
    where id in (${IDS.countingMeeting}::uuid, ${IDS.nonCountingMeeting}::uuid)
  `);
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
            'authenticated', 'authenticated', 'attendance-export-test@uga.edu')
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Export Test Member')
  `);
  await db.execute(sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data)
    values (gen_random_uuid(), ${IDS.member}::uuid, 'github', 'attendance-export-gh',
            '{"sub":"attendance-export-gh","user_name":"exporttestuser"}'::jsonb)
    on conflict do nothing
  `);
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "nameOverride", "configId", "startsAt", "endsAt", "countsForCredit")
    values
      (${IDS.countingMeeting}::uuid, 'attendance-export-counting',
       'Attendance Export Counting', 'attendance-export-counting',
       now() - interval '2 days', now() - interval '2 days' + interval '2 hours', true),
      (${IDS.nonCountingMeeting}::uuid, 'attendance-export-noncounting',
       'Attendance Export Non-Counting', null,
       now() - interval '10 days', now() - interval '10 days' + interval '2 hours', false)
  `);
  await db.execute(sql`
    insert into platform.attendance (id, "meetingId", "userId", method)
    values
      (gen_random_uuid(), ${IDS.countingMeeting}::uuid, ${IDS.member}::uuid, 'qr'),
      (gen_random_uuid(), ${IDS.nonCountingMeeting}::uuid, ${IDS.member}::uuid, 'manual_code')
  `);
});

afterAll(cleanup);

describe("streamAttendanceRows", () => {
  it("emits one row per check-in with identity, meeting, and credit columns", async () => {
    const rows = (await collect({}, 10)).filter(
      (row) => row.userId === IDS.member,
    );
    expect(rows).toHaveLength(2);

    const counting = rows.find(
      (row) => row.meetingConfigId === "attendance-export-counting",
    );
    expect(counting).toBeDefined();
    expect(counting).toMatchObject({
      preferredName: "Export Test Member",
      email: "attendance-export-test@uga.edu",
      githubLogin: "exporttestuser",
      meetingTitle: "Attendance Export Counting",
      method: "qr",
      countsForCredit: true,
    });

    const nonCounting = rows.find((row) => row.method === "manual_code");
    expect(nonCounting).toBeDefined();
    // No configId on this fixture, and countsForCredit false -- the export
    // must report both honestly rather than defaulting either.
    expect(nonCounting!.meetingConfigId).toBeNull();
    expect(nonCounting!.countsForCredit).toBe(false);
  });

  it("scopes to one meeting with the meetingId filter", async () => {
    const rows = await collect({ meetingId: IDS.countingMeeting }, 10);
    expect(rows.every((row) => row.meetingConfigId !== null)).toBe(true);
    expect(rows.filter((row) => row.userId === IDS.member)).toHaveLength(1);
  });

  it("scopes to a date range on the meeting's start", async () => {
    const rows = await collect(
      {
        from: new Date(Date.now() - 3 * 86_400_000),
        to: new Date(),
      },
      10,
    );
    const mine = rows.filter((row) => row.userId === IDS.member);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.method).toBe("qr");
  });
});
