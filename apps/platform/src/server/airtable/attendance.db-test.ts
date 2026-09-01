// @vitest-environment node
import { attendanceTable as attendanceSpec } from "@devdogsuga/airtable";
import type { AirtableRecord } from "@devdogsuga/airtable";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { pullAttendance } from "./attendance";

/**
 * The attendance import against a real database.
 *
 * Worth a database test rather than a unit test because every interesting
 * property here is a property of the SCHEMA: the meeting/member uniqueness that
 * makes "attended twice" unrepresentable, the composite foreign key that ties a
 * workshop to its meeting, and the unique index on `airtableRecordId` that
 * makes a re-import an update. None of those exist in a mock.
 *
 * The account-creation path is the other half and carries the real
 * consequence: these rows go into `auth.users`, so what this import writes,
 * and what it refuses to write, is asserted here rather than trusted to a
 * comment.
 */

const F = attendanceSpec.fields;

const IDS = {
  project: "d0000000-0000-0000-0000-0000000000a1",
  // A second project, because `workshops_meetingId_projectId_key` allows one
  // workshop per project per meeting. "Two workshops in one meeting", the case
  // this file most needs, is only representable with two projects.
  project2: "d0000000-0000-0000-0000-0000000000a2",
  meetingA: "d0000000-0000-0000-0000-0000000000b1",
  meetingB: "d0000000-0000-0000-0000-0000000000b2",
  workshopA: "d0000000-0000-0000-0000-0000000000c1",
  workshopA2: "d0000000-0000-0000-0000-0000000000c2",
  workshopB: "d0000000-0000-0000-0000-0000000000c3",
  member: "d0000000-0000-0000-0000-0000000000e1",
};

/** Workshop Airtable record id → platform uuid, as `pullWorkshops` returns. */
const WORKSHOP_IDS = new Map([
  ["recWorkshopA", IDS.workshopA],
  ["recWorkshopA2", IDS.workshopA2],
  ["recWorkshopB", IDS.workshopB],
]);

/** The same, for meetings, as `pullMeetings` returns. */
const MEETING_IDS = new Map([
  ["recMeetingA", IDS.meetingA],
  ["recMeetingB", IDS.meetingB],
]);

function record(
  id: string,
  fields: {
    myId?: string;
    meeting?: string;
    workshop?: string;
    source?: string;
  },
): AirtableRecord {
  return {
    id,
    fields: {
      ...(fields.myId === undefined ? {} : { [F.myId.id]: fields.myId }),
      ...(fields.meeting === undefined
        ? {}
        : { [F.meeting.id]: [fields.meeting] }),
      ...(fields.workshop === undefined
        ? {}
        : { [F.workshop.id]: [fields.workshop] }),
      ...(fields.source === undefined ? {} : { [F.source.id]: fields.source }),
    },
  };
}

async function seed() {
  await cleanup();

  await db.execute(sql`
    insert into auth.users (id, email, instance_id, aud, role)
    values (${IDS.member}::uuid, 'existing@uga.edu',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${IDS.member}::uuid, 'Existing Member')`);

  await db.execute(sql`
    insert into platform.projects (id, slug, "displayName")
    values (${IDS.project}::uuid, 'attendance-test', 'Attendance Test'),
           (${IDS.project2}::uuid, 'attendance-test-2', 'Attendance Test Two')`);

  for (const [id, slug] of [
    [IDS.meetingA, "attendance-test-a"],
    [IDS.meetingB, "attendance-test-b"],
  ] as const) {
    await db.execute(sql`
      insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
      values (${id}::uuid, ${slug}, 'Attendance Test',
              now(), now() + interval '1 hour')`);
  }

  // Two workshops in meeting A, which is the case the meeting-level uniqueness
  // constraint exists to collapse.
  for (const [id, meetingId, projectId] of [
    [IDS.workshopA, IDS.meetingA, IDS.project],
    [IDS.workshopA2, IDS.meetingA, IDS.project2],
    [IDS.workshopB, IDS.meetingB, IDS.project],
  ] as const) {
    await db.execute(sql`
      insert into platform.workshops (id, "meetingId", "projectId")
      values (${id}::uuid, ${meetingId}::uuid, ${projectId}::uuid)`);
  }
}

async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where slug like 'attendance-test-%'`,
  );
  await db.execute(
    sql`delete from platform.projects where slug like 'attendance-test%'`,
  );
  await db.execute(
    sql`delete from auth.users where email like '%@uga.edu' and (email like 'attendee%' or email = 'existing@uga.edu')`,
  );
}

async function attendanceRows() {
  return db.execute<{
    meetingId: string;
    workshopId: string | null;
    userId: string;
    method: string;
    airtableRecordId: string | null;
    email: string;
  }>(sql`
    select a."meetingId", a."workshopId", a."userId", a.method::text as method,
           a."airtableRecordId", u.email
    from platform.attendance a
    join auth.users u on u.id = a."userId"
    where a."meetingId" in (${IDS.meetingA}::uuid, ${IDS.meetingB}::uuid)
    order by u.email, a."meetingId"`);
}

beforeEach(seed);
afterAll(cleanup);

describe("importing a response", () => {
  it("creates an account and an attendance row", async () => {
    const out = await pullAttendance(
      [record("recR1", { myId: "attendee1", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    expect(out.accountsCreated).toBe(1);
    expect(out.refusals).toEqual([]);

    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "attendee1@uga.edu",
      meetingId: IDS.meetingA,
      workshopId: IDS.workshopA,
      method: "airtable",
      airtableRecordId: "recR1",
    });
  });

  it("creates the account UNCONFIRMED", async () => {
    // The most load-bearing line in this import. An unconfirmed identity is
    // what Supabase's linking safeguard removes when a real Google sign-in
    // arrives for the same address. Confirming it here would make a typo'd
    // MyID a permanent lockout for whoever owns it.
    await pullAttendance(
      [record("recR1", { myId: "attendee1", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    const [user] = await db.execute<{
      confirmed: boolean;
      verified: string | null;
    }>(sql`
      select u.email_confirmed_at is not null as confirmed,
             i.identity_data->>'email_verified' as verified
      from auth.users u
      left join auth.identities i on i.user_id = u.id
      where u.email = 'attendee1@uga.edu'`);

    expect(user!.confirmed).toBe(false);
    expect(user!.verified).toBe("false");
  });

  it("does NOT write ugaEmail or the legal name", async () => {
    // A self-declared MyID must never reach `profile."ugaEmail"`. That column
    // is unique and the Involvement roster import writes it for every member
    // inside one transaction. A mistyped MyID sitting there would raise a
    // unique violation when the roster reached the real owner, aborting the
    // import for the entire club.
    await pullAttendance(
      [record("recR1", { myId: "attendee1", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    const [profile] = await db.execute<{
      ugaEmail: string | null;
      legalFirstName: string | null;
      preferredName: string;
    }>(sql`
      select p."ugaEmail", p."legalFirstName", p."preferredName"
      from platform.profile p
      join auth.users u on u.id = p."userId"
      where u.email = 'attendee1@uga.edu'`);

    expect(profile!.ugaEmail).toBeNull();
    expect(profile!.legalFirstName).toBeNull();
    expect(profile!.preferredName).toBe("attendee1");
  });

  it("reuses an existing account rather than creating a second", async () => {
    const out = await pullAttendance(
      [record("recR1", { myId: "existing", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    expect(out.accountsCreated).toBe(0);

    const rows = await attendanceRows();
    expect(rows[0]!.userId).toBe(IDS.member);
  });
});

describe("re-importing", () => {
  it("updates rather than duplicating", async () => {
    const records = [
      record("recR1", { myId: "attendee1", workshop: "recWorkshopA" }),
    ];
    await pullAttendance(records, WORKSHOP_IDS, MEETING_IDS);
    const second = await pullAttendance(records, WORKSHOP_IDS, MEETING_IDS);

    expect(second.accountsCreated).toBe(0);
    expect(await attendanceRows()).toHaveLength(1);
  });

  it("removes a row whose Airtable record has gone", async () => {
    // Deleting the record IS how an officer removes somebody. The rest of the
    // pull archives rather than deletes, on the grounds that a spreadsheet
    // deletion must not destroy platform truth, but that was written when the
    // platform CREATED attendance. Once Airtable is the source, a deleted
    // record is the source saying it did not happen.
    await pullAttendance(
      [record("recR1", { myId: "attendee1", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );
    const out = await pullAttendance([], WORKSHOP_IDS, MEETING_IDS);

    expect(out.removed).toBe(1);
    expect(await attendanceRows()).toHaveLength(0);
  });

  it("re-imports a restored record as an equivalent row", async () => {
    // What makes deletion safe: Airtable's own trash is the recovery path,
    // and a restored record reconstructs the row exactly, because nothing
    // outside this table references an attendance id. Stars read by member and
    // meeting, judging by member and workshop.
    const records = [
      record("recR1", { myId: "attendee1", workshop: "recWorkshopA" }),
    ];
    await pullAttendance(records, WORKSHOP_IDS, MEETING_IDS);
    await pullAttendance([], WORKSHOP_IDS, MEETING_IDS);
    await pullAttendance(records, WORKSHOP_IDS, MEETING_IDS);

    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "attendee1@uga.edu",
      workshopId: IDS.workshopA,
      airtableRecordId: "recR1",
    });
  });

  it("never removes an officer's row that a form later attached to", async () => {
    // The case the `method = 'airtable'` scope exists for, and the only one
    // that exercises it: a row with an airtableRecordId whose method is NOT
    // 'airtable'. An officer added the member by hand, the member then filled
    // in the form, and the import attached its record id to the existing row.
    //
    // Deleting that form response must not delete the officer's row. The
    // officer created it; the response only annotated it.
    //
    // Written this way after a negative control caught the first version being
    // vacuous: it used a row with a NULL record id, which `isNotNull` already
    // excluded, so removing the method scope broke nothing.
    await db.execute(sql`
      insert into platform.attendance ("meetingId", "userId", method, "recordedBy")
      values (${IDS.meetingA}::uuid, ${IDS.member}::uuid, 'officer', ${IDS.member}::uuid)`);
    await pullAttendance(
      [record("recR1", { myId: "existing", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    const attached = await attendanceRows();
    expect(attached[0]).toMatchObject({
      method: "officer",
      airtableRecordId: "recR1",
    });

    const out = await pullAttendance([], WORKSHOP_IDS, MEETING_IDS);

    expect(out.removed).toBe(0);
    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.method).toBe("officer");
  });

  it("leaves a plain officer row alone", async () => {
    await db.execute(sql`
      insert into platform.attendance ("meetingId", "userId", method, "recordedBy")
      values (${IDS.meetingB}::uuid, ${IDS.member}::uuid, 'officer', ${IDS.member}::uuid)`);

    const out = await pullAttendance([], WORKSHOP_IDS, MEETING_IDS);

    expect(out.removed).toBe(0);
    expect(await attendanceRows()).toHaveLength(1);
  });
});

describe("one attendance per member per meeting", () => {
  it("refuses a second response for two workshops of one meeting", async () => {
    // Both responses are legitimate, the member really did sit in both, but
    // the schema collapses them on purpose. A refusal is what tells the officer
    // that, rather than a silently discarded row.
    const out = await pullAttendance(
      [
        record("recR1", { myId: "attendee1", workshop: "recWorkshopA" }),
        record("recR2", { myId: "attendee1", workshop: "recWorkshopA2" }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.code).toBe("attendance_meeting_already_recorded");
    expect(out.refusals[0]!.airtableRecordId).toBe("recR2");

    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.workshopId).toBe(IDS.workshopA);
  });

  it("allows the same member at two different meetings", async () => {
    const out = await pullAttendance(
      [
        record("recR1", { myId: "attendee1", workshop: "recWorkshopA" }),
        record("recR2", { myId: "attendee1", workshop: "recWorkshopB" }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(2);
    expect(out.refusals).toEqual([]);
    expect(await attendanceRows()).toHaveLength(2);
  });
});

describe("what it refuses and what it skips", () => {
  it("refuses a MyID outside uga.edu and creates no account", async () => {
    const out = await pullAttendance(
      [
        record("recR1", {
          myId: "someone@gmail.com",
          workshop: "recWorkshopA",
        }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(0);
    expect(out.accountsCreated).toBe(0);
    expect(out.refusals[0]!.code).toBe("attendance_bad_myid");

    const [row] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from auth.users where email like '%gmail%'`,
    );
    expect(row!.count).toBe(0);
  });

  it("refuses a workshop that is not in the base", async () => {
    const out = await pullAttendance(
      [record("recR1", { myId: "attendee1", workshop: "recNotThere" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.refusals[0]!.code).toBe("attendance_unknown_workshop");
    expect(out.accountsCreated).toBe(0);
  });

  it("refuses a meeting that is not in the base", async () => {
    const out = await pullAttendance(
      [record("recR1", { myId: "attendee1", meeting: "recNotThere" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.refusals[0]!.code).toBe("attendance_unknown_meeting");
    expect(out.accountsCreated).toBe(0);
  });

  it("refuses two links that name different nights", async () => {
    // The composite foreign key on `(workshopId, meetingId)` would reject this
    // row anyway, as a failed INSERT in the middle of the pull. Refusing by
    // name is the same protection with an answer attached, and this is the
    // test that proves the rule fires BEFORE the constraint does.
    const out = await pullAttendance(
      [
        record("recR1", {
          myId: "attendee1",
          meeting: "recMeetingA",
          workshop: "recWorkshopB",
        }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(0);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.code).toBe("attendance_workshop_meeting_mismatch");
    expect(await attendanceRows()).toHaveLength(0);
  });

  it("skips an incomplete response without complaining", async () => {
    // A form response mid-submission will be complete on the next pass.
    // Writing a refusal into it would be noise an officer learns to ignore.
    //
    // "Incomplete" now means NEITHER link, not "no workshop": a response
    // naming only the meeting is complete, and the test below is the one that
    // says so.
    const out = await pullAttendance(
      [
        record("recR1", { myId: "attendee1" }),
        record("recR2", { workshop: "recWorkshopA" }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.skipped).toBe(2);
    expect(out.refusals).toEqual([]);
    expect(out.accountsCreated).toBe(0);
  });
});

describe("a night with no workshops", () => {
  /**
   * The reason the Meeting link exists.
   *
   * An Interest Meeting, a Social and a dedicated judging night all run no
   * workshops, so a form whose only link was the Workshop had nothing to pick.
   * Every response about one of those arrived with an empty cell and was
   * dropped by the completeness gate, silently, on every pass. The schema was
   * never the obstacle — `attendance."workshopId"` has been nullable all along.
   */
  it("imports a response naming only the meeting", async () => {
    const out = await pullAttendance(
      [record("recR1", { myId: "attendee1", meeting: "recMeetingA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    expect(out.refusals).toEqual([]);

    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.meetingId).toBe(IDS.meetingA);
    // Present at the meeting, in no workshop. No workshop star follows, which
    // is correct rather than a loss: there was no room to be in.
    expect(rows[0]!.workshopId).toBeNull();
  });

  it("still collapses two responses for one meeting into one row", async () => {
    // The meeting/member uniqueness does not care which link named the
    // meeting, and this is the case that would have found out if it did.
    const out = await pullAttendance(
      [
        record("recR1", { myId: "attendee1", meeting: "recMeetingA" }),
        record("recR2", { myId: "attendee1", workshop: "recWorkshopA" }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.code).toBe("attendance_meeting_already_recorded");
    expect(await attendanceRows()).toHaveLength(1);
  });

  it("takes the meeting from the form when both links agree", async () => {
    const out = await pullAttendance(
      [
        record("recR1", {
          myId: "attendee1",
          meeting: "recMeetingA",
          workshop: "recWorkshopA",
        }),
      ],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    const rows = await attendanceRows();
    expect(rows[0]!.meetingId).toBe(IDS.meetingA);
    expect(rows[0]!.workshopId).toBe(IDS.workshopA);
  });
});

describe("alongside a row an officer already made", () => {
  it("keeps the original method and fills in the workshop", async () => {
    // An officer added the member by hand, then the member filled in the form
    // too. Airtable owns the workshop dimension now, so it supplies that.
    // Rewriting `method` would make the row lie about how it was captured, and
    // 'officer' is the one method that also carries a `recordedBy`.
    await db.execute(sql`
      insert into platform.attendance ("meetingId", "userId", method, "recordedBy")
      values (${IDS.meetingA}::uuid, ${IDS.member}::uuid, 'officer', ${IDS.member}::uuid)`);

    const out = await pullAttendance(
      [record("recR1", { myId: "existing", workshop: "recWorkshopA" })],
      WORKSHOP_IDS,
      MEETING_IDS,
    );

    expect(out.imported).toBe(1);
    const rows = await attendanceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: "officer",
      workshopId: IDS.workshopA,
      airtableRecordId: "recR1",
    });
  });
});
