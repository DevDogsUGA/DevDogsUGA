import {
  AirtableClient,
  registry,
  type FieldSpec,
  type TableSpec,
} from "@devdogsuga/airtable";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pass refuses to run against a base that does not match the registry.
 *
 * This is the guard the verifier was written for and never wired to. It
 * matters more than it looks: a registry ID that is not in the base is NOT an
 * error at write time. Airtable accepts the request, the value lands nowhere,
 * and the pass reports success — so the failure mode is a healthy-looking cron
 * quietly discarding data, which nothing downstream can detect.
 *
 * Everything that touches Postgres is mocked; the subject here is the ORDER of
 * operations, specifically that nothing is claimed or written before the schema
 * has been agreed.
 */

const lease = vi.hoisted(() => ({
  claimSyncLease: vi.fn(() => Promise.resolve({ ok: true as const })),
  releaseSyncLease: vi.fn(() => Promise.resolve()),
}));

const writes = vi.hoisted(() => ({
  pushMembers: vi.fn(() =>
    Promise.resolve({ created: 0, updated: 0, unchanged: 0 }),
  ),
  pushProjects: vi.fn(() =>
    Promise.resolve({ created: 0, updated: 0, unchanged: 0 }),
  ),
  pushTeams: vi.fn(() =>
    Promise.resolve({ created: 0, updated: 0, unchanged: 0 }),
  ),
  pushDerivedCounts: vi.fn(() =>
    Promise.resolve({ created: 0, updated: 0, unchanged: 0 }),
  ),
  pullTeamGrades: vi.fn(() => Promise.resolve(0)),
  writeSyncStatus: vi.fn(() => Promise.resolve(0)),
}));

// `credentials.ts` reads `~/env`, which is not populated in the unit-test
// environment, and reaches Vault through `~/server/db`. Every test here passes
// its own client, so the whole module is off the path anyway -- mocking it is
// what keeps this a unit test rather than a database one.
vi.mock("./credentials", () => ({
  getAirtableClient: vi.fn(() =>
    Promise.reject(new Error("tests must pass their own client")),
  ),
  AirtableNotConfiguredError: class extends Error {},
}));

vi.mock("./lease", () => lease);
vi.mock("./push", () => writes);
vi.mock("./sync", () => ({
  pullMeetings: vi.fn(() =>
    Promise.resolve({
      upserted: 0,
      archived: 0,
      skipped: 0,
      refusals: [],
      idMap: new Map(),
    }),
  ),
  pullWorkshops: vi.fn(() =>
    Promise.resolve({
      upserted: 0,
      archived: 0,
      skipped: 0,
      refusals: [],
      idMap: new Map(),
    }),
  ),
  pullCompetitions: vi.fn(() =>
    Promise.resolve({
      upserted: 0,
      archived: 0,
      skipped: 0,
      refusals: [],
      idMap: new Map(),
    }),
  ),
  projectIdMap: vi.fn(() => Promise.resolve(new Map())),
}));

const { runAirtableSync } = await import("./run");

/**
 * A base built from the registry, so `verifyBase` passes.
 *
 * Widened to `TableSpec` on the way in. `registry` is a const object whose
 * tables each carry their own field shape, so `Object.values` over it yields
 * `any` — and an `any` here would quietly defeat the point, since these
 * fixtures exist to be broken in one specific way each.
 */
function matchingSchema() {
  const specs = Object.values(registry as unknown as Record<string, TableSpec>);
  return {
    tables: specs.map((spec) => {
      const fields: FieldSpec[] = Object.values(spec.fields);
      return {
        id: spec.id,
        name: spec.name,
        primaryFieldId: fields[0]!.id,
        fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
      };
    }),
  };
}

function clientWith(schema: ReturnType<typeof matchingSchema>) {
  const client = new AirtableClient({ baseId: "appX", token: "t" });
  Object.assign(client, {
    getBaseSchema: () => Promise.resolve(schema),
    listRecords: () => Promise.resolve([]),
    upsertRecords: () => Promise.resolve({ created: 0, updated: 0 }),
    updateRecords: () => Promise.resolve(0),
  });
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runAirtableSync schema precondition", () => {
  it("runs when the base matches the registry", async () => {
    const report = await runAirtableSync({
      client: clientWith(matchingSchema()),
    });

    expect(report.skipped).toBeUndefined();
    expect(report.ok).toBe(true);
    expect(lease.claimSyncLease).toHaveBeenCalledOnce();
  });

  it("refuses when a registered field is gone", async () => {
    const schema = matchingSchema();
    const members = schema.tables.find((t) => t.name === "Members")!;
    members.fields = members.fields.filter(
      (f) => f.name !== "⚙️ Meetings attended",
    );

    const report = await runAirtableSync({ client: clientWith(schema) });

    expect(report.skipped).toBe("schema_invalid");
    expect(report.ok).toBe(false);
    expect(report.schemaFindings?.join(" ")).toMatch(/does not exist/);
  });

  it("refuses when a field has been retyped", async () => {
    // The case field IDs cannot save us from. A rename is invisible and
    // harmless; a text column where a date is expected coerces silently.
    const schema = matchingSchema();
    const meetings = schema.tables.find((t) => t.name === "Meetings")!;
    meetings.fields.find((f) => f.name === "Starts at")!.type =
      "singleLineText";

    const report = await runAirtableSync({ client: clientWith(schema) });

    expect(report.skipped).toBe("schema_invalid");
    expect(report.schemaFindings?.join(" ")).toMatch(/singleLineText/);
  });

  it("claims no lease and writes nothing when it refuses", async () => {
    // The ordering claim. A refusal that had already claimed the lease would
    // leave `lastStatus` reading as a real pass, and a refusal that had already
    // pushed would be the silent-loss bug itself.
    const schema = matchingSchema();
    schema.tables = schema.tables.filter((t) => t.name !== "Teams");

    await runAirtableSync({ client: clientWith(schema) });

    expect(lease.claimSyncLease).not.toHaveBeenCalled();
    expect(lease.releaseSyncLease).not.toHaveBeenCalled();
    for (const write of Object.values(writes)) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("survives a base with extra fields an officer added", async () => {
    // Officers adding their own columns is the system working, not drift.
    const schema = matchingSchema();
    schema.tables
      .find((t) => t.name === "Members")!
      .fields.push({
        id: "fldOfficerScratch",
        name: "Who to chase",
        type: "singleLineText",
      });

    const report = await runAirtableSync({ client: clientWith(schema) });
    expect(report.skipped).toBeUndefined();
  });
});
