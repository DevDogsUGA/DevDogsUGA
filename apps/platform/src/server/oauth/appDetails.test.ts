import { describe, expect, it } from "vitest";
import {
  appLogoPath,
  isAppLogoPath,
  isHttpsUrl,
  parseDetailUrl,
} from "./appDetails";

const APP = "11111111-1111-4111-8111-111111111111";

describe("app logo path", () => {
  const V = "22222222-2222-4222-8222-222222222222";
  it("is a per-upload path in the app's folder under apps/", () => {
    expect(appLogoPath(APP, V)).toBe(`apps/${APP}/${V}.webp`);
  });

  it("recognises only this app's upload paths", () => {
    expect(isAppLogoPath(APP, `apps/${APP}/${V}.webp`)).toBe(true);
    expect(isAppLogoPath(APP, `apps/${APP}.webp`)).toBe(false);
    expect(isAppLogoPath(APP, `apps/${V}/${V}.webp`)).toBe(false);
    expect(isAppLogoPath(APP, `apps/${APP}/../x/${V}.webp`)).toBe(false);
    expect(isAppLogoPath(APP, `apps/${APP}/${V}.png`)).toBe(false);
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
