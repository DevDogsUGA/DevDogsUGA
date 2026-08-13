import { describe, expect, it } from "vitest";
import { compareSync, syncIsClean } from "./sync.js";

/**
 * The half of the GitHub sync that can be wrong quietly.
 *
 * GitHub secrets are write-only, so this comparison is the ONLY signal that the
 * second copy is current. If it reports healthy when it is not, a rotation sits
 * in Bitwarden while production keeps authenticating with the old credential —
 * and the way that surfaces is the old credential being revoked, not anything
 * here.
 */

const OLD = "2026-08-01T00:00:00Z";
const NEW = "2026-08-10T00:00:00Z";

describe("compareSync", () => {
  it("classifies every key exactly once", () => {
    const status = compareSync(
      [
        { key: "CURRENT", revisionDate: OLD },
        { key: "ROTATED", revisionDate: NEW },
        { key: "NEW_KEY", revisionDate: NEW },
      ],
      [
        { name: "CURRENT", updatedAt: NEW },
        { name: "ROTATED", updatedAt: OLD },
        { name: "REMOVED", updatedAt: OLD },
      ],
    );

    expect(status).toEqual({
      current: ["CURRENT"],
      stale: ["ROTATED"],
      missing: ["NEW_KEY"],
      orphaned: ["REMOVED"],
    });
  });

  it("calls a secret stale when GitHub predates the Bitwarden revision", () => {
    // The failure this whole file exists for: rotated in Bitwarden, never
    // pushed. Names match, counts match, and everything downstream is still
    // using the previous value.
    const status = compareSync(
      [{ key: "DB_URL", revisionDate: NEW }],
      [{ name: "DB_URL", updatedAt: OLD }],
    );
    expect(status.stale).toEqual(["DB_URL"]);
    expect(syncIsClean(status)).toBe(false);
  });

  it("does not call a secret stale when GitHub is newer", () => {
    const status = compareSync(
      [{ key: "DB_URL", revisionDate: OLD }],
      [{ name: "DB_URL", updatedAt: NEW }],
    );
    expect(status.current).toEqual(["DB_URL"]);
    expect(syncIsClean(status)).toBe(true);
  });

  it("treats an equal timestamp as current, not stale", () => {
    // A push immediately after an edit can land on the same second. Calling
    // that stale would make a correct sync report a problem every time.
    const status = compareSync(
      [{ key: "K", revisionDate: NEW }],
      [{ name: "K", updatedAt: NEW }],
    );
    expect(status.current).toEqual(["K"]);
  });

  it("treats an unknown or unparseable date as current", () => {
    // "Unknown means stale" would have the report cry wolf, and a report
    // nobody reads is worse than none -- including on the run where something
    // really is behind.
    expect(
      compareSync([{ key: "K" }], [{ name: "K", updatedAt: OLD }]).current,
    ).toEqual(["K"]);
    expect(
      compareSync(
        [{ key: "K", revisionDate: "not a date" }],
        [{ name: "K", updatedAt: OLD }],
      ).current,
    ).toEqual(["K"]);
  });

  it("ignores keys that belong to another environment", () => {
    // production and production-apply share one Bitwarden project, so each
    // sees the other's keys and neither may report them as a gap.
    const status = compareSync(
      [
        { key: "DB_URL", revisionDate: OLD },
        { key: "AIRTABLE_APPLY_PAT", revisionDate: OLD },
      ],
      [{ name: "DB_URL", updatedAt: NEW }],
      ["AIRTABLE_APPLY_PAT"],
    );

    expect(status.missing).toEqual([]);
    expect(syncIsClean(status)).toBe(true);
  });

  it("does not report an ignored key as orphaned either", () => {
    // The mirror case: `production-apply` holds the apply-only keys, and
    // `production`'s status run must not call them strays.
    const status = compareSync(
      [{ key: "DB_URL", revisionDate: OLD }],
      [
        { name: "DB_URL", updatedAt: NEW },
        { name: "AIRTABLE_APPLY_PAT", updatedAt: NEW },
      ],
      ["AIRTABLE_APPLY_PAT"],
    );
    expect(status.orphaned).toEqual([]);
  });

  it("reports an empty GitHub environment as entirely missing", () => {
    // The first run. It must not read as "nothing to do".
    const status = compareSync([{ key: "A" }, { key: "B" }], []);
    expect(status.missing).toEqual(["A", "B"]);
    expect(syncIsClean(status)).toBe(false);
  });
});
