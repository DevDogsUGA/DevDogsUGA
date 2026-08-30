import { describe, expect, it } from "vitest";
import { AirtableClient, type LiveTable, type NewField } from "./client.js";
import { field, table } from "./field.js";
import { registry } from "./registry.js";
import { createOptionsFor, discoverIds, scaffoldBase } from "./scaffold.js";

/**
 * The scaffolder against a fake base.
 *
 * Worth testing without a real base for the reason the whole integration
 * exists: the second base, a staging one or a rebuild, has to come out the same
 * as the first. A scaffolder that only ever ran once, by hand, against one base
 * is indistinguishable from a scaffolder that works.
 */

/** A base that records what was created, so ordering can be asserted. */
function fakeBase(initial: LiveTable[] = []) {
  const tables: LiveTable[] = structuredClone(initial);
  const calls: string[] = [];
  let n = 0;

  const client = new AirtableClient({ baseId: "appX", token: "t" });
  Object.assign(client, {
    getBaseSchema: async () => ({ tables: structuredClone(tables) }),

    createTable: async (name: string, fields: NewField[]) => {
      calls.push(`table:${name}`);
      const created: LiveTable = {
        id: `tbl${++n}`,
        name,
        primaryFieldId: `fld${n}_0`,
        fields: fields.map((f, i) => ({
          id: `fld${n}_${i}`,
          name: f.name,
          type: f.type,
          ...(f.options ? { options: f.options } : {}),
        })),
      };
      tables.push(created);
      return structuredClone(created);
    },

    createField: async (tableId: string, f: NewField) => {
      const target = tables.find((t) => t.id === tableId)!;
      calls.push(`field:${target.name}.${f.name}`);
      const created = {
        id: `fld${tableId}_${target.fields.length}`,
        name: f.name,
        type: f.type,
        ...(f.options ? { options: f.options } : {}),
      };
      target.fields.push(created);
      return structuredClone(created);
    },
  });

  return { client, calls, tables };
}

describe("createOptionsFor", () => {
  it("sends no options for the four types that take none", () => {
    for (const t of ["text", "longText", "email", "url"] as const) {
      const spec = field[t]("fldX", "X").ignore();
      expect(createOptionsFor(spec)).toBeUndefined();
    }
  });

  it("makes numbers integers", () => {
    // Every number the registry pushes is a count or a point total. Precision
    // 0 is what stops "3" rendering as "3.00" in the officer's grid.
    expect(createOptionsFor(field.number("fldX", "X").ignore())).toEqual({
      precision: 0,
    });
  });

  it("pins dateTime to UTC", () => {
    // The platform stores instants; a base-local timezone would introduce a
    // second interpretation of the same column.
    expect(
      createOptionsFor(field.dateTime("fldX", "X").ignore()),
    ).toMatchObject({ timeZone: "utc", dateFormat: { name: "iso" } });
  });

  it("creates a select with the choices its spec declares", () => {
    // The whole point of declaring them: the field arrives holding exactly
    // these, so Airtable's dropdown refuses a value the platform cannot render.
    // `toEqual` rather than `toMatchObject` because a colour smuggled in here
    // would be a permanent disagreement with any officer who restyles the
    // choice. The create endpoint assigns one itself when it is left out, and
    // that is the version we want.
    const spec = field
      .singleSelect("fldX", "Kind", ["Workshop", "Social"] as const)
      .ignore();
    expect(createOptionsFor(spec)).toEqual({
      choices: [{ name: "Workshop" }, { name: "Social" }],
    });
  });

  it("still creates an empty select when no choices are declared", () => {
    // Deliberate, not a gap. An undeclared select says the vocabulary belongs
    // to the officers, and Airtable lets them add choices in the UI, so the
    // empty list is the useful thing to create. This asserts the two cases stay
    // distinguishable.
    for (const t of ["singleSelect", "multipleSelects"] as const) {
      expect(createOptionsFor(field[t]("fldX", "X").ignore())).toEqual({
        choices: [],
      });
    }
  });

  it("refuses a link with no resolved target", () => {
    // The failure this prevents is silent: Airtable rejects the create, but
    // only after the table it belonged to has been made.
    const link = field.link("fldX", "X", "meetings").ignore();
    expect(() => createOptionsFor(link)).toThrow(/no resolved target/);
  });

  it("sends linkedTableId and nothing else", () => {
    // The published reference lists `prefersSingleRecordLink` as required and
    // omits `isReversed` entirely; both are wrong for creation. Measured
    // against the real API, every combination carrying either key returns 422
    // "not included in the options schema". They are response-only, and the
    // create sets them itself. Asserted with toEqual rather than toMatchObject
    // so adding a key back is a test failure rather than a live 422.
    const link = field.link("fldX", "X", "meetings").ignore();
    expect(createOptionsFor(link, "tblTarget")).toEqual({
      linkedTableId: "tblTarget",
    });
  });
});

describe("scaffoldBase", () => {
  it("creates every registry table and field on an empty base", async () => {
    const { client } = fakeBase();
    const result = await scaffoldBase(client);

    const specs = Object.values(registry);
    expect(result.schema).toHaveLength(specs.length);

    for (const spec of specs) {
      const live = result.schema.find((t) => t.name === spec.name)!;
      expect(live, spec.name).toBeDefined();
      for (const f of Object.values(spec.fields)) {
        expect(
          live.fields.some((lf) => lf.name === f.name),
          `${spec.name}.${f.name}`,
        ).toBe(true);
      }
    }
  });

  it("creates every link only after its target table exists", async () => {
    // The property the two-pass split exists for. Asserted on ordering rather
    // than on the result, because a scaffolder that creates links last by
    // accident passes a result check and fails the moment a table is added
    // above it in the registry.
    const { client, calls } = fakeBase();
    await scaffoldBase(client);

    const linkCalls = calls.filter(
      (c) =>
        c === "field:Workshops.Meeting" ||
        c === "field:Workshops.Project" ||
        c === "field:Competitions.Workshop",
    );
    expect(linkCalls).toHaveLength(3);

    for (const [linkCall, targetTable] of [
      ["field:Workshops.Meeting", "table:Meetings"],
      ["field:Workshops.Project", "table:Projects"],
      ["field:Competitions.Workshop", "table:Workshops"],
    ] as const) {
      expect(calls.indexOf(targetTable)).toBeGreaterThanOrEqual(0);
      expect(calls.indexOf(targetTable)).toBeLessThan(calls.indexOf(linkCall));
    }
  });

  it("makes the platform id the primary field", async () => {
    // Airtable takes the FIRST field as primary, and a link or checkbox is not
    // a legal primary field, so this is a property of argument order that
    // nothing else would catch.
    const { client } = fakeBase();
    const result = await scaffoldBase(client);

    for (const live of result.schema) {
      const primary = live.fields.find((f) => f.id === live.primaryFieldId);
      expect(primary?.name, live.name).toBe("⚙️ Platform ID");
    }
  });

  it("does nothing on a second run", async () => {
    const first = fakeBase();
    const built = await scaffoldBase(first.client);

    const second = fakeBase(built.schema);
    const result = await scaffoldBase(second.client);

    expect(second.calls).toEqual([]);
    expect(result.created).toEqual([]);
  });

  it("adds only the field that is missing", async () => {
    const first = fakeBase();
    const built = await scaffoldBase(first.client);

    // Drop one field, as adding a line to the registry would.
    const members = built.schema.find((t) => t.name === "Members")!;
    members.fields = members.fields.filter((f) => f.name !== "Notes");

    const second = fakeBase(built.schema);
    const result = await scaffoldBase(second.client);

    expect(second.calls).toEqual(["field:Members.Notes"]);
    expect(result.created).toHaveLength(1);
  });

  it("does not recreate a field an officer renamed, when the id still matches", async () => {
    const first = fakeBase();
    const built = await scaffoldBase(first.client);

    const live = built.schema.find((t) => t.name === "Members")!;
    const renamed = structuredClone(live);
    const notes = renamed.fields.find((f) => f.name === "Notes")!;
    notes.name = "Officer scratch";

    // Match on the id the registry would hold post-pull-ids. Surviving a
    // rename is the entire reason the wire format is ids and not names.
    const withRealIds = {
      members: table("Members", renamed.id, {
        notes: field.longText(notes.id, "Notes").ignore(),
      }),
    };

    const second = fakeBase([renamed]);
    const result = await scaffoldBase(second.client, { tables: withRealIds });

    expect(second.calls).toEqual([]);
    expect(result.created).toEqual([]);
  });

  it("creates a select holding its declared choices", async () => {
    // `createOptionsFor` being right is not enough. `newField` decides whether
    // the options reach the create call at all, and a select created with no
    // choices accepts anything and looks fine.
    const specs = {
      meetings: table("Meetings", "tblTODO_m", {
        key: field.text("fldTODO_m_key", "⚙️ Platform ID").matchKey().ignore(),
        kind: field
          .singleSelect("fldTODO_m_kind", "Kind", [
            "Workshop",
            "Social",
          ] as const)
          .ignore(),
      }),
    };

    const { client } = fakeBase();
    const result = await scaffoldBase(client, { tables: specs });
    const kind = result.schema
      .find((t) => t.name === "Meetings")!
      .fields.find((f) => f.name === "Kind")!;

    expect(kind.options).toEqual({
      choices: [{ name: "Workshop" }, { name: "Social" }],
    });
  });

  it("does NOT add a choice to a field that already exists", async () => {
    // Pinning the limitation rather than the behaviour anyone wants.
    // `scaffoldBase` creates what is missing and the client has no
    // `updateField`, so adding a name to a spec's `choices` never reaches a
    // live field. Asserted so whoever changes that has to change this test too,
    // and so nobody reads a green scaffold run as "the base now has my new
    // choice". `verify.ts`'s choice check is what says otherwise.
    const before = {
      meetings: table("Meetings", "tblTODO_m", {
        key: field.text("fldTODO_m_key", "⚙️ Platform ID").matchKey().ignore(),
        kind: field
          .singleSelect("fldTODO_m_kind", "Kind", ["Workshop"] as const)
          .ignore(),
      }),
    };
    const first = fakeBase();
    const built = await scaffoldBase(first.client, { tables: before });

    const live = built.schema.find((t) => t.name === "Meetings")!;
    const after = {
      meetings: table("Meetings", live.id, {
        key: field
          .text(
            live.fields.find((f) => f.name === "⚙️ Platform ID")!.id,
            "⚙️ Platform ID",
          )
          .matchKey()
          .ignore(),
        kind: field
          .singleSelect(
            live.fields.find((f) => f.name === "Kind")!.id,
            "Kind",
            ["Workshop", "Social"] as const,
          )
          .ignore(),
      }),
    };

    const second = fakeBase(built.schema);
    const result = await scaffoldBase(second.client, { tables: after });

    expect(second.calls).toEqual([]);
    expect(result.created).toEqual([]);
    expect(
      result.schema
        .find((t) => t.name === "Meetings")!
        .fields.find((f) => f.name === "Kind")!.options,
    ).toEqual({ choices: [{ name: "Workshop" }] });
  });

  it("refuses a link whose target is not in the registry", async () => {
    const { client } = fakeBase();
    const broken = {
      a: table("A", "tblTODO_a", {
        key: field.text("fldTODO_a_key", "⚙️ Platform ID").matchKey().ignore(),
        link: field.link("fldTODO_a_link", "Nowhere", "missing").ignore(),
      }),
    };
    await expect(scaffoldBase(client, { tables: broken })).rejects.toThrow(
      /unknown target "missing"/,
    );
  });
});

describe("discoverIds", () => {
  it("maps every placeholder to a real id", async () => {
    const { client } = fakeBase();
    const { schema } = await scaffoldBase(client);
    const found = discoverIds(schema);

    expect(found.missing).toEqual([]);

    const tableCount = Object.keys(registry).length;
    const fieldCount = Object.values(registry).reduce(
      (n, spec) => n + Object.keys(spec.fields).length,
      0,
    );
    expect(Object.keys(found.tables)).toHaveLength(tableCount);
    expect(Object.keys(found.fields)).toHaveLength(fieldCount);

    for (const id of Object.values(found.tables)) {
      expect(id.startsWith("tblTODO_")).toBe(false);
    }
    for (const id of Object.values(found.fields)) {
      expect(id.startsWith("fldTODO_")).toBe(false);
    }
  });

  it("reports what the base is missing rather than guessing", async () => {
    const { client } = fakeBase();
    const { schema } = await scaffoldBase(client);

    const members = schema.find((t) => t.name === "Members")!;
    members.fields = members.fields.filter((f) => f.name !== "UGA email");
    const withoutTeams = schema.filter((t) => t.name !== "Teams");

    const found = discoverIds(withoutTeams);
    expect(found.missing).toContain("Teams");
    expect(found.missing.some((m) => m.includes("ugaEmail"))).toBe(true);
  });
});
