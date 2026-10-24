// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import {
  deleteMembers,
  insertMember,
} from "~/server/loaders/publicProfileFixtures";
import {
  EDITS_PER_OFFICER_MAX,
  listEdits,
  resetAllEdits,
  resetEdit,
  saveEdit,
} from "./editsStore";
import { officerIdentity } from "./proposals";

/**
 * An officer's saved config edits against a real database (C2): one row per
 * item and officer, replaced on save, private to the officer, reset one by one
 * or all at once, bounded, and deleted with the account (Q168). Fixture ids are
 * all `c2...` and swept before and after each test.
 */

const id = (n: number) =>
  `c2000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const ONE = id(1);
const TWO = id(2);
const ALL = [ONE, TWO] as const;

async function cleanup() {
  await db.execute(
    sql`delete from platform."configEdits" where "userId" in (${ONE}::uuid, ${TWO}::uuid)`,
  );
  await deleteMembers(ALL);
}

beforeAll(cleanup);
afterAll(cleanup);

beforeEach(async () => {
  await cleanup();
  await insertMember({
    id: ONE,
    handle: "c2-one",
    preferredName: "Test Officer",
    github: null,
  });
  await insertMember({ id: TWO, handle: "c2-two" });
});

const room = (value: string) => ({
  collection: "meeting" as const,
  key: "2026-09-14",
  isNew: false,
  fields: { room: value },
});

describe("saved edits", () => {
  it("keeps one row per officer and item, replaced on save", async () => {
    expect(await saveEdit(ONE, room("200"))).toBe("saved");
    expect(await saveEdit(ONE, room("300"))).toBe("saved");
    expect(await listEdits(ONE)).toEqual([room("300")]);
    const rows = await db.execute(
      sql`select 1 from platform."configEdits" where "userId" = ${ONE}::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it("keeps officers' edits apart", async () => {
    await saveEdit(ONE, room("200"));
    await saveEdit(TWO, room("900"));
    expect(await listEdits(ONE)).toEqual([room("200")]);
    expect(await listEdits(TWO)).toEqual([room("900")]);
    await resetEdit(ONE, "meeting", "2026-09-14");
    expect(await listEdits(ONE)).toEqual([]);
    expect(await listEdits(TWO)).toEqual([room("900")]);
  });

  it("clears an existing item's row when no fields are left", async () => {
    await saveEdit(ONE, room("200"));
    expect(await saveEdit(ONE, { ...room("x"), fields: {} })).toBe("cleared");
    expect(await listEdits(ONE)).toEqual([]);
  });

  it("keeps a new item even though every field is its own", async () => {
    const created = {
      collection: "workshop" as const,
      key: "rust",
      isNew: true,
      fields: { title: "Rust", elHours: 1, description: null, project: null },
    };
    await saveEdit(ONE, created);
    expect(await listEdits(ONE)).toEqual([created]);
  });

  it("resets everything at once, only for the caller", async () => {
    await saveEdit(ONE, room("1"));
    await saveEdit(ONE, { ...room("2"), key: "2026-09-16" });
    await saveEdit(TWO, room("3"));
    expect(await resetAllEdits(ONE)).toBe(2);
    expect(await listEdits(ONE)).toEqual([]);
    expect(await listEdits(TWO)).toHaveLength(1);
  });

  it("stops at the per-officer cap but still lets an existing item change", async () => {
    await db.execute(sql`
      insert into platform."configEdits" ("userId", collection, "itemKey", fields)
      select ${ONE}::uuid, 'meeting', 'cap-' || g, '{"room":"1"}'::jsonb
      from generate_series(1, ${EDITS_PER_OFFICER_MAX}) g
    `);
    expect(await saveEdit(ONE, room("new item"))).toBe("too_many");
    expect(await saveEdit(ONE, { ...room("again"), key: "cap-1" })).toBe(
      "saved",
    );
  });

  it("refuses a bad collection and a non-object at the database", async () => {
    await expect(
      db.execute(sql`
        insert into platform."configEdits" ("userId", collection, "itemKey")
        values (${ONE}::uuid, 'roles', 'x')
      `),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`
        insert into platform."configEdits" ("userId", collection, "itemKey", fields)
        values (${ONE}::uuid, 'meeting', 'x', '[]'::jsonb)
      `),
    ).rejects.toThrow();
  });
});

describe("account deletion (Q168)", () => {
  it("deletes the officer's saved edits with the account and leaves everyone else's", async () => {
    await saveEdit(ONE, room("200"));
    await saveEdit(TWO, room("900"));
    await deleteMembers([ONE]);
    const mine = await db.execute(
      sql`select 1 from platform."configEdits" where "userId" = ${ONE}::uuid`,
    );
    expect(mine).toHaveLength(0);
    expect(await listEdits(TWO)).toEqual([room("900")]);
  });

  it("keeps the audit row of a pull request after the officer's account goes", async () => {
    await db.execute(sql`
      insert into platform."auditEvents"
        ("actorType", "actorUserId", source, action, "targetType", "targetId", metadata)
      values ('user', ${ONE}::uuid, 'platform', 'config.pr_opened', 'configProposal',
              'DevDogsUGA/DevDogsUGA#c2test', '{}'::jsonb)
    `);
    await deleteMembers([ONE]);
    const rows = await db.execute(
      sql`select 1 from platform."auditEvents" where "targetId" = 'DevDogsUGA/DevDogsUGA#c2test'`,
    );
    expect(rows).toHaveLength(1);
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(
        sql`delete from platform."auditEvents" where "targetId" = 'DevDogsUGA/DevDogsUGA#c2test'`,
      );
    });
  });
});

describe("officerIdentity", () => {
  it("uses the preferred name and, without GitHub, the club's no-reply address", async () => {
    expect(await officerIdentity(ONE)).toEqual({
      name: "Test Officer",
      email: "noreply@devdogsuga.org",
    });
  });
});
