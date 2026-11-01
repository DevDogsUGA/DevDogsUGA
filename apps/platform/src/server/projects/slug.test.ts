import { describe, expect, it } from "vitest";
import {
  isProjectSlug,
  isReservedProjectSlug,
  RESERVED_PROJECT_SLUGS,
} from "./slug";
describe("project slugs", () => {
  it.each(["ab", "my-project-12", "a".repeat(80)])("accepts %s", (slug) =>
    expect(isProjectSlug(slug)).toBe(true),
  );
  it.each([
    "",
    "a",
    "a".repeat(81),
    "A-project",
    "a_b",
    "-ab",
    "ab-",
    "a--b",
    " ab",
    "ab\n",
  ])("rejects %s", (slug) => expect(isProjectSlug(slug)).toBe(false));
  it("reserves the platform and current Docs namespaces", () => {
    for (const slug of RESERVED_PROJECT_SLUGS)
      expect(isReservedProjectSlug(slug)).toBe(true);
    expect(isReservedProjectSlug("my-project")).toBe(false);
  });
});
