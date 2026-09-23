// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ClubConfig, Meeting } from "@devdogsuga/club-config";
import { db } from "~/server/db";
import { reconcileFromConfig } from "./reconcile";

/**
 * The reconcile against a real database: upsert, archive, un-archive and
 * idempotency, the four properties its header promises.
 *
 * All fixtures share the `reconcile-test-` id/slug prefix so `cleanup` can
 * find everything this file ever wrote without tracking individual ids
 * across tests -- the same trick as the meetings.db-test.ts fixtures beside
 * it, generalized to a whole describe block that mutates the config between
 * tests.
 */

async function cleanup() {
  await db.execute(
    sql`delete from platform.meetings where "configId" like 'reconcile-test-%'`,
  );
}

function meeting(overrides: Partial<Meeting> & { id: string }): Meeting {
  return {
    title: "Reconcile Test",
    summary: null,
    kind: null,
    building: "DLW",
    location: "124",
    startsAt: "2027-01-01T18:00:00.000Z",
    endsAt: "2027-01-01T20:00:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    countsForCredit: true,
    surveyUrl: null,
    agenda: [],
    ...overrides,
  };
}

async function liveMeetingByConfigId(configId: string) {
  const rows = await db.execute<{
    id: string;
    deletedAt: Date | null;
    nameOverride: string | null;
  }>(sql`
    select id, "deletedAt", "nameOverride" from platform.meetings
    where "configId" = ${configId}
  `);
  return rows[0] ?? null;
}

async function liveWorkshopByConfigId(configId: string) {
  const rows = await db.execute<{
    id: string;
    deletedAt: Date | null;
    title: string | null;
    project: string | null;
  }>(sql`
    select id, "deletedAt", title, project from platform.workshops
    where "configId" = ${configId}
  `);
  return rows[0] ?? null;
}

afterAll(cleanup);

describe("reconcileFromConfig", () => {
  beforeEach(cleanup);

  it("inserts a new meeting and its agenda", async () => {
    const config: ClubConfig = {
      meetings: [
        meeting({
          id: "reconcile-test-insert",
          agenda: [
            {
              id: "reconcile-test-insert-workshop",
              title: "Supabase",
              description: null,
              project: "DogDays",
            },
          ],
        }),
      ],
    };

    const result = await reconcileFromConfig(db, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings).toEqual({
      upserted: 1,
      archived: 0,
      unarchived: 0,
    });
    expect(result.counts.workshops).toEqual({
      upserted: 1,
      archived: 0,
      unarchived: 0,
    });

    const row = await liveMeetingByConfigId("reconcile-test-insert");
    expect(row).not.toBeNull();
    expect(row!.deletedAt).toBeNull();

    const workshopRow = await liveWorkshopByConfigId(
      "reconcile-test-insert-workshop",
    );
    expect(workshopRow).not.toBeNull();
    expect(workshopRow!.project).toBe("DogDays");
  });

  it("updates an existing meeting by configId rather than inserting a duplicate", async () => {
    const configId = "reconcile-test-update";
    await reconcileFromConfig(db, {
      meetings: [meeting({ id: configId, title: "Original Title" })],
    });
    const before = await liveMeetingByConfigId(configId);

    const result = await reconcileFromConfig(db, {
      meetings: [meeting({ id: configId, title: "Renamed Title" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.upserted).toBe(1);

    const after = await liveMeetingByConfigId(configId);
    expect(after!.id).toBe(before!.id);
    expect(after!.nameOverride).toBe("Renamed Title");

    const count = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.meetings where "configId" = ${configId}
    `);
    expect(count[0]!.n).toBe(1);
  });

  it("archives a meeting and its workshops once they drop out of the config", async () => {
    const configId = "reconcile-test-archive";
    const workshopConfigId = "reconcile-test-archive-workshop";
    await reconcileFromConfig(db, {
      meetings: [
        meeting({
          id: configId,
          agenda: [
            {
              id: workshopConfigId,
              title: "Session",
              description: null,
              project: null,
            },
          ],
        }),
        // A second, unrelated meeting so the config is never empty and the
        // zero-meetings guard does not intercept this test.
        meeting({ id: "reconcile-test-archive-keepalive" }),
      ],
    });

    const result = await reconcileFromConfig(db, {
      meetings: [meeting({ id: "reconcile-test-archive-keepalive" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.archived).toBe(1);
    expect(result.counts.workshops.archived).toBe(1);

    const row = await liveMeetingByConfigId(configId);
    expect(row!.deletedAt).not.toBeNull();
    const workshopRow = await liveWorkshopByConfigId(workshopConfigId);
    expect(workshopRow!.deletedAt).not.toBeNull();
  });

  it("un-archives a meeting that reappears in the config", async () => {
    const configId = "reconcile-test-unarchive";
    const keepAlive = meeting({ id: "reconcile-test-unarchive-keepalive" });
    await reconcileFromConfig(db, {
      meetings: [meeting({ id: configId }), keepAlive],
    });
    await reconcileFromConfig(db, { meetings: [keepAlive] });
    const archived = await liveMeetingByConfigId(configId);
    expect(archived!.deletedAt).not.toBeNull();

    const result = await reconcileFromConfig(db, {
      meetings: [meeting({ id: configId }), keepAlive],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.unarchived).toBe(1);

    const restored = await liveMeetingByConfigId(configId);
    expect(restored!.deletedAt).toBeNull();
    // Same row, not a new one under the same configId -- the whole point of
    // keying identity on configId rather than re-inserting.
    expect(restored!.id).toBe(archived!.id);
  });

  it("is idempotent: reconciling the same config twice changes nothing the second time", async () => {
    const config: ClubConfig = {
      meetings: [
        meeting({
          id: "reconcile-test-idempotent",
          agenda: [
            {
              id: "reconcile-test-idempotent-workshop",
              title: "Session",
              description: null,
              project: null,
            },
          ],
        }),
      ],
    };

    await reconcileFromConfig(db, config);
    const result = await reconcileFromConfig(db, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both meetings and workshops already matched the config: still an
    // "upsert" (the row is written through on every pass, live or not) but
    // never an archive or an unarchive.
    expect(result.counts.meetings).toEqual({
      upserted: 1,
      archived: 0,
      unarchived: 0,
    });
    expect(result.counts.workshops).toEqual({
      upserted: 1,
      archived: 0,
      unarchived: 0,
    });

    const count = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.meetings
      where "configId" = 'reconcile-test-idempotent'
    `);
    expect(count[0]!.n).toBe(1);
  });

  it("refuses to reconcile a config with zero meetings", async () => {
    const result = await reconcileFromConfig(db, { meetings: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/zero meetings/);
  });

  it("aborts the whole reconcile when the config fails runtime validation, writing nothing", async () => {
    const dupId = "reconcile-test-invalid";
    // Two meetings sharing an id: a shape zod's per-field checks cannot see
    // (both are independently valid `Meeting`s), which is exactly why
    // `validateClubConfig` has to run again here rather than trusting the
    // type. See reconcile.ts's header for why this aborts everything rather
    // than skipping the offending row.
    const config: ClubConfig = {
      meetings: [
        meeting({ id: dupId, title: "First" }),
        meeting({ id: dupId, title: "Second" }),
      ],
    };

    const result = await reconcileFromConfig(db, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/runtime validation/);

    const row = await liveMeetingByConfigId(dupId);
    expect(row).toBeNull();
  });
});
