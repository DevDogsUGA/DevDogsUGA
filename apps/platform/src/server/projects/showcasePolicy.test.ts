import { describe, expect, it } from "vitest";
import {
  DISPLAY_ORDER_LIMIT,
  isShowcaseUrl,
  parseShowcaseInput,
  SHOWCASE_LIMITS,
} from "./showcasePolicy";

function values(input: unknown) {
  const parsed = parseShowcaseInput(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
  return parsed.values;
}
function errors(input: unknown) {
  const parsed = parseShowcaseInput(input);
  if (parsed.ok) throw new Error("expected a refusal");
  return parsed.fieldErrors;
}

describe("isShowcaseUrl", () => {
  it.each([
    "https://dogdays.dev",
    "https://github.com/DevDogsUGA/DogDays?tab=readme#top",
    "/",
    "/docs",
    "/docs/platform?x=1",
  ])("accepts %s", (url) => expect(isShowcaseUrl(url)).toBe(true));

  it.each([
    ["script", "javascript:alert(1)"],
    ["data", "data:text/html,<script>1</script>"],
    ["plain http", "http://dogdays.dev"],
    ["protocol-relative", "//evil.example"],
    ["backslash host", "/\\evil.example"],
    ["credentials", "https://user:pw@dogdays.dev"],
    ["no host", "https://"],
    ["whitespace", "https://dogdays.dev/a b"],
    ["control character", "https://dogdays.dev/\u0000"],
    ["relative", "docs"],
    ["mailto", "mailto:devdogs@uga.edu"],
    ["too long", `https://dogdays.dev/${"a".repeat(SHOWCASE_LIMITS.url)}`],
  ])("refuses %s", (_name, url) => expect(isShowcaseUrl(url)).toBe(false));
});

describe("parseShowcaseInput", () => {
  it("returns only the fields given, so absent ones are left alone", () => {
    expect(values({ featured: true })).toEqual({ featured: true });
    expect(values({})).toEqual({});
  });

  it("trims text and turns a blank or null into a cleared field", () => {
    expect(
      values({
        tagline: "  Study Group Finder ",
        note: "   ",
        yearLabel: null,
      }),
    ).toEqual({ tagline: "Study Group Finder", note: null, yearLabel: null });
  });

  it("accepts registry keys and nothing else for the icon and color", () => {
    expect(values({ iconKey: "DogPackIcon", colorKey: "purple-500" })).toEqual({
      iconKey: "DogPackIcon",
      colorKey: "purple-500",
    });
    expect(errors({ iconKey: "<svg onload=x>" })).toHaveProperty("iconKey");
    expect(errors({ colorKey: "red-600; background:url(x)" })).toHaveProperty(
      "colorKey",
    );
    expect(errors({ colorKey: "#ff0000" })).toHaveProperty("colorKey");
    // A message names the vocabulary; it does not echo the rejected value.
    expect(errors({ iconKey: "<svg onload=x>" }).iconKey).not.toContain("svg");
  });

  it("clears an icon with null or a blank", () => {
    expect(values({ iconKey: null, colorKey: "" })).toEqual({
      iconKey: null,
      colorKey: null,
    });
  });

  it("accepts open and closed as the contribution mode", () => {
    expect(values({ contributionMode: "open" })).toEqual({
      contributionMode: "open",
    });
    expect(errors({ contributionMode: "invite-only" })).toHaveProperty(
      "contributionMode",
    );
  });

  it("holds each text field to the table's limit", () => {
    for (const field of [
      "tagline",
      "yearLabel",
      "note",
      "showcaseLabel",
      "liveLabel",
      "switcherBlurb",
    ] as const) {
      const max = SHOWCASE_LIMITS[field];
      expect(values({ [field]: "a".repeat(max) })).toEqual({
        [field]: "a".repeat(max),
      });
      expect(errors({ [field]: "a".repeat(max + 1) })).toHaveProperty(field);
    }
  });

  it("holds both links to the allowlist, and clears them when blank", () => {
    expect(
      values({ liveUrl: "https://dogdays.dev", switcherUrl: "/docs" }),
    ).toEqual({ liveUrl: "https://dogdays.dev", switcherUrl: "/docs" });
    expect(errors({ liveUrl: "javascript:alert(1)" })).toHaveProperty(
      "liveUrl",
    );
    expect(errors({ switcherUrl: "//evil.example" })).toHaveProperty(
      "switcherUrl",
    );
    expect(values({ liveUrl: " ", switcherUrl: null })).toEqual({
      liveUrl: null,
      switcherUrl: null,
    });
  });

  it("takes whole display orders within the limit", () => {
    expect(values({ displayOrder: -3 })).toEqual({ displayOrder: -3 });
    expect(errors({ displayOrder: 1.5 })).toHaveProperty("displayOrder");
    expect(errors({ displayOrder: DISPLAY_ORDER_LIMIT + 1 })).toHaveProperty(
      "displayOrder",
    );
    expect(errors({ displayOrder: "3" })).toHaveProperty("displayOrder");
  });

  it("takes the toggles as booleans only", () => {
    expect(values({ featured: false, inSwitcher: true })).toEqual({
      featured: false,
      inSwitcher: true,
    });
    expect(errors({ featured: "true" })).toHaveProperty("featured");
  });

  it("refuses a field that is not a showcase field", () => {
    for (const field of ["status", "devdogsOwned", "docsRepoId", "name"])
      expect(errors({ [field]: "x" })).toEqual({
        [field]: "That field cannot be changed here.",
      });
  });
});
