// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { importDeps, writeAttendance, writeRoster } from "./deps";
import type { AuditDraft } from "./types";

/**
 * The console import writes against a real database: the check-ins or
 * profiles and the audit row land in one transaction, replacement keeps what
 * members did themselves, and the account finder reads what the CLI's does.
 *
 * No table is added for the import (its record is an `auditEvents` row), so
 * there is nothing new for account deletion to declare; the officer is the
 * audit row's actor, as for every other console action.
 */

const IDS = {
  officer: "c3000000-0000-4000-a000-000000000001",
  ada: "c3000000-0000-4000-a000-000000000002",
  alan: "c3000000-0000-4000-a000-000000000003",
  grace: "c3000000-0000-4000-a000-000000000004",
  newcomer: "c3000000-0000-4000-a000-000000000005",
  stale: "c3000000-0000-4000-a000-000000000006",
  meeting: "c3000000-0000-4000-a000-0000000000a1",
  cancelled: "c3000000-0000-4000-a000-0000000000a2",
};
const USERS = [
  IDS.officer,
  IDS.ada,
  IDS.alan,
  IDS.grace,
  IDS.newcomer,
  IDS.stale,
];
const MEETINGS = [IDS.meeting, IDS.cancelled];
const FILE = "c3-db-test.csv";
const uuids = (ids: string[]) =>
  sql.join(
    ids.map((i) => sql`${i}::uuid`),
    sql`, `,
  );

async function cleanup() {
  await db.execute(
    sql`delete from platform.attendance where "meetingId" in (${uuids(MEETINGS)})`,
  );
  await db.transaction(async (tx) => {
    // auditEvents is append-only; the replica role skips its guard trigger.
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(
      sql`delete from platform."auditEvents" where metadata ->> 'fileName' = ${FILE}`,
    );
  });
  await db.execute(
    sql`delete from platform.meetings where id in (${uuids(MEETINGS)})`,
  );
  await db.execute(
    sql`delete from platform.profile where "userId" in (${uuids(USERS)})`,
  );
  await db.execute(sql`delete from auth.users where id in (${uuids(USERS)})`);
}

async function addUser(id: string, email: string, name: string | null) {
  await db.execute(sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${email})
  `);
  if (name) {
    await db.execute(sql`
      insert into platform.profile ("userId", "preferredName")
      values (${id}::uuid, ${name})
    `);
  }
}

function audit(action: AuditDraft["action"], extra = {}): AuditDraft {
  return {
    actorUserId: IDS.officer,
    action,
    targetId: crypto.randomUUID(),
    metadata: { fileName: FILE, mode: "add", ...extra },
  };
}

async function checkIns() {
  return db.execute<{ userId: string; method: string }>(sql`
    select "userId"::text as "userId", method::text as method
    from platform.attendance where "meetingId" = ${IDS.meeting}::uuid
    order by "userId"
  `);
}

beforeAll(async () => {
  await cleanup();
  await addUser(IDS.officer, "c3-officer@uga.edu", "C3 Officer");
  await addUser(IDS.ada, "c3-ada@uga.edu", "Ada Lovelace");
  await addUser(IDS.alan, "c3-alan@uga.edu", "Alan Goes By Al");
  await addUser(IDS.grace, "c3-grace@uga.edu", "Grace Hopper");
  await addUser(IDS.newcomer, "c3-newcomer@uga.edu", null);
  await addUser(IDS.stale, "c3-stale@uga.edu", "Stale Member");
  await db.execute(sql`
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt", "cancelledAt")
    values
      (${IDS.meeting}::uuid, 'c3-meeting', 'C3 Meeting',
       now() - interval '3 hours', now() - interval '1 hour', null),
      (${IDS.cancelled}::uuid, 'c3-cancelled', 'C3 Cancelled',
       now() - interval '3 hours', now() - interval '1 hour', now())
  `);
  await db.execute(sql`
    update platform.profile
    set "involvementFirstName" = 'Stale', "involvementLastName" = 'Member',
        "involvementImportedAt" = now()
    where "userId" = ${IDS.stale}::uuid
  `);
});

afterAll(cleanup);

describe("writeAttendance", () => {
  const startsAt = new Date(Date.now() - 3 * 3600_000);

  it("records imported check-ins, creates missing profiles and audits, in one transaction", async () => {
    const draft = audit("import.attendance", { recorded: 0 });
    const result = await writeAttendance(
      {
        meetingId: IDS.meeting,
        recordedAt: startsAt,
        profiles: [
          {
            userId: IDS.newcomer,
            email: "c3-newcomer@uga.edu",
            name: "New Comer",
          },
        ],
        userIds: [IDS.ada, IDS.alan, IDS.newcomer],
        replace: false,
        now: new Date(),
      },
      draft,
    );
    expect(result).toEqual({ status: "written", recorded: 3, removed: 0 });
    expect((await checkIns()).map((r) => r.method)).toEqual([
      "import",
      "import",
      "import",
    ]);

    const [profile] = await db.execute<{ name: string; uga: string }>(sql`
      select "preferredName" as name, "ugaEmail" as uga
      from platform.profile where "userId" = ${IDS.newcomer}::uuid
    `);
    expect(profile).toEqual({ name: "New Comer", uga: "c3-newcomer@uga.edu" });

    const [event] = await db.execute<{
      actor: string;
      metadata: Record<string, unknown>;
    }>(sql`
      select "actorUserId"::text as actor, metadata
      from platform."auditEvents"
      where action = 'import.attendance' and "targetId" = ${draft.targetId}
    `);
    expect(event?.actor).toBe(IDS.officer);
    expect(event?.metadata).toMatchObject({
      recorded: 3,
      removed: 0,
      fileName: FILE,
    });
  });

  it("is idempotent: a second run records nothing new", async () => {
    const result = await writeAttendance(
      {
        meetingId: IDS.meeting,
        recordedAt: startsAt,
        profiles: [],
        userIds: [IDS.ada, IDS.alan],
        replace: false,
        now: new Date(),
      },
      audit("import.attendance"),
    );
    expect(result).toEqual({ status: "written", recorded: 0, removed: 0 });
  });

  it("replace removes earlier imports the file dropped and never a member's own check-in", async () => {
    await db.execute(sql`
      insert into platform.attendance ("meetingId", "userId", method)
      values (${IDS.meeting}::uuid, ${IDS.grace}::uuid, 'qr')
    `);
    const result = await writeAttendance(
      {
        meetingId: IDS.meeting,
        recordedAt: startsAt,
        profiles: [],
        // Alan and the newcomer are no longer in the file; Grace is, but
        // checked in herself.
        userIds: [IDS.ada, IDS.grace],
        replace: true,
        now: new Date(),
      },
      audit("import.attendance", { mode: "replace" }),
    );
    expect(result).toEqual({ status: "written", recorded: 0, removed: 2 });
    const left = await checkIns();
    expect(left.map((r) => [r.userId, r.method]).sort()).toEqual(
      [
        [IDS.ada, "import"],
        [IDS.grace, "qr"],
      ].sort(),
    );
  });

  it("writes nothing, not even the audit row, for a cancelled meeting", async () => {
    const draft = audit("import.attendance");
    const result = await writeAttendance(
      {
        meetingId: IDS.cancelled,
        recordedAt: startsAt,
        profiles: [],
        userIds: [IDS.ada],
        replace: false,
        now: new Date(),
      },
      draft,
    );
    expect(result).toEqual({ status: "invalid_meeting" });
    const [n] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.attendance where "meetingId" = ${IDS.cancelled}::uuid
    `);
    expect(n?.n).toBe(0);
    const [e] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform."auditEvents" where "targetId" = ${draft.targetId}
    `);
    expect(e?.n).toBe(0);
  });

  it("rolls the check-ins back when the audit row cannot be written", async () => {
    await expect(
      writeAttendance(
        {
          meetingId: IDS.meeting,
          recordedAt: startsAt,
          profiles: [],
          userIds: [IDS.stale],
          replace: false,
          now: new Date(),
        },
        // Over auditEvents_metadata_bounded (16 KB).
        audit("import.attendance", { padding: "x".repeat(20_000) }),
      ),
    ).rejects.toThrow();
    expect((await checkIns()).some((r) => r.userId === IDS.stale)).toBe(false);
  });
});

describe("writeRoster", () => {
  it("verifies members, keeps existing preferred names and writes durable identity", async () => {
    const draft = audit("import.roster");
    const result = await writeRoster(
      {
        snapshot: false,
        members: [
          {
            userId: IDS.alan,
            email: "c3-alan@uga.edu",
            firstName: "Alan",
            lastName: "Turing",
          },
          {
            userId: IDS.newcomer,
            email: "c3-newcomer@uga.edu",
            firstName: "New",
            lastName: "Comer",
          },
        ],
      },
      draft,
    );
    expect(result).toEqual({ written: 2, cleared: 0 });

    const profiles = await db.execute<{
      id: string;
      preferred: string;
      first: string | null;
      legal: string | null;
      uga: string | null;
    }>(sql`
      select "userId"::text as id, "preferredName" as preferred,
             "involvementFirstName" as first, "legalLastName" as legal, "ugaEmail" as uga
      from platform.profile
      where "userId" in (${uuids([IDS.alan, IDS.newcomer, IDS.stale])})
      order by "userId"
    `);
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    // The existing profile keeps the name the member goes by.
    expect(byId[IDS.alan]).toMatchObject({
      preferred: "Alan Goes By Al",
      first: "Alan",
      legal: "Turing",
      uga: "c3-alan@uga.edu",
    });
    // Add-only leaves the member who is not in the file verified.
    expect(byId[IDS.stale]?.first).toBe("Stale");

    const [event] = await db.execute<{ metadata: Record<string, unknown> }>(sql`
      select metadata from platform."auditEvents"
      where action = 'import.roster' and "targetId" = ${draft.targetId}
    `);
    expect(event?.metadata).toMatchObject({ verified: 2, cleared: 0 });
  });

  it("snapshot clears verification for members absent from the file but keeps accounts and identity", async () => {
    const result = await writeRoster(
      {
        snapshot: true,
        members: [
          {
            userId: IDS.alan,
            email: "c3-alan@uga.edu",
            firstName: "Alan",
            lastName: "Turing",
          },
        ],
      },
      audit("import.roster", { mode: "replace" }),
    );
    expect(result.written).toBe(1);
    expect(result.cleared).toBeGreaterThanOrEqual(1);

    const [stale] = await db.execute<{
      first: string | null;
      at: Date | null;
      preferred: string;
    }>(sql`
      select "involvementFirstName" as first, "involvementImportedAt" as at,
             "preferredName" as preferred
      from platform.profile where "userId" = ${IDS.stale}::uuid
    `);
    expect(stale).toEqual({ first: null, at: null, preferred: "Stale Member" });
    const [account] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from auth.users where id = ${IDS.stale}::uuid
    `);
    expect(account?.n).toBe(1);
  });
});

describe("importDeps.accounts", () => {
  it("reads accounts the way the planners expect", async () => {
    const accounts = await importDeps.accounts();
    const mine = accounts.filter((a) => USERS.includes(a.userId));
    expect(mine).toHaveLength(USERS.length);
    const ada = mine.find((a) => a.userId === IDS.ada);
    expect(ada).toMatchObject({
      authEmail: "c3-ada@uga.edu",
      hasProfile: true,
      preferredName: "Ada Lovelace",
    });
    // A recovered account from an interrupted run has no profile yet.
    await db.execute(
      sql`delete from platform.profile where "userId" = ${IDS.grace}::uuid`,
    );
    const again = (await importDeps.accounts()).find(
      (a) => a.userId === IDS.grace,
    );
    expect(again?.hasProfile).toBe(false);
  });
});
