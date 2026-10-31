// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalHttpsUrl, MAX_URL_LENGTH } from "./url";

describe("canonicalHttpsUrl", () => {
  it.each([
    ["https://x.devpost.com/", "https://x.devpost.com/"],
    ["https://x.devpost.com", "https://x.devpost.com/"],
    ["http://x.devpost.com/", "https://x.devpost.com/"],
    ["x.devpost.com", "https://x.devpost.com/"],
    ["  https://X.DevPost.com/Rules  ", "https://x.devpost.com/Rules"],
    ["https://x.devpost.com/rules/", "https://x.devpost.com/rules"],
    ["https://x.devpost.com/rules///", "https://x.devpost.com/rules"],
    ["https://x.devpost.com/#top", "https://x.devpost.com/"],
    [
      "https://x.devpost.com/a?utm_source=x&UTM_medium=y",
      "https://x.devpost.com/a",
    ],
    [
      "https://x.devpost.com/a?fbclid=1&gclid=2&b=2&a=1",
      "https://x.devpost.com/a?a=1&b=2",
    ],
    ["https://x.example.org/?event=123", "https://x.example.org/?event=123"],
  ])("reads %s as %s", (input, expected) => {
    expect(canonicalHttpsUrl(input)).toBe(expected);
  });

  it("makes the same page typed two ways one key", () => {
    expect(canonicalHttpsUrl("HTTP://Hack.Example.com/a/?b=1&utm_x=2#f")).toBe(
      canonicalHttpsUrl("hack.example.com/a?b=1"),
    );
  });

  it("is idempotent", () => {
    const once = canonicalHttpsUrl("http://Hack.Example.com/a/?z=1&a=2#f")!;
    expect(canonicalHttpsUrl(once)).toBe(once);
  });

  it.each([
    "",
    "   ",
    "not a url",
    "ftp://x.devpost.com/",
    "javascript:alert(1)",
    "mailto:a@b.co",
    "https://localhost/",
    "https://localhost:3000/",
    "https://127.0.0.1/",
    "https://10.0.0.1/x",
    "https://[::1]/",
    "https://user:pw@x.devpost.com/",
    "https://user@x.devpost.com/",
    "https://",
  ])("refuses %j", (input) => {
    expect(canonicalHttpsUrl(input)).toBeNull();
  });

  it("refuses a link past the length limit and keeps one at it", () => {
    const base = "https://x.devpost.com/";
    const at = base + "a".repeat(MAX_URL_LENGTH - base.length);
    expect(canonicalHttpsUrl(at)).toBe(at);
    expect(canonicalHttpsUrl(at + "a")).toBeNull();
  });
});
