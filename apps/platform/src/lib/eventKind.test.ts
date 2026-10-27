import { MEETING_CATEGORIES } from "@devdogsuga/events";
import { describe, expect, it } from "vitest";
import { categoryOf, EVENT_CATEGORIES } from "./eventKind";

describe("categoryOf (D12)", () => {
  it.each(EVENT_CATEGORIES)("reads the resolved category %s", (category) => {
    expect(categoryOf({ category })).toBe(category);
  });

  it("matches the categories the events config allows", () => {
    expect([...EVENT_CATEGORIES]).toEqual([...MEETING_CATEGORIES]);
  });

  it("falls back to build for a row reconcile has not rewritten", () => {
    expect(categoryOf({ category: null })).toBe("build");
  });

  it("falls back to build for an unknown category", () => {
    expect(categoryOf({ category: "hack-night" })).toBe("build");
  });

  it("does not inherit from Object.prototype", () => {
    expect(categoryOf({ category: "constructor" })).toBe("build");
  });

  it("is not changed by workshops on the night: the category is authored", () => {
    expect(categoryOf({ category: "build" })).toBe("build");
  });
});
