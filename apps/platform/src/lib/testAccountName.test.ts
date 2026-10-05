import { describe, expect, it } from "vitest";
import { testAccountName } from "./testAccountName";

describe("testAccountName", () => {
  it("prefers full_name, which a rename updates", () => {
    expect(testAccountName({ full_name: "New Name", name: "Old Name" })).toBe(
      "New Name",
    );
  });

  it("falls back to name", () => {
    expect(testAccountName({ name: "Only Name" })).toBe("Only Name");
  });

  it("falls back to a placeholder for missing or blank metadata", () => {
    expect(testAccountName(null)).toBe("Test User");
    expect(testAccountName({ full_name: "  " })).toBe("Test User");
    expect(testAccountName({ display_name: "Never Written" })).toBe(
      "Test User",
    );
  });
});
