import { describe, expect, it } from "vitest";
import { AirtableClient, type AirtableRecord } from "./client.js";
import { field, table } from "./field.js";
import { isPlaceholder, registry } from "./registry.js";
import {
  choiceFindings,
  dateTimeTimezoneFindings,
  duplicateKeyFindings,
  verifyBase,
} from "./verify.js";

/**
 * verify.ts against a fixture base, asserting each check fires on a
 * deliberately broken schema.
 *
 * Driven through a stub client rather than the real registry, so each check can
 * be pointed at a base that is broken in exactly one way. The real registry
 * gets one assertion of its own below, that it holds no placeholders, because a
 * stub can never establish that property.
 */

interface StubTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: {
    id: string;
    name: string;
    type: string;
    /** Choice names for check 6 and datetime timezone for check 7. */
    options?: Record<string, unknown>;
  }[];
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

describe("the committed registry", () => {
  it("holds no placeholder IDs", async () => {
    // Until 2026-08-06 this asserted the opposite: the base did not exist and
    // every ID was a `fldTODO_*`. Now that it does, the enduring claim is the
    // inverse. A field declared but never scaffolded must not reach main.
    //
    // Worth an assertion rather than trusting the runbook, because a
    // placeholder does not fail loudly. Airtable accepts a write to an unknown
    // field ID, the value lands nowhere, and the pass reports success.
    for (const [key, spec] of Object.entries(registry)) {
      expect(isPlaceholder(spec.id), `table ${key}`).toBe(false);
      for (const [fieldKey, fieldSpec] of Object.entries(spec.fields)) {
        expect(isPlaceholder(fieldSpec.id), `${key}.${fieldKey}`).toBe(false);
      }
    }
  });

  it("gives every link field a target that exists", async () => {
    // The Meta API requires `linkedTableId`, so a link naming a table the
    // registry does not have is a scaffold that dies partway through, after
    // creating tables, which is the expensive half to unpick.
    for (const [key, spec] of Object.entries(registry)) {
      for (const [fieldKey, fieldSpec] of Object.entries(spec.fields)) {
        if (fieldSpec.type !== "multipleRecordLinks") continue;
        expect(fieldSpec.linkTo, `${key}.${fieldKey}`).toBeDefined();
        expect(Object.keys(registry)).toContain(fieldSpec.linkTo);
      }
    }
  });
});

describe("verifyBase", () => {
  it("fails on a base missing every registered table", async () => {
    const result = await verifyBase(stubClient([]), { checkDuplicates: false });
    expect(result.ok).toBe(false);
    expect(
      result.findings.every(
        (f) =>
          f.severity === "fatal" && /not present in the base/.test(f.message),
      ),
    ).toBe(true);
  });

  it("lists every pushed field as a manual checklist", async () => {
    // The base schema response is structural only, with no permission or
    // editing-restriction data in it, so whether each ⚙️ field is locked down
    // can only be checked by a human walking the UI.
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
    // reaching it needs a cast. That is how it would arrive in practice too,
    // via a field retyped in the Airtable UI.
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

/**
 * Check 6, against a base whose choice list is wrong in one way at a time.
 *
 * The check exists because a renamed or deleted choice fails silently: nothing
 * errors, no write is rejected, and rows keep holding a string no branch in the
 * platform matches, which renders as an empty slot on a page that otherwise
 * works. Nothing else in the verifier looks at `options`, so if this does not
 * fire, nothing does.
 */
describe("check 6 — declared select choices", () => {
  const KIND = ["Workshop", "Social", "Meeting"] as const;

  const fixture = table("Meetings", "tblM", {
    platformId: field
      .text("fldId", "⚙️ Platform ID")
      .matchKey()
      .push((m: { id: string }) => m.id),
    kind: field.singleSelect("fldKind", "Kind", KIND).pull((v) => v),
  });

  const live = (choices: unknown): StubTable[] => [
    {
      id: "tblM",
      name: "Meetings",
      primaryFieldId: "fldId",
      fields: [
        { id: "fldId", name: "⚙️ Platform ID", type: "singleLineText" },
        {
          id: "fldKind",
          name: "Kind",
          type: "singleSelect",
          ...(choices === undefined
            ? {}
            : { options: { choices } as Record<string, unknown> }),
        },
      ],
    },
  ];

  const run = (tables: StubTable[]) =>
    verifyBase(stubClient(tables), {
      checkDuplicates: false,
      tables: { meetings: fixture },
    });

  const named = (...names: string[]) =>
    names.map((name, i) => ({ id: `sel${i}`, name, color: "blueLight2" }));

  it("passes when the base holds exactly the declared choices", async () => {
    const result = await run(live(named(...KIND)));
    expect(result.ok).toBe(true);
    expect(result.findings.filter((f) => f.severity !== "report")).toEqual([]);
  });

  it("ignores order and colour, which are the officer's to arrange", async () => {
    // Dragging a choice up the list, or recolouring it, is the base being used
    // as intended. Reporting either would train people to ignore the verifier,
    // which costs more than it could ever catch.
    const result = await run(
      live([
        { id: "s2", name: "Meeting", color: "redBright" },
        { id: "s0", name: "Workshop", color: "purpleDark1" },
        { id: "s1", name: "Social", color: "greenLight2" },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it("is fatal when a declared choice is missing from the base", async () => {
    // How this actually arrives: a choice added to the registry, and the
    // scaffolder cannot add it to a field that already exists. The finding is
    // the reminder that the manual edit is still outstanding.
    const result = await run(live(named("Workshop", "Social")));
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        field: "kind",
        message: expect.stringContaining('missing from the base "Meeting"'),
      }),
    );
  });

  it("is fatal when the base holds a choice the registry does not", async () => {
    const result = await run(live(named(...KIND, "Hackathon")));
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining(
          'present only in the base "Hackathon"',
        ),
      }),
    );
  });

  it("names both halves when the lists have diverged in both directions", async () => {
    // A rename in the UI is exactly this: one missing, one extra. The message
    // has to say both, because "missing Meeting" alone reads as deleted rather
    // than renamed and sends the officer to the wrong repair.
    const result = await run(live(named("Workshop", "Social", "Meetings")));
    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.field === "kind")!;
    expect(finding.message).toContain('missing from the base "Meeting"');
    expect(finding.message).toContain('present only in the base "Meetings"');
  });

  it("reports rather than throws when the base has no choice list at all", async () => {
    // A verifier that dies mid-pass says nothing about the tables it had not
    // reached yet, so an unfamiliar shape must degrade into a finding.
    const result = await run(live(undefined));
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "fatal",
        message: expect.stringContaining("no choice list"),
      }),
    );
  });

  it("reports rather than throws on a malformed choice list", async () => {
    for (const malformed of [
      "Workshop",
      [null],
      [{ id: "sel0" }],
      [{ name: 7 }],
      { choices: named("Workshop") },
    ]) {
      const result = await run(live(malformed));
      expect(result.ok, JSON.stringify(malformed)).toBe(false);
      expect(
        result.findings.some(
          (f) => f.field === "kind" && f.severity === "fatal",
        ),
        JSON.stringify(malformed),
      ).toBe(true);
    }
  });

  it("says nothing about a select whose spec declares no choices", async () => {
    // The narrowness is the point. An undeclared select leaves the vocabulary
    // to the officers, and comparing it would reverse the rule this check was
    // widened around rather than replacing.
    const undeclared = table("Meetings", "tblM", {
      platformId: field
        .text("fldId", "⚙️ Platform ID")
        .matchKey()
        .push((m: { id: string }) => m.id),
      kind: field.singleSelect("fldKind", "Kind").pull((v) => v),
    });

    const result = await verifyBase(
      stubClient(live(named("Anything", "At all"))),
      { checkDuplicates: false, tables: { meetings: undeclared } },
    );
    expect(result.ok).toBe(true);
  });

  it("compares nothing else in the options bag", () => {
    // Driven straight at the comparison, because a date format is the case
    // that must keep passing: `verify.ts` reads `choices` out of `options` and
    // nothing else, forever.
    const spec = field.singleSelect("fldKind", "Kind", KIND).ignore();
    expect(
      choiceFindings("Meetings", "kind", spec, {
        name: "Kind",
        options: {
          choices: named(...KIND),
          dateFormat: { name: "us" },
          somethingAirtableAddedLater: true,
        },
      }),
    ).toEqual([]);
  });
});

describe("check 7 — datetime timezone", () => {
  const spec = field.dateTime("fldStarts", "Starts at").ignore();

  it("is wired into live base verification", async () => {
    const fixture = table("Meetings", "tblM", { startsAt: spec });
    const result = await verifyBase(
      stubClient([
        {
          id: "tblM",
          name: "Meetings",
          primaryFieldId: "fldStarts",
          fields: [
            {
              id: "fldStarts",
              name: "Starts at",
              type: "dateTime",
              options: { timeZone: "utc" },
            },
          ],
        },
      ]),
      { checkDuplicates: false, tables: { meetings: fixture } },
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: "fatal", field: "startsAt" }),
    );
  });

  it("accepts the DST-aware club timezone", () => {
    expect(
      dateTimeTimezoneFindings("Meetings", "startsAt", spec, {
        name: "Starts at",
        options: { timeZone: "America/New_York" },
      }),
    ).toEqual([]);
  });

  it("rejects UTC and a missing timezone", () => {
    for (const options of [{ timeZone: "utc" }, undefined]) {
      const findings = dateTimeTimezoneFindings("Meetings", "startsAt", spec, {
        name: "Starts at",
        options,
      });
      expect(findings).toEqual([
        expect.objectContaining({ severity: "fatal", field: "startsAt" }),
      ]);
    }
  });

  it("ignores options on fields that are not datetimes", () => {
    expect(
      dateTimeTimezoneFindings(
        "Meetings",
        "name",
        field.text("fldName", "Name").ignore(),
        { name: "Name", options: { timeZone: "utc" } },
      ),
    ).toEqual([]);
  });
});
