import { describe, expect, it } from "vitest";
import { AirtableClient, type AirtableRecord } from "./client.js";
import { field, table } from "./field.js";
import { duplicateKeyFindings, verifyBase } from "./verify.js";

/**
 * verify.ts against a fixture base, asserting each check fires on a
 * deliberately broken schema.
 *
 * The registry itself is all placeholders until the base is scaffolded, so
 * these drive the checks through a stub client rather than through
 * `registry.ts` — except the placeholder check, which is exactly what the real
 * registry should trip today.
 */

interface StubTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: { id: string; name: string; type: string }[];
}

function stubClient(
  tables: StubTable[],
  records: Record<string, AirtableRecord[]> = {},
): AirtableClient {
  const client = new AirtableClient({ baseId: "appX", token: "t" });
  Object.assign(client, {
    getBaseSchema: async () => ({ tables }),
    listRecords: async (tableId: string) => records[tableId] ?? [],
  });
  return client;
}

describe("verifyBase", () => {
  it("fails on the real registry while its IDs are placeholders", async () => {
    // A placeholder that reaches a live sync does not error: Airtable accepts
    // the request, the write lands nowhere, and the pass reports success.
    const result = await verifyBase(stubClient([]), { checkDuplicates: false });
    expect(result.ok).toBe(false);
    expect(
      result.findings.every(
        (f) => f.severity === "fatal" && /placeholder/.test(f.message),
      ),
    ).toBe(true);
  });

  it("lists every pushed field as a manual checklist", async () => {
    // The base schema response is purely structural — no permission or
    // editing-restriction data anywhere in it — so whether each ⚙️ field is
    // locked down can only ever be checked by a human walking the UI.
    const result = await verifyBase(stubClient([]), { checkDuplicates: false });
    expect(result.pushChecklist.length).toBeGreaterThan(0);
    expect(result.pushChecklist.some((c) => c.field === "⚙️ Platform ID")).toBe(
      true,
    );
  });
});

describe("duplicateKeyFindings", () => {
  const spec = table("Members", "tblM", {
    platformId: field
      .text("fldId", "⚙️ Platform ID")
      .matchKey()
      .push((m: { id: string }) => m.id),
  });

  const rec = (id: string, key: string): AirtableRecord => ({
    id,
    fields: { fldId: key },
  });

  it("reports two records sharing a key", () => {
    // Airtable does not enforce uniqueness on text fields, so this is a
    // convention the base cannot uphold by itself. Two Members rows with the
    // same key produces a member whose attendance is split across two records
    // and whose dues look unpaid.
    const findings = duplicateKeyFindings(spec, [
      rec("rec1", "u1"),
      rec("rec2", "u1"),
      rec("rec3", "u2"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warn");
    expect(findings[0]!.message).toMatch(/2 records share/);
  });

  it("is quiet when every key is unique", () => {
    expect(
      duplicateKeyFindings(spec, [rec("rec1", "u1"), rec("rec2", "u2")]),
    ).toEqual([]);
  });

  it("ignores records with no key rather than grouping them together", () => {
    const findings = duplicateKeyFindings(spec, [
      { id: "rec1", fields: {} },
      { id: "rec2", fields: {} },
    ]);
    expect(findings).toEqual([]);
  });
});

/**
 * Each check driven against a deliberately broken fixture base.
 *
 * A check that is never seen to fire is a check nobody knows works, and these
 * are the five things standing between a schema drift and a sync that reports
 * success while writing nowhere.
 */
describe("the five checks, against a broken base", () => {
  const fixture = table("Members", "tblM", {
    platformId: field
      .text("fldId", "⚙️ Platform ID")
      .matchKey()
      .push((m: { id: string }) => m.id),
    dues: field.date("fldDues", "Dues paid").pull((v) => v),
  });

  const live = (
    fields: { id: string; name: string; type: string }[],
  ): StubTable[] => [
    { id: "tblM", name: "Members", primaryFieldId: "fldId", fields },
  ];

  const run = (tables: StubTable[]) =>
    verifyBase(stubClient(tables), {
      checkDuplicates: false,
      tables: { members: fixture },
    });

  it("passes a base that matches the registry", async () => {
    const result = await run(
      live([
        { id: "fldId", name: "⚙️ Platform ID", type: "singleLineText" },
        { id: "fldDues", name: "Dues paid", type: "date" },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.findings.filter((f) => f.severity !== "report")).toEqual([]);
  });

  it("survives a renamed field, which is what field IDs are for", async () => {
    // The case that matters most: an officer tidying "Dues paid" to "Dues
    // Paid" must be invisible to the sync.
    const result = await run(
      live([
        { id: "fldId", name: "Platform Identifier", type: "singleLineText" },
        { id: "fldDues", name: "Dues Paid", type: "date" },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it("check 1 — a missing field is fatal", async () => {
    const result = await run(
      live([{ id: "fldId", name: "⚙️ Platform ID", type: "singleLineText" }]),
    );
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining("does not exist"),
      }),
    );
  });

  it("check 2 — a retyped field is fatal", async () => {
    // A text field where a date is expected coerces silently rather than
    // failing, so nothing downstream would notice.
    const result = await run(
      live([
        { id: "fldId", name: "⚙️ Platform ID", type: "singleLineText" },
        { id: "fldDues", name: "Dues paid", type: "singleLineText" },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining("singleLineText in the base, date"),
      }),
    );
  });

  it("check 3 — an ineligible match key is fatal", async () => {
    // The registry's type-level guard prevents this being written by hand, so
    // reaching it needs a cast — which is exactly how it would arrive in
    // practice, via a field retyped in the Airtable UI.
    const broken = table("Members", "tblM", {
      platformId: {
        ...fixture.fields.platformId,
        type: "email" as const,
      } as unknown as (typeof fixture.fields)["platformId"],
    });

    const result = await verifyBase(
      stubClient(
        live([{ id: "fldId", name: "⚙️ Platform ID", type: "email" }]),
      ),
      { checkDuplicates: false, tables: { members: broken } },
    );
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining("fieldsToMergeOn does not accept"),
      }),
    );
  });

  it("check 5 — an officer's own column is reported, not an error", async () => {
    // The base IS the officer console. Somebody adding a column for their own
    // tracking is the system working; listing it just means nobody assumes it
    // syncs anywhere.
    const result = await run(
      live([
        { id: "fldId", name: "⚙️ Platform ID", type: "singleLineText" },
        { id: "fldDues", name: "Dues paid", type: "date" },
        { id: "fldMine", name: "T-shirt size", type: "singleSelect" },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "report",
        field: "T-shirt size",
      }),
    );
  });

  it("reports a table that is missing entirely", async () => {
    const result = await run([]);
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining("not present in the base"),
      }),
    );
  });
});
