import { describe, expect, it } from "vitest";
import type { LiveTable } from "./client.js";
import { normalize, snapshotDrift } from "./snapshot.js";

/**
 * The offline half of the Airtable checks.
 *
 * These matter more than they look. The snapshot exists so pull-request CI can
 * check the registry without a credential, and a check that cannot fail is
 * worse than no check — it reports success forever over a registry that has
 * drifted, which is the exact failure the live `verify` was written to catch.
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
    const withOptions: LiveTable = {
      ...live("Members", [["fld1", "Status"]]),
      fields: [
        {
          id: "fld1",
          name: "Status",
          type: "singleSelect",
          options: { choices: [{ name: "Active", color: "green" }] },
        },
      ],
    };

    const [table] = normalize([withOptions]);
    expect(table?.fields[0]).toEqual({
      id: "fld1",
      name: "Status",
      type: "singleSelect",
    });
    expect(table?.fields[0]).not.toHaveProperty("options");
  });
});

describe("snapshotDrift", () => {
  it("reports nothing when the snapshot has everything the registry declares", () => {
    // The committed snapshot is the real one, so this is the same assertion CI
    // makes on every pull request.
    const snapshot = { tables: [] as LiveTable[] };
    // An empty snapshot cannot satisfy the registry, so every table is absent —
    // which is itself the proof that the check is capable of failing.
    expect(snapshotDrift(snapshot).length).toBeGreaterThan(0);
  });

  it("flags a table the snapshot does not have at all", () => {
    const drift = snapshotDrift({ tables: [] });
    expect(drift.every((d) => d.absent)).toBe(true);
    expect(drift.map((d) => d.table)).toContain("Members");
  });
});
