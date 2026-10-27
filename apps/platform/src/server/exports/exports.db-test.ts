// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { exportDeps } from "./deps";
import { prepareExport } from "./run";

/**
 * The console exports against a real database: the CLI's queries run through
 * the platform's client, the audit row lands before the read and keeps its
 * count, and the files carry the stored values.
 *
 * No table is added for exports. `exportAudit.userId` already declares what
 * account deletion does with it (`ON DELETE SET NULL`: the audit row stays,
 * unattributed), and this checks it still does.
 */

const IDS = {
  officer: "c4000000-0000-4000-a000-000000000001",
  ada: "c4000000-0000-4000-a000-000000000002",
  grace: "c4000000-0000-4000-a000-000000000003",
  meeting: "c4000000-0000-4000-a000-0000000000a1",
};
const USERS = [IDS.officer, IDS.ada, IDS.grace];
const uuids = (ids: string[]) =>
  sql.join(
    ids.map((i) => sql`${i}::uuid`),
    sql`, `,
  );

async function cleanup() {
  await db.execute(
    sql`delete from platform."exportAudit" where "userId" in (${uuids(USERS)}) or filters ->> 'meetingId' = ${IDS.meeting}`,
  );
  await db.execute(
    sql`delete from platform.attendance where "meetingId" = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform.meetings where id = ${IDS.meeting}::uuid`,
  );
  await db.execute(
    sql`delete from platform.profile where "userId" in (${uuids(USERS)})`,
  );
  await db.execute(sql`delete from auth.users where id in (${uuids(USERS)})`);
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
  await addUser(IDS.officer, "c4-officer@uga.edu", "C4 Officer");
  await addUser(IDS.ada, "c4-ada@uga.edu", "Ada Lovelace");
  await addUser(IDS.grace, "c4-grace@gmail.com", "Grace Hopper");
  await db.execute(sql`
    insert into platform.meetings (id, slug, "nameOverride", "startsAt", "endsAt")
    values (${IDS.meeting}::uuid, 'c4-meeting', 'C4 Meeting',
            now() - interval '3 hours', now() - interval '1 hour')
  `);
  await db.execute(sql`
    insert into platform.attendance ("meetingId", "userId", method, "recordedAt")
    values (${IDS.meeting}::uuid, ${IDS.ada}::uuid, 'import', now() - interval '2 hours'),
           (${IDS.meeting}::uuid, ${IDS.grace}::uuid, 'import', now() - interval '2 hours')
  `);
});

afterAll(cleanup);

describe("console exports", () => {
  it("exports one meeting's attendance, audits it and keeps the count", async () => {
    const res = await prepareExport(
      {
        kind: "attendance",
        formats: ["platform", "involvement"],
        from: null,
        to: null,
        meetingId: IDS.meeting,
        zip: false,
      },
      IDS.officer,
      exportDeps,
    );
    if (res.kind !== "ready") throw new Error(JSON.stringify(res));
    expect(res.files.map((f) => [f.name, f.count])).toEqual([
      ["attendance-c4-meeting.csv", 2],
      ["attendance-c4-meeting-involvement.txt", 1],
    ]);
    expect(res.files[0]!.text).toContain("Ada Lovelace");
    expect(res.leftOut.map((l) => l.name)).toEqual(["Grace Hopper"]);

    const audits = await db.execute<{
      kind: string;
      rowCount: number | null;
      format: string | null;
    }>(sql`
      select kind, "rowCount", filters ->> 'format' as format
      from platform."exportAudit"
      where "userId" = ${IDS.officer}::uuid order by "createdAt", format nulls first
    `);
    expect(audits.map((a) => [a.kind, a.rowCount, a.format])).toEqual([
      ["attendance", 2, null],
      ["attendance", 1, "involvement"],
    ]);
  });

  it("reads the same rows the CLI's query reads, within a range", async () => {
    const rows = await exportDeps.rows("attendance", {
      meetingId: IDS.meeting,
    });
    expect(rows.map((r) => r.preferred_name).sort()).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
    ]);
    const none = await exportDeps.rows("attendance", {
      meetingId: IDS.meeting,
      to: new Date(Date.now() - 365 * 86_400_000),
    });
    expect(none).toEqual([]);
  });

  it("finds a meeting's slug and nothing for a stranger", async () => {
    expect(await exportDeps.meetingSlug(IDS.meeting)).toBe("c4-meeting");
    expect(
      await exportDeps.meetingSlug("c4000000-0000-4000-a000-0000000000ff"),
    ).toBeNull();
  });

  it("keeps the audit row, unattributed, when the officer's account is deleted", async () => {
    const id = await exportDeps.audit(IDS.officer, "attendance", {});
    await db.execute(
      sql`delete from platform.attendance where "meetingId" = ${IDS.meeting}::uuid`,
    );
    await db.execute(
      sql`delete from platform.profile where "userId" = ${IDS.officer}::uuid`,
    );
    await db.execute(
      sql`delete from auth.users where id = ${IDS.officer}::uuid`,
    );
    const [row] = await db.execute<{ userId: string | null }>(
      sql`select "userId" from platform."exportAudit" where id = ${id}::uuid`,
    );
    expect(row?.userId).toBeNull();
  });
});
