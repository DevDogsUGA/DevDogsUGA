import { describe, expect, it } from "vitest";
import {
  findOutOfOrderMigrations,
  latestMigrationTimestamp,
  migrationTimestamp,
} from "./migration-order.js";

describe("migrationTimestamp", () => {
  it("reads the leading digit run", () => {
    expect(migrationTimestamp("20260925120000_33_platform_oauth.sql")).toBe(
      "20260925120000",
    );
  });

  it("is null for a filename with no leading timestamp", () => {
    expect(migrationTimestamp("README.md")).toBeNull();
  });
});

describe("latestMigrationTimestamp", () => {
  it("is the newest of several", () => {
    expect(
      latestMigrationTimestamp([
        "20260101000000_a.sql",
        "20260925120000_b.sql",
        "20260601000000_c.sql",
      ]),
    ).toBe("20260925120000");
  });

  it("is null for an empty set, the state before the first migration ever landed", () => {
    expect(latestMigrationTimestamp([])).toBeNull();
  });

  it("skips names it cannot read a timestamp from", () => {
    expect(
      latestMigrationTimestamp(["README.md", "20260101000000_a.sql"]),
    ).toBe("20260101000000");
  });
});

describe("findOutOfOrderMigrations", () => {
  it("flags a new file timestamped before the base branch's newest", () => {
    const violations = findOutOfOrderMigrations(
      ["20260920000000_34_platform_stale.sql"],
      "20260925120000",
    );
    expect(violations).toEqual([
      {
        filename: "20260920000000_34_platform_stale.sql",
        timestamp: "20260920000000",
      },
    ]);
  });

  it("passes a new file timestamped after the base branch's newest", () => {
    expect(
      findOutOfOrderMigrations(
        ["20260926000000_34_platform_new.sql"],
        "20260925120000",
      ),
    ).toEqual([]);
  });

  it("passes everything when the base branch has no migrations yet", () => {
    expect(findOutOfOrderMigrations(["20260101000000_a.sql"], null)).toEqual(
      [],
    );
  });

  it("skips an added file with no readable timestamp", () => {
    expect(findOutOfOrderMigrations(["README.md"], "20260925120000")).toEqual(
      [],
    );
  });

  it("flags every out-of-order file, not just the first", () => {
    const violations = findOutOfOrderMigrations(
      ["20260101000000_a.sql", "20260926000000_b.sql", "20260201000000_c.sql"],
      "20260925120000",
    );
    expect(violations.map((v) => v.filename)).toEqual([
      "20260101000000_a.sql",
      "20260201000000_c.sql",
    ]);
  });
});
