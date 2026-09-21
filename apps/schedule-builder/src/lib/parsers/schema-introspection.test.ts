import { describe, expect, it } from "vitest";
import { offerings } from "~/server/db/schema";
import { detectTarget } from "./schema-introspection";

describe("detectTarget", () => {
  it("uses every column in a table-level composite primary key", () => {
    const target = detectTarget(offerings);

    expect(target.uniqueKeys).toEqual(["academicPeriod", "crn"]);
    expect(Array.isArray(target.target)).toBe(true);
    expect(target.isSerialOnly).toBe(false);
  });
});
