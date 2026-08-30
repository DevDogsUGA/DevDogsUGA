import { describe, expect, it } from "vitest";
import type { LiveTable } from "./client.js";
import { normalize, snapshotDrift } from "./snapshot.js";

/**
 * The offline half of the Airtable checks.
 *
 * The snapshot exists so pull-request CI can check the registry without a
 * credential. A check that cannot fail is worse than no check: it reports
 * success forever over a registry that has drifted, the exact failure the live
 * `verify` was written to catch.
 */

function live(name: string, fields: [string, string][]): LiveTable {
  return {
    id: `tbl${name}`,
    name,
    primaryFieldId: "fld0",
    fields: fields.map(([id, fieldName]) => ({
      id,
      name: fieldName,
      type: "singleLineText",
    })),
  };
}

describe("normalize", () => {
  it("sorts tables and fields so a refresh does not reorder itself", () => {
    const result = normalize([
      live("Zebra", [
        ["fld2", "beta"],
        ["fld1", "alpha"],
      ]),
      live("Apple", [["fld3", "gamma"]]),
    ]);

    expect(result.map((t) => t.name)).toEqual(["Apple", "Zebra"]);
    expect(result[1]?.fields.map((f) => f.name)).toEqual(["alpha", "beta"]);
  });

  it("drops field options, which change without the shape changing", () => {
    // A date format, a precision, a checkbox icon: all of them are the
    // officers' to change, and every such edit would otherwise land as a diff
    // in a file whose whole value is that a diff means something.
    const withOptions: LiveTable = {
      ...live("Members", [["fld1", "Joined"]]),
      fields: [
        {
          id: "fld1",
          name: "Joined",
          type: "dateTime",
          options: {
            timeZone: "utc",
            dateFormat: { name: "iso" },
            timeFormat: { name: "24hour" },
          },
        },
      ],
    };

    const [table] = normalize([withOptions]);
    expect(table?.fields[0]).toEqual({
      id: "fld1",
      name: "Joined",
      type: "dateTime",
    });
    expect(table?.fields[0]).not.toHaveProperty("options");
  });

  /**
   * The one exception, and why it is carved out: `verify.ts` compares a
   * declared choice list against the base, and a choice renamed in the UI is a
   * schema change rather than a restyle. `snapshotDrift` does not compare them
   * yet. These assertions are about the data being present and stable, which a
   * later offline comparison would need and a refresh cannot be re-run to add.
   */
  describe("choice names", () => {
    const select = (options: Record<string, unknown>): LiveTable => ({
      ...live("Meetings", [["fld1", "Kind"]]),
      fields: [{ id: "fld1", name: "Kind", type: "singleSelect", options }],
    });

    it("keeps the names, drops the colours and ids around them", () => {
      const [table] = normalize([
        select({
          choices: [
            { id: "sel0", name: "Workshop", color: "blueLight2" },
            { id: "sel1", name: "Social", color: "redBright" },
          ],
        }),
      ]);

      expect(table?.fields[0]).toEqual({
        id: "fld1",
        name: "Kind",
        type: "singleSelect",
        options: { choices: [{ name: "Social" }, { name: "Workshop" }] },
      });
    });

    it("sorts them, so a drag in the UI is not a diff", () => {
      // Choice order is the officer's to arrange and nothing reads it, so an
      // unsorted list would rewrite itself on the next refresh and bury the
      // real change underneath.
      const [table] = normalize([
        select({ choices: [{ name: "Zeta" }, { name: "Alpha" }] }),
      ]);
      expect(
        (table?.fields[0]?.options?.choices as { name: string }[]).map(
          (c) => c.name,
        ),
      ).toEqual(["Alpha", "Zeta"]);
    });

    it("keeps only the choices out of a bag that holds more", () => {
      const [table] = normalize([
        select({
          choices: [{ id: "sel0", name: "Workshop", color: "grayLight1" }],
          somethingAirtableAddedLater: true,
        }),
      ]);
      expect(table?.fields[0]?.options).toEqual({
        choices: [{ name: "Workshop" }],
      });
    });

    it("emits no options at all for a select with an empty list", () => {
      // An undeclared select starts empty and stays the officers' to fill, so
      // it keeps exactly the shape every field had before choices were kept.
      const [table] = normalize([select({ choices: [] })]);
      expect(table?.fields[0]).not.toHaveProperty("options");
    });

    it("degrades rather than throwing on an unfamiliar shape", () => {
      // A refresh that throws leaves the committed snapshot stale, which is
      // the one state in which the offline check passes forever over a
      // registry that has drifted.
      for (const choices of ["Workshop", [null], [{ id: "sel0" }], 7]) {
        expect(() => normalize([select({ choices })])).not.toThrow();
      }
      const [table] = normalize([select({ choices: [{ id: "sel0" }] })]);
      expect(table?.fields[0]).not.toHaveProperty("options");
    });
  });
});

describe("snapshotDrift", () => {
  it("reports nothing when the snapshot has everything the registry declares", () => {
    const snapshot = { tables: [] as LiveTable[] };
    // An empty snapshot cannot satisfy the registry, so every table is absent,
    // which is itself proof that the check is capable of failing.
    expect(snapshotDrift(snapshot).length).toBeGreaterThan(0);
  });

  it("flags a table the snapshot does not have at all", () => {
    const drift = snapshotDrift({ tables: [] });
    expect(drift.every((d) => d.absent)).toBe(true);
    expect(drift.map((d) => d.table)).toContain("Members");
  });
});
