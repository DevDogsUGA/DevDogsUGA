import { describe, expect, it } from "vitest";
import { acceptRoleDescriptionInput } from "./roleDescriptionInput";

describe("acceptRoleDescriptionInput", () => {
  it("accepts ordinary single-line edits", () => {
    expect(acceptRoleDescriptionInput("Old", "New description")).toBe(
      "New description",
    );
  });

  it("blocks newlines", () => {
    expect(acceptRoleDescriptionInput("Keep this", "first\nsecond")).toBe(
      "Keep this",
    );
  });

  it("blocks consecutive whitespace", () => {
    expect(acceptRoleDescriptionInput("Keep this", "two  spaces")).toBe(
      "Keep this",
    );
    expect(acceptRoleDescriptionInput("Keep this", "space \t tab")).toBe(
      "Keep this",
    );
  });
});
