import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_COLOR,
  FALLBACK_ICON,
  SHOWCASE_COLOR_KEYS,
  SHOWCASE_COLORS,
  SHOWCASE_ICON_KEYS,
  SHOWCASE_ICONS,
  showcaseColor,
  showcaseIcon,
} from "./showcaseKeys";

// Vitest runs from the app's directory.
const TRIGGER = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/schemas/platform/functions/validate_project_showcase.sql",
  ),
  "utf8",
);

/** The quoted keys in the trigger's `not in (...)` list for one column. */
function triggerKeys(column: "iconKey" | "colorKey"): string[] {
  const match = new RegExp(`"${column}" not in \\(([^)]*)\\)`).exec(TRIGGER);
  if (!match) throw new Error(`no ${column} list in the trigger`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((key) => key[1]!);
}

describe("showcase key registries", () => {
  it("name exactly the icons the database trigger accepts", () => {
    expect([...SHOWCASE_ICON_KEYS].sort()).toEqual(
      triggerKeys("iconKey").sort(),
    );
  });

  it("name exactly the colors the database trigger accepts", () => {
    expect([...SHOWCASE_COLOR_KEYS].sort()).toEqual(
      triggerKeys("colorKey").sort(),
    );
  });

  it("draws the platform's key as the mascot and the apps' keys as their marks", () => {
    expect(SHOWCASE_ICONS.HouseIcon).toMatchObject({ logo: true });
    expect(SHOWCASE_ICONS.DogDaysIcon.homeMark).toBe("dogdays");
    expect(SHOWCASE_ICONS.dogpack.homeMark).toBe("dogpack");
  });

  it("gives every color a Tailwind text class and nothing else", () => {
    for (const value of Object.values(SHOWCASE_COLORS))
      expect(value).toMatch(/^text-[a-z]+(-\d{3})?$/);
  });
});

describe("showcaseIcon and showcaseColor", () => {
  it("resolve a registered key", () => {
    expect(showcaseIcon("DogPackIcon")).toBe(SHOWCASE_ICONS.DogPackIcon);
    expect(showcaseColor("purple-500")).toBe("text-purple-500");
  });

  it("fall back for an absent or unknown key, never reading it as a class or a property", () => {
    expect(showcaseIcon(null)).toBe(FALLBACK_ICON);
    expect(showcaseIcon("toString")).toBe(FALLBACK_ICON);
    expect(showcaseIcon("<script>")).toBe(FALLBACK_ICON);
    expect(showcaseColor(null)).toBe(FALLBACK_COLOR);
    expect(showcaseColor("constructor")).toBe(FALLBACK_COLOR);
    expect(showcaseColor("red-600; background:url(x)")).toBe(FALLBACK_COLOR);
  });
});
