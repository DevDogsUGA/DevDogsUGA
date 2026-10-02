import { describe, expect, it } from "vitest";
import { isOs, stackOf } from "./setup";

describe("stackOf", () => {
  it("takes a single-stack project's own stack", () => {
    expect(stackOf("/docs/platform/guides/support-widget")).toBe("nextjs");
    expect(stackOf("/docs/study-group-finder")).toBe("flutter");
  });

  it("takes a workshop's track from its path", () => {
    expect(stackOf("/docs/workshops/supabase/flutter/02-sign-in")).toBe(
      "flutter",
    );
    expect(stackOf("/docs/workshops/framework-intros/nextjs/setup")).toBe(
      "nextjs",
    );
  });

  it("is null where a page serves both stacks, or isn't docs", () => {
    expect(stackOf("/docs/workshops/git-and-github")).toBeNull();
    expect(stackOf("/docs/toolkit/guides/devtools-db")).toBeNull();
    expect(stackOf("/teams")).toBeNull();
    expect(stackOf("/docs")).toBeNull();
  });

  it("ignores names inherited from Object.prototype", () => {
    expect(stackOf("/docs/constructor/toString")).toBeNull();
  });
});

describe("isOs", () => {
  it("accepts the docs platforms only", () => {
    expect(isOs("wsl")).toBe(true);
    expect(isOs("toString")).toBe(false);
    expect(isOs(null)).toBe(false);
  });
});
