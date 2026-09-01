import {
  AIRTABLE_DATETIME_TIME_ZONE,
  AirtableClient,
  registry,
  type FieldSpec,
  type TableSpec,
} from "@devdogsuga/airtable";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pass refuses to run against a base that does not match the registry.
 *
 * This is the guard the verifier was written for and never wired to. A
 * registry ID that is not in the base is NOT an error at write time: Airtable
 * accepts the request, the value lands nowhere, and the pass reports success.
 * The failure mode is a healthy-looking cron discarding data, with no signal
 * anywhere downstream.
 *
 * Everything that touches Postgres is mocked. The subject here is the ORDER of
 * operations: nothing is claimed or written before the schema has been agreed.
 */

const lease = vi.hoisted(() => ({
  claimSyncLease: vi.fn(() => Promise.resolve({ ok: true as const })),
  releaseSyncLease: vi.fn(() => Promise.resolve()),
  recordRefusal: vi.fn(() =>
    Promise.resolve({ previous: "ok", persisted: true }),
  ),
}));

const alerts = vi.hoisted(() => ({
  postAlert: vi.fn(
    (_title: string, _lines: string[], _footer?: string): Promise<void> =>
      Promise.resolve(),
  ),
}));
vi.mock("../discord/alerts", () => alerts);

const writes = vi.hoisted(() => ({
  pushMembers: vi.fn(() =>
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
// its own client, so the module is off the path anyway. Mocking it is what
// keeps this a unit test rather than a database one.
const credentials = vi.hoisted(() => {
  class AirtableNotConfiguredError extends Error {}
  return {
    AirtableNotConfiguredError,
    getAirtableClient: vi.fn((): Promise<unknown> =>
      Promise.reject(new Error("tests must pass their own client")),
    ),
  };
});
vi.mock("./credentials", () => credentials);

vi.mock("./attendance", () => ({
  pullAttendance: vi.fn(() =>
    Promise.resolve({
      imported: 0,
      skipped: 0,
      accountsCreated: 0,
      refusals: [],
      idMap: new Map(),
    }),
  ),
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
  pullProjects: vi.fn(() =>
    Promise.resolve({
      upserted: 0,
      archived: 0,
      skipped: 0,
      refusals: [],
      idMap: new Map(),
    }),
  ),
}));

const { runAirtableSync } = await import("./run");

/**
 * A base built from the registry, so `verifyBase` passes.
 *
 * Widened to `TableSpec` on the way in. `registry` is a const object whose
 * tables each carry their own field shape, so `Object.values` over it yields
 * `any`, and an `any` here would defeat the point: these fixtures exist to be
 * broken in one specific way each.
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
        // Mirror the two option values `verifyBase` treats as semantic: select
        // choice names and a datetime's timezone. Presentation-only options
        // such as colours and date formats remain absent on purpose.
        fields: fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          ...(f.choices
            ? { options: { choices: f.choices.map((name) => ({ name })) } }
            : f.type === "dateTime"
              ? { options: { timeZone: AIRTABLE_DATETIME_TIME_ZONE } }
              : {}),
        })),
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
  credentials.getAirtableClient.mockImplementation(() =>
    Promise.reject(new Error("tests must pass their own client")),
  );
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

describe("runAirtableSync drift alerting", () => {
  /**
   * The cron runs every fifteen minutes, so a drifted base refuses 96 times a
   * day. Everything here is about that number: an alert per refusal is one
   * people mute, and a muted channel is worse than no channel because it still
   * looks like coverage.
   */
  const drifted = () => {
    const schema = matchingSchema();
    schema.tables = schema.tables.filter((t) => t.name !== "Teams");
    return clientWith(schema);
  };

  it("alerts on the transition into drift", async () => {
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "ok",
      persisted: true,
    });

    await runAirtableSync({ client: drifted() });

    expect(alerts.postAlert).toHaveBeenCalledOnce();
    expect(alerts.postAlert).toHaveBeenCalledWith(
      expect.stringMatching(/no longer matches the registry/),
      expect.arrayContaining([expect.stringMatching(/Teams/)]),
      expect.stringMatching(/airtable verify/),
    );
  });

  it("stays silent while the base is still drifted", async () => {
    // The 95 other passes that day.
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "schema_invalid",
      persisted: true,
    });

    await runAirtableSync({ client: drifted() });

    expect(alerts.postAlert).not.toHaveBeenCalled();
  });

  it("alerts again once the base is fixed and drifts a second time", async () => {
    // A successful pass sets `lastStatus` back to 'ok' via releaseSyncLease, so
    // the next drift is a fresh transition and genuinely is news.
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "ok",
      persisted: true,
    });

    await runAirtableSync({ client: drifted() });

    expect(alerts.postAlert).toHaveBeenCalledOnce();
  });

  it("stays silent when a concurrent run held the lease", async () => {
    // Nothing was written, so the transition check has no state behind it.
    // Alerting anyway would fire on every interleaved pass.
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "ok",
      persisted: false,
    });

    await runAirtableSync({ client: drifted() });

    expect(alerts.postAlert).not.toHaveBeenCalled();
  });

  it("records the refusal even though it claims no lease", async () => {
    await runAirtableSync({ client: drifted() });

    expect(lease.recordRefusal).toHaveBeenCalledOnce();
    expect(lease.claimSyncLease).not.toHaveBeenCalled();
  });

  it("does not alert when the base matches", async () => {
    await runAirtableSync({ client: clientWith(matchingSchema()) });

    expect(alerts.postAlert).not.toHaveBeenCalled();
    expect(lease.recordRefusal).not.toHaveBeenCalled();
  });
});

describe("runAirtableSync with no token", () => {
  /**
   * A pass that cannot find `AIRTABLE_SYNC_PAT` is a REFUSAL, not a no-op.
   *
   * This branch used to return in silence, which let the cron run every
   * fifteen minutes for days with nothing recorded anywhere. The argument for
   * the silence was that an unconfigured install should not touch the state
   * row, but that conflated "nobody has set this up" with "this was set up and
   * the credential is gone". It could not tell them apart, because an unset
   * base id looked like a fresh clone. The base id is committed now, so the
   * token is the only thing that can be missing.
   */
  const unconfigured = () => {
    credentials.getAirtableClient.mockImplementation(() =>
      Promise.reject(
        new credentials.AirtableNotConfiguredError("AIRTABLE_SYNC_PAT unset"),
      ),
    );
  };

  it("records the refusal and alerts on the transition", async () => {
    unconfigured();
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "ok",
      persisted: true,
    });

    const report = await runAirtableSync({ trigger: "cron" });

    expect(report.skipped).toBe("not_configured");
    expect(lease.recordRefusal).toHaveBeenCalledWith(
      "not_configured",
      expect.arrayContaining([expect.stringMatching(/AIRTABLE_SYNC_PAT/)]),
    );
    expect(alerts.postAlert).toHaveBeenCalledOnce();
    expect(alerts.postAlert).toHaveBeenCalledWith(
      expect.stringMatching(/no sync token/),
      expect.arrayContaining([expect.stringMatching(/AIRTABLE_SYNC_PAT/)]),
      // The fix belongs in the alert: the token moved out of Vault, so
      // "rotate it from the console" is no longer the answer and the path that
      // replaced it is not guessable.
      expect.stringMatching(/env push/),
    );
  });

  it("stays silent while it is still unconfigured", async () => {
    // The 95 other passes that day.
    unconfigured();
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "not_configured",
      persisted: true,
    });

    await runAirtableSync({ trigger: "cron" });

    expect(lease.recordRefusal).toHaveBeenCalledOnce();
    expect(alerts.postAlert).not.toHaveBeenCalled();
  });

  it("stays silent when a concurrent run held the lease", async () => {
    // Nothing was written, so the transition check has no state behind it.
    unconfigured();
    lease.recordRefusal.mockResolvedValueOnce({
      previous: "ok",
      persisted: false,
    });

    await runAirtableSync({ trigger: "cron" });

    expect(alerts.postAlert).not.toHaveBeenCalled();
  });

  it("records and alerts NOTHING for a manual run", async () => {
    // ⚠️ The exemption that keeps this from firing on a button press.
    // `requestAirtableSync` hands this report straight to the console, which
    // says "not configured" on screen. An officer clicking twice must not post
    // twice to the officers' channel.
    unconfigured();

    const report = await runAirtableSync({ trigger: "manual" });

    expect(report.skipped).toBe("not_configured");
    expect(lease.recordRefusal).not.toHaveBeenCalled();
    expect(alerts.postAlert).not.toHaveBeenCalled();
  });

  it("claims no lease and reaches no table", async () => {
    unconfigured();

    await runAirtableSync({ trigger: "cron" });

    expect(lease.claimSyncLease).not.toHaveBeenCalled();
    expect(writes.pushMembers).not.toHaveBeenCalled();
  });
});
