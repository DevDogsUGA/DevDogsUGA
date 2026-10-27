import { describe, expect, it } from "vitest";
import { appLogoPath, isHttpsUrl, parseDetailUrl } from "./appDetails";

const APP = "11111111-1111-4111-8111-111111111111";

describe("app logo path", () => {
  it("is one fixed path under apps/ in the bucket", () => {
    expect(appLogoPath(APP)).toBe(`apps/${APP}.webp`);
  });
});

describe("detail urls", () => {
  it("accepts https and refuses the rest", () => {
    expect(isHttpsUrl("https://app.example.com/privacy")).toBe(true);
    expect(isHttpsUrl("http://app.example.com")).toBe(false);
    expect(isHttpsUrl("https://user:pw@app.example.com")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("https://")).toBe(false);
    expect(isHttpsUrl(`https://a.example/${"x".repeat(2100)}`)).toBe(false);
  });

  it("treats blank as unset and names the bad field", () => {
    expect(parseDetailUrl("Homepage", "  ")).toEqual({
      value: null,
      error: null,
    });
    expect(parseDetailUrl("Homepage", " https://a.example ").value).toBe(
      "https://a.example",
    );
    expect(parseDetailUrl("Privacy policy", "http://a.example").error).toMatch(
      /^Privacy policy must be an https/,
    );
  });
});
