// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken } from "~/lib/attendanceInvite";
import { db } from "~/server/db";
import { getAttendanceCounts } from "./counts";
import { getMeetingDetail, getSyncTodos } from "./meetingDetail";
import {
  addOfficerAttendance,
  cancelAttendanceInvite,
  claimAttendanceInvite,
  createAttendanceInvite,
  eraseAttendanceInvitesForEmail,
  findAccountByEmail,
  removeAttendance,
  resendAttendanceInvite,
} from "./officerAttendance";

const IDS = {
  meeting: "c1000000-0000-4000-a000-000000000001",
  futureMeeting: "c1000000-0000-4000-a000-000000000002",
  cancelledMeeting: "c1000000-0000-4000-a000-000000000003",
  officer: "c1000000-0000-4000-a000-000000000004",
  member: "c1000000-0000-4000-a000-000000000005",
  invitee: "c1000000-0000-4000-a000-000000000006",
  stranger: "c1000000-0000-4000-a000-000000000007",
  role: "c1000000-0000-4000-a000-000000000008",
  question: "c1_test_question",
  doomedMeeting: "c1000000-0000-4000-a000-000000000009",
  tempOfficer: "c1000000-0000-4000-a000-00000000000a",
  syncer: "c1000000-0000-4000-a000-00000000000b",
};
const EMAIL = {
  officer: "c1-officer@uga.edu",
  member: "c1-member@uga.edu",
  invitee: "c1-invitee@uga.edu",
  stranger: "c1-stranger@uga.edu",
};
const USERS = [
  IDS.officer,
  IDS.member,
  IDS.invitee,
  IDS.stranger,
  IDS.tempOfficer,
  IDS.syncer,
];
const MEETINGS = [
  IDS.meeting,
  IDS.futureMeeting,
  IDS.cancelledMeeting,
  IDS.doomedMeeting,
];

const now = new Date();

async function cleanup() {
  await db.execute(sql`
    delete from platform."attendanceInvites"
    where "meetingId" in (${sql.join(
      MEETINGS.map((m) => sql`${m}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from platform."surveyAnswers" where "meetingId" = ${IDS.meeting}::uuid
  `);
  await db.execute(sql`
    delete from platform.reflections where "meetingId" = ${IDS.meeting}::uuid
  `);
  await db.execute(sql`
    delete from platform.attendance
    where "meetingId" in (${sql.join(
      MEETINGS.map((m) => sql`${m}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from platform."exportAudit"
    where filters ->> 'meetingId' in (${sql.join(
      MEETINGS.map((m) => sql`${m}`),
      sql`, `,
    )})
  `);
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."auditEvents"
      where ("targetType" = 'attendance'
          and metadata ->> 'meetingId' in (${sql.join(
            MEETINGS.map((m) => sql`${m}`),
            sql`, `,
          )}))
        or ("targetType" = 'export'
          and metadata -> 'filters' ->> 'meetingId' in (${sql.join(
            MEETINGS.map((m) => sql`${m}`),
            sql`, `,
          )}))
    `);
  });
  await db.execute(
    sql`delete from platform."userRoles" where "roleId" = ${IDS.role}::uuid`,
  );
  await db.execute(
    sql`delete from platform.roles where id = ${IDS.role}::uuid`,
  );
  await db.execute(sql`
    delete from platform."surveyQuestions" where id = ${IDS.question}
  `);
  await db.execute(sql`
    delete from platform.meetings
    where id in (${sql.join(
      MEETINGS.map((m) => sql`${m}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from platform.profile
    where "userId" in (${sql.join(
      USERS.map((u) => sql`${u}::uuid`),
      sql`, `,
    )})
  `);
  await db.execute(sql`
    delete from auth.users
    where id in (${sql.join(
      USERS.map((u) => sql`${u}::uuid`),
      sql`, `,
    )})
  `);
}

async function addUser(id: string, email: string, name: string) {
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${email})
  `);
  await db.execute(sql`
    insert into platform.profile ("userId", "preferredName")
    values (${id}::uuid, ${name})
  `);
}

beforeAll(async () => {
  await cleanup();
  await addUser(IDS.officer, EMAIL.officer, "C1 Officer");
  await addUser(IDS.member, EMAIL.member, "C1 Member");
  await addUser(IDS.stranger, EMAIL.stranger, "C1 Stranger");
  await addUser(IDS.syncer, "c1-syncer@uga.edu", "C1 Syncer");
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "nameOverride", "startsAt", "endsAt", "cancelledAt")
    values
      (${IDS.meeting}::uuid, 'c1-meeting', 'C1 Meeting',
       now() - interval '3 hours', now() - interval '1 hour', null),
      (${IDS.futureMeeting}::uuid, 'c1-future', 'C1 Future',
       now() + interval '1 day', now() + interval '2 days', null),
      (${IDS.cancelledMeeting}::uuid, 'c1-cancelled', 'C1 Cancelled',
       now() - interval '3 hours', now() - interval '1 hour', now()),
      (${IDS.doomedMeeting}::uuid, 'c1-doomed', 'C1 Doomed',
       now() - interval '3 hours', now() - interval '1 hour', null)
  `);
  await db.execute(sql`
    insert into platform.roles (id, title, rank, "isLeadership")
    values (${IDS.role}::uuid, 'C1 Test Officer', 9999.5, true)
  `);
  await db.execute(sql`
    insert into platform."userRoles" ("userId", "roleId")
    values (${IDS.officer}::uuid, ${IDS.role}::uuid)
  `);
});

afterAll(cleanup);

async function rows<T extends Record<string, unknown>>(
  query: ReturnType<typeof sql>,
) {
  return db.execute<T>(query);
}

describe("officer add (Q8)", () => {
  it("records method officer with an audit event naming the officer and the attendee", async () => {
    const result = await addOfficerAttendance(
      IDS.officer,
      IDS.meeting,
      IDS.member,
      now,
    );
    expect(result.status).toBe("recorded");

    const [row] = await rows<{ method: string }>(
      sql`select method from platform.attendance
          where "meetingId" = ${IDS.meeting}::uuid and "userId" = ${IDS.member}::uuid`,
    );
    expect(row?.method).toBe("officer");

    const [event] = await rows<{
      actorType: string;
      actorUserId: string;
      userId: string;
      method: string;
      targetId: string;
    }>(sql`
      select "actorType", "actorUserId", metadata ->> 'userId' as "userId",
        metadata ->> 'method' as method, "targetId"
      from platform."auditEvents"
      where action = 'attendance.recorded' and metadata ->> 'meetingId' = ${IDS.meeting}
        and metadata ->> 'userId' = ${IDS.member}
    `);
    expect(event).toMatchObject({
      actorType: "user",
      actorUserId: IDS.officer,
      userId: IDS.member,
      method: "officer",
    });
    if (result.status === "recorded") {
      expect(event?.targetId).toBe(result.attendanceId);
    }
  });

  it("is idempotent: a second add reports a duplicate and writes no second event", async () => {
    const again = await addOfficerAttendance(
      IDS.officer,
      IDS.meeting,
      IDS.member,
      now,
    );
    expect(again.status).toBe("duplicate");
    const [count] = await rows<{ n: number }>(sql`
      select count(*)::int as n from platform."auditEvents"
      where action = 'attendance.recorded' and metadata ->> 'userId' = ${IDS.member}
        and metadata ->> 'meetingId' = ${IDS.meeting}
    `);
    expect(count?.n).toBe(1);
  });

  it("refuses a meeting that has not started or was cancelled (Q52)", async () => {
    await expect(
      addOfficerAttendance(IDS.officer, IDS.futureMeeting, IDS.member, now),
    ).resolves.toEqual({ status: "invalid_meeting" });
    await expect(
      addOfficerAttendance(IDS.officer, IDS.cancelledMeeting, IDS.member, now),
    ).resolves.toEqual({ status: "invalid_meeting" });
  });

  it("finds an account by address and reports an unknown one as none", async () => {
    await expect(
      findAccountByEmail(EMAIL.member.toUpperCase()),
    ).resolves.toMatchObject({
      status: "account",
      userId: IDS.member,
      name: "C1 Member",
    });
    await expect(findAccountByEmail("c1-nobody@uga.edu")).resolves.toEqual({
      status: "none",
      email: "c1-nobody@uga.edu",
    });
  });

  it("counts officers separately from members (Q13)", async () => {
    await addOfficerAttendance(IDS.officer, IDS.meeting, IDS.officer, now);
    const counts = await getAttendanceCounts();
    expect(counts.get(IDS.meeting)).toEqual({ total: 2, officers: 1 });
    const detail = await getMeetingDetail(
      IDS.meeting,
      new Date(now.getTime() - 3 * 3600_000),
      now,
    );
    expect(detail.counts).toEqual({ total: 2, officers: 1 });
    const added = detail.attendees.find((a) => a.userId === IDS.member);
    expect(added?.addedBy?.name).toBe("C1 Officer");
  });
});

describe("invites (Q51)", () => {
  it("creates a pending invite storing only the token's hash, 14 days out", async () => {
    const invite = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      EMAIL.invitee,
      now,
    );
    expect(invite.status).toBe("invited");
    if (invite.status !== "invited") return;

    const [row] = await rows<{
      tokenHash: string;
      ugaEmail: string;
      createdBy: string;
      days: number;
      claimedAt: string | null;
    }>(sql`
      select "tokenHash", "ugaEmail", "createdBy", "claimedAt",
        round(extract(epoch from ("expiresAt" - "createdAt")) / 86400)::int as days
      from platform."attendanceInvites" where id = ${invite.inviteId}::uuid
    `);
    expect(row).toMatchObject({
      ugaEmail: EMAIL.invitee,
      createdBy: IDS.officer,
      days: 14,
      claimedAt: null,
    });
    expect(row?.tokenHash).toBe(await hashInviteToken(invite.token));
    expect(row?.tokenHash).not.toContain(invite.token);
  });

  it("does not invite an address that already has an account", async () => {
    await expect(
      createAttendanceInvite(IDS.officer, IDS.meeting, EMAIL.member, now),
    ).resolves.toEqual({ status: "has_account" });
  });

  it("renews rather than duplicating an unclaimed invite, and the old link dies", async () => {
    const first = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-twice@uga.edu",
      now,
    );
    const second = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-twice@uga.edu",
      now,
    );
    if (first.status !== "invited" || second.status !== "invited")
      throw new Error("expected invites");
    expect(second.inviteId).toBe(first.inviteId);
    await expect(
      claimAttendanceInvite(first.token, IDS.stranger, "c1-twice@uga.edu", now),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("refuses a claim from a different address and leaves the invite usable", async () => {
    const invite = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-mismatch@uga.edu",
      now,
    );
    if (invite.status !== "invited") throw new Error("expected invite");
    await expect(
      claimAttendanceInvite(invite.token, IDS.stranger, EMAIL.stranger, now),
    ).resolves.toEqual({ status: "address_mismatch" });
    await expect(
      claimAttendanceInvite(invite.token, IDS.stranger, null, now),
    ).resolves.toEqual({ status: "address_mismatch" });
    const [still] = await rows<{ claimedAt: string | null; n: number }>(sql`
      select i."claimedAt",
        (select count(*)::int from platform.attendance
          where "meetingId" = ${IDS.meeting}::uuid and "userId" = ${IDS.stranger}::uuid) as n
      from platform."attendanceInvites" i where i.id = ${invite.inviteId}::uuid
    `);
    expect(still).toEqual({ claimedAt: null, n: 0 });
  });

  it("claims once: records method officer with the inviting officer as actor, then refuses reuse", async () => {
    await addUser(IDS.invitee, EMAIL.invitee, "C1 Invitee");
    const [pending] = await rows<{ id: string }>(sql`
      select id from platform."attendanceInvites"
      where "ugaEmail" = ${EMAIL.invitee} and "meetingId" = ${IDS.meeting}::uuid
    `);
    // The first test stored only a hash, so mint a fresh link for the same row.
    const renewed = await resendAttendanceInvite(IDS.meeting, pending!.id, now);
    if (renewed.status !== "resent") throw new Error("expected resend");

    const claimed = await claimAttendanceInvite(
      renewed.token,
      IDS.invitee,
      EMAIL.invitee.toUpperCase(),
      now,
    );
    expect(claimed.status).toBe("recorded");

    const [event] = await rows<{ actorUserId: string; method: string }>(sql`
      select "actorUserId", metadata ->> 'method' as method
      from platform."auditEvents"
      where action = 'attendance.recorded' and metadata ->> 'userId' = ${IDS.invitee}
    `);
    expect(event).toEqual({ actorUserId: IDS.officer, method: "officer" });

    const [row] = await rows<{ method: string; claimedBy: string }>(sql`
      select a.method, i."claimedBy"
      from platform.attendance a, platform."attendanceInvites" i
      where a."userId" = ${IDS.invitee}::uuid and a."meetingId" = ${IDS.meeting}::uuid
        and i.id = ${pending!.id}::uuid
    `);
    expect(row).toEqual({ method: "officer", claimedBy: IDS.invitee });

    await expect(
      claimAttendanceInvite(renewed.token, IDS.invitee, EMAIL.invitee, now),
    ).resolves.toEqual({ status: "used" });
  });

  it("refuses an expired invite and an unknown token", async () => {
    const invite = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-expiry@uga.edu",
      now,
    );
    if (invite.status !== "invited") throw new Error("expected invite");
    const later = new Date(now.getTime() + 15 * 24 * 3600_000);
    await expect(
      claimAttendanceInvite(
        invite.token,
        IDS.stranger,
        "c1-expiry@uga.edu",
        later,
      ),
    ).resolves.toEqual({ status: "expired" });
    await expect(
      claimAttendanceInvite(
        generateInviteToken(),
        IDS.stranger,
        EMAIL.stranger,
        now,
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("cancels a pending invite so its link stops working", async () => {
    const invite = await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-cancel@uga.edu",
      now,
    );
    if (invite.status !== "invited") throw new Error("expected invite");
    await expect(
      cancelAttendanceInvite(IDS.meeting, invite.inviteId),
    ).resolves.toBe(true);
    await expect(
      cancelAttendanceInvite(IDS.meeting, invite.inviteId),
    ).resolves.toBe(false);
    await expect(
      claimAttendanceInvite(
        invite.token,
        IDS.stranger,
        "c1-cancel@uga.edu",
        now,
      ),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("lists pending invites for the meeting, not claimed ones", async () => {
    const detail = await getMeetingDetail(
      IDS.meeting,
      new Date(now.getTime() - 3 * 3600_000),
      now,
    );
    const addresses = detail.invites.map((i) => i.ugaEmail);
    expect(addresses).toContain("c1-twice@uga.edu");
    expect(addresses).not.toContain(EMAIL.invitee);
    expect(addresses).not.toContain("c1-cancel@uga.edu");
  });
});

describe("invite deletion behaviour (Q168)", () => {
  it("erases pending invites for an address when its member is deleted", async () => {
    await createAttendanceInvite(
      IDS.officer,
      IDS.meeting,
      "c1-leaving@uga.edu",
      now,
    );
    expect(await eraseAttendanceInvitesForEmail("C1-Leaving@uga.edu")).toBe(1);
    expect(await eraseAttendanceInvitesForEmail("c1-leaving@uga.edu")).toBe(0);
  });

  it("goes null on createdBy when the inviting officer is deleted", async () => {
    const tempOfficer = IDS.tempOfficer;
    await addUser(tempOfficer, "c1-temp-officer@uga.edu", "C1 Temp Officer");
    const invite = await createAttendanceInvite(
      tempOfficer,
      IDS.meeting,
      "c1-orphan@uga.edu",
      now,
    );
    if (invite.status !== "invited") throw new Error("expected invite");
    await db.execute(
      sql`delete from platform.profile where "userId" = ${tempOfficer}::uuid`,
    );
    await db.execute(
      sql`delete from auth.users where id = ${tempOfficer}::uuid`,
    );
    const [row] = await rows<{ createdBy: string | null }>(sql`
      select "createdBy" from platform."attendanceInvites" where id = ${invite.inviteId}::uuid
    `);
    expect(row).toEqual({ createdBy: null });
    // The invite still claims, with the system as the audit actor.
    const claimed = await claimAttendanceInvite(
      invite.token,
      IDS.stranger,
      "c1-orphan@uga.edu",
      now,
    );
    expect(claimed.status).toBe("recorded");
    const [event] = await rows<{
      actorType: string;
      actorUserId: string | null;
    }>(sql`
      select "actorType", "actorUserId" from platform."auditEvents"
      where action = 'attendance.recorded' and metadata ->> 'userId' = ${IDS.stranger}
    `);
    expect(event).toEqual({ actorType: "system", actorUserId: null });
  });

  it("erases a claimed invite with the invitee's account", async () => {
    const [before] = await rows<{ n: number }>(sql`
      select count(*)::int as n from platform."attendanceInvites" where "claimedBy" = ${IDS.invitee}::uuid
    `);
    expect(before?.n).toBe(1);
    await db.execute(
      sql`delete from platform.attendance where "userId" = ${IDS.invitee}::uuid`,
    );
    await db.execute(
      sql`delete from platform.profile where "userId" = ${IDS.invitee}::uuid`,
    );
    await db.execute(
      sql`delete from auth.users where id = ${IDS.invitee}::uuid`,
    );
    const [after] = await rows<{ n: number }>(sql`
      select count(*)::int as n from platform."attendanceInvites" where "ugaEmail" = ${EMAIL.invitee}
    `);
    expect(after?.n).toBe(0);
  });

  it("cascades with the meeting", async () => {
    const invite = await createAttendanceInvite(
      IDS.officer,
      IDS.doomedMeeting,
      "c1-doomed@uga.edu",
      now,
    );
    if (invite.status !== "invited") throw new Error("expected invite");
    await db.execute(
      sql`delete from platform.meetings where id = ${IDS.doomedMeeting}::uuid`,
    );
    const [row] = await rows<{ n: number }>(sql`
      select count(*)::int as n from platform."attendanceInvites" where id = ${invite.inviteId}::uuid
    `);
    expect(row?.n).toBe(0);
  });
});

describe("removal (Q9)", () => {
  it("hard-deletes the row, writes attendance.removed with what was deleted, and keeps reflections and survey answers", async () => {
    await db.execute(sql`
      insert into platform."surveyQuestions" (id, scope, type, definition)
      values (${IDS.question}, 'meeting', 'text',
        ${JSON.stringify({ id: IDS.question, scope: "meeting", type: "text", prompt: "Anything?" })}::jsonb)
    `);
    await db.execute(sql`
      insert into platform."surveyAnswers" ("userId", "questionId", "meetingId", answer)
      values (${IDS.member}::uuid, ${IDS.question}, ${IDS.meeting}::uuid, '{"text":"yes"}'::jsonb)
    `);
    await db.execute(sql`
      insert into platform.reflections ("userId", "meetingId", content)
      values (${IDS.member}::uuid, ${IDS.meeting}::uuid, 'kept')
    `);
    const [att] = await rows<{
      id: string;
      method: string;
      recordedAt: string;
    }>(sql`
      select id, method, "recordedAt" from platform.attendance
      where "userId" = ${IDS.member}::uuid and "meetingId" = ${IDS.meeting}::uuid
    `);

    const result = await removeAttendance(
      IDS.officer,
      IDS.meeting,
      att!.id,
      " signed in twice ",
      now,
    );
    expect(result).toEqual({ status: "removed" });

    const [gone] = await rows<{
      n: number;
      answers: number;
      reflections: number;
    }>(sql`
      select
        (select count(*)::int from platform.attendance where id = ${att!.id}::uuid) as n,
        (select count(*)::int from platform."surveyAnswers" where "meetingId" = ${IDS.meeting}::uuid) as answers,
        (select count(*)::int from platform.reflections where "meetingId" = ${IDS.meeting}::uuid) as reflections
    `);
    expect(gone).toEqual({ n: 0, answers: 1, reflections: 1 });

    const [event] = await rows<{
      actorUserId: string;
      metadata: Record<string, string>;
    }>(sql`
      select "actorUserId", metadata from platform."auditEvents"
      where action = 'attendance.removed' and "targetId" = ${att!.id}
    `);
    expect(event?.actorUserId).toBe(IDS.officer);
    expect(event?.metadata).toMatchObject({
      meetingId: IDS.meeting,
      userId: IDS.member,
      method: "officer",
      reason: "signed in twice",
    });
    expect(new Date(event!.metadata.recordedAt!).getTime()).toBe(
      new Date(att!.recordedAt).getTime(),
    );
  });

  it("reports a row that is already gone, and refuses an uneditable meeting", async () => {
    await expect(
      removeAttendance(
        IDS.officer,
        IDS.meeting,
        "c1000000-0000-4000-a000-0000000000ff",
        null,
        now,
      ),
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      removeAttendance(
        IDS.officer,
        IDS.cancelledMeeting,
        "c1000000-0000-4000-a000-0000000000ff",
        null,
        now,
      ),
    ).resolves.toEqual({ status: "invalid_meeting" });
  });
});

describe("external sync to-dos (Q12)", () => {
  it("lists adds and removals newer than the meeting's last attendance export, netted", async () => {
    const startsAt = new Date(now.getTime() - 3 * 3600_000);
    const [exp] = await rows<{ id: string; createdAt: string }>(sql`
      insert into platform."exportAudit" ("userId", kind, filters)
      values (${IDS.officer}::uuid, 'attendance', ${JSON.stringify({ meetingId: IDS.meeting })}::jsonb)
      returning id, "createdAt"
    `);
    expect(exp).toBeDefined();
    await expect(getSyncTodos(IDS.meeting, null)).resolves.toEqual([]);

    // Added after the export, and one added then removed: only the first is a to-do.
    await addOfficerAttendance(
      IDS.officer,
      IDS.meeting,
      IDS.member,
      new Date(),
    );
    const [added] = await rows<{ id: string }>(sql`
      select id from platform.attendance
      where "userId" = ${IDS.member}::uuid and "meetingId" = ${IDS.meeting}::uuid`);
    await addOfficerAttendance(
      IDS.officer,
      IDS.meeting,
      IDS.syncer,
      new Date(),
    );
    const [syncerRow] = await rows<{ id: string }>(sql`
      select id from platform.attendance
      where "userId" = ${IDS.syncer}::uuid and "meetingId" = ${IDS.meeting}::uuid`);
    await removeAttendance(
      IDS.officer,
      IDS.meeting,
      syncerRow!.id,
      null,
      new Date(),
    );

    const detail = await getMeetingDetail(IDS.meeting, startsAt, new Date());
    expect(detail.lastExportAt).not.toBeNull();
    const memberTodo = detail.todos.filter((t) => t.userId === IDS.member);
    expect(added).toBeDefined();
    expect(memberTodo).toHaveLength(1);
    expect(memberTodo[0]).toMatchObject({
      kind: "add",
      name: "C1 Member",
      email: EMAIL.member,
    });
    expect(detail.todos.some((t) => t.userId === IDS.syncer)).toBe(false);
  });

  it("ignores an export that named a different meeting", async () => {
    const startsAt = new Date(now.getTime() - 3 * 3600_000);
    const before = await getMeetingDetail(IDS.meeting, startsAt, now);
    await db.execute(sql`
      insert into platform."exportAudit" ("userId", kind, filters)
      values (${IDS.officer}::uuid, 'attendance', ${JSON.stringify({ meetingId: IDS.futureMeeting })}::jsonb)
    `);
    const after = await getMeetingDetail(IDS.meeting, startsAt, now);
    expect(after.lastExportAt).toEqual(before.lastExportAt);
    const named = await getMeetingDetail(
      IDS.futureMeeting,
      new Date(now.getTime() + 24 * 3600_000),
      now,
    );
    expect(named.lastExportAt).not.toBeNull();
  });
});
