import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./returnPath";

describe("safeReturnPath", () => {
  it("keeps a same-site path with its query and hash", () => {
    expect(safeReturnPath("/attendance/complete")).toBe("/attendance/complete");
    expect(safeReturnPath("/tools/oauth/connect?state=a%2Fb&x=1#top")).toBe(
      "/tools/oauth/connect?state=a%2Fb&x=1#top",
    );
  });

  it.each([
    ["an absolute URL", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example/x"],
    ["a backslash host", "/\\evil.example"],
    ["a tab inside the slashes", "/\t/evil.example"],
    ["a newline", "/ok\n/evil"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a bare word", "settings"],
    ["the sign-in route", "/auth?callbackPath=/x"],
    ["the recovery page", "/auth/failed"],
    ["an oversized value", `/${"a".repeat(3000)}`],
    ["an empty string", ""],
    ["dot segments that collapse to //", "/.//evil.example"],
    ["a parent segment that collapses to //", "/a/..//evil.example"],
    ["an encoded dot segment", "/%2e//evil.example"],
    ["an encoded parent segment", "/%2e%2e//evil.example"],
  ])("falls back for %s", (_label, raw) => {
    expect(safeReturnPath(raw)).toBe("/");
  });

  it("is idempotent", () => {
    const once = safeReturnPath("/a/./b?x=1#h");
    expect(safeReturnPath(once)).toBe(once);
  });

  it("falls back for null and undefined, and honours a custom fallback", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined, "/home")).toBe("/home");
  });
});
