// @vitest-environment node
import { projects as projectsSpec } from "@devdogsuga/airtable";
import type { AirtableRecord } from "@devdogsuga/airtable";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { pullProjects } from "./sync";

/**
 * The projects pull, against a real database.
 *
 * Worth a database test rather than a unit test for the same reason the
 * attendance one is: every property here belongs to the SCHEMA. The unique
 * slug, the `not null` display name, the check constraint behind the length
 * cap, and the soft archive that has to leave a workshop's foreign key intact
 * — none of those exist in a mock, and the constraint is the thing most likely
 * to turn a refused field into an aborted pass.
 *
 * This table was PUSHED until the flip, so there was no pull to test. The
 * slug rule below is the one that most needs proving: it is derived once and
 * never recomputed, because `stars.csv` is keyed on it across semesters.
 */

const F = projectsSpec.fields;

function record(
  id: string,
  fields: { name?: string; sortOrder?: number },
): AirtableRecord {
  return {
    id,
    fields: {
      ...(fields.name === undefined ? {} : { [F.displayName.id]: fields.name }),
      ...(fields.sortOrder === undefined
        ? {}
        : { [F.sortOrder.id]: fields.sortOrder }),
    },
  };
}

async function cleanup() {
  await db.execute(
    sql`delete from platform.workshops where "projectId" in (
          select id from platform.projects where "airtableRecordId" like 'recProjTest%')`,
  );
  await db.execute(
    sql`delete from platform.meetings where slug like 'proj-test-%'`,
  );
  await db.execute(
    sql`delete from platform.projects where "airtableRecordId" like 'recProjTest%'`,
  );
}

async function rows() {
  return db.execute<{
    id: string;
    slug: string;
    displayName: string;
    sortOrder: number;
    airtableRecordId: string;
    deletedAt: string | null;
  }>(sql`
    select id, slug, "displayName", "sortOrder", "airtableRecordId", "deletedAt"
    from platform.projects
    where "airtableRecordId" like 'recProjTest%'
    order by "airtableRecordId"`);
}

beforeEach(cleanup);
afterAll(cleanup);

describe("creating a project", () => {
  it("inserts it and derives the slug from the name", async () => {
    const out = await pullProjects([
      record("recProjTestA", {
        name: "Optimal Schedule Builder",
        sortOrder: 2,
      }),
    ]);

    expect(out.upserted).toBe(1);
    expect(out.refusals).toEqual([]);

    const [row] = await rows();
    expect(row!.displayName).toBe("Optimal Schedule Builder");
    expect(row!.slug).toBe("optimal-schedule-builder");
    expect(row!.sortOrder).toBe(2);
  });

  it("maps the Airtable record id, so a workshop can link to it", async () => {
    // The whole point of the flip. `pullWorkshops` resolves its Project link
    // through this map, and before the flip only a row the platform authored
    // could ever appear in it.
    const out = await pullProjects([
      record("recProjTestA", { name: "Platform" }),
    ]);

    const [row] = await rows();
    expect(out.idMap.get("recProjTestA")).toBe(row!.id);
  });

  it("defaults an unplaced project to the front rather than to null", async () => {
    // `sortOrder` is `not null` with a default, so an officer who has not
    // ordered the list yet must not produce a rejected insert.
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    expect((await rows())[0]!.sortOrder).toBe(0);
  });

  it("uniquifies a slug that collides with an existing project", async () => {
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    await pullProjects([
      record("recProjTestA", { name: "Platform" }),
      record("recProjTestB", { name: "Platform" }),
    ]);

    const all = await rows();
    expect(all.map((r) => r.slug)).toEqual(["platform", "platform-2"]);
  });
});

describe("editing a project", () => {
  it("follows a rename in the display name", async () => {
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    await pullProjects([record("recProjTestA", { name: "DevDogs Platform" })]);

    expect((await rows())[0]!.displayName).toBe("DevDogs Platform");
  });

  it("⚠️ does NOT recompute the slug on a rename", async () => {
    // The rule this file exists for. `stars.csv` is one row per (member,
    // workshop) carrying the project slug, exported across semesters, so
    // regenerating the slug when somebody fixes a capital letter would rewrite
    // an export that has already been downloaded. Identity is the Airtable
    // record id; the slug is a name assigned once.
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    await pullProjects([record("recProjTestA", { name: "DevDogs Platform" })]);

    const [row] = await rows();
    expect(row!.slug).toBe("platform");
  });

  it("clears an emptied sort order back to the default", async () => {
    await pullProjects([
      record("recProjTestA", { name: "Platform", sortOrder: 5 }),
    ]);
    await pullProjects([record("recProjTestA", { name: "Platform" })]);

    expect((await rows())[0]!.sortOrder).toBe(0);
  });

  it("takes a fractional order, which is what the column type is for", async () => {
    // `double precision` so a project can be slotted between two others
    // without renumbering the rest.
    await pullProjects([
      record("recProjTestA", { name: "Platform", sortOrder: 1.5 }),
    ]);
    expect((await rows())[0]!.sortOrder).toBe(1.5);
  });
});

describe("what it refuses and what it skips", () => {
  it("says a nameless row is not on the site yet, rather than nothing", async () => {
    // A state, not a complaint: officers fill fields one at a time. But it has
    // to SAY so, because silence made a half-filled row look identical to one
    // the sync had never reached.
    const out = await pullProjects([record("recProjTestA", {})]);

    expect(out.upserted).toBe(0);
    expect(out.skipped).toBe(1);
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.code).toBe("project_incomplete");
    expect(await rows()).toHaveLength(0);
  });

  it("refuses a name past the cap without aborting the pass", async () => {
    // `projects_displayName_length` is a check constraint, so writing this
    // would be a violation inside the pull rather than a refused field — and
    // that aborts every table after this one.
    const out = await pullProjects([
      record("recProjTestA", { name: "P".repeat(81) }),
    ]);

    // Exactly one message. The parser returns null for "empty" and for "too
    // long" alike, and stacking `project_incomplete` on top of this would put
    // two explanations of one problem in a single cell.
    expect(out.refusals).toHaveLength(1);
    expect(out.refusals[0]!.code).toBe("project_name_too_long");
    expect(await rows()).toHaveLength(0);
  });

  it("keeps the published name when a replacement is too long", async () => {
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    const out = await pullProjects([
      record("recProjTestA", { name: "P".repeat(81) }),
    ]);

    expect(out.refusals.map((r) => r.code)).toContain("project_name_too_long");
    // Refused rather than truncated, and the old value stays up: publishing
    // half a name is worse than publishing the previous one.
    expect((await rows())[0]!.displayName).toBe("Platform");
  });
});

describe("archival", () => {
  it("archives a project whose record was deleted, keeping the row", async () => {
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    const out = await pullProjects([]);

    expect(out.archived).toBe(1);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.deletedAt).not.toBeNull();
  });

  it("leaves a workshop pointing at an archived project intact", async () => {
    // ⚠️ The reason this is an archive and not a delete. `memberStars` groups
    // on the workshop's `projectId`, so a hard delete would drop the project
    // off stars members had already earned — and `workshops_projectId_fkey` is
    // `on delete restrict`, so it would abort the pass instead.
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    const [project] = await rows();

    await db.execute(sql`
      insert into platform.meetings (slug, "startsAt", "endsAt")
      values ('proj-test-a', now(), now() + interval '1 hour')`);
    await db.execute(sql`
      insert into platform.workshops ("meetingId", "projectId")
      select m.id, ${project!.id}::uuid
      from platform.meetings m where m.slug = 'proj-test-a'`);

    await pullProjects([]);

    const [linked] = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from platform.workshops
      where "projectId" = ${project!.id}::uuid`);
    expect(linked!.count).toBe(1);
  });

  it("re-adopts a restored record instead of duplicating the slug", async () => {
    // Restoring from Airtable's trash returns the same record id, and the
    // existing-rows read is deliberately unfiltered so this finds the archived
    // row. A filtered read would try to insert a second 'platform' and hit the
    // unique constraint.
    await pullProjects([record("recProjTestA", { name: "Platform" })]);
    await pullProjects([]);
    const out = await pullProjects([
      record("recProjTestA", { name: "Platform" }),
    ]);

    expect(out.upserted).toBe(1);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.slug).toBe("platform");
    // And it is actually BACK. Re-adopting the row without clearing
    // `deletedAt` would leave it archived and invisible everywhere, which
    // makes the archive a one-way door rather than a reversible one.
    expect(all[0]!.deletedAt).toBeNull();
  });
});
