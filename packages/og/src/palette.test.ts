import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENT, MAUVE } from "./brand.js";
import { oklch } from "./oklch.js";

/**
 * The palette in `brand.ts` is transcribed from Tailwind's stylesheet by hand,
 * because Tailwind ships it as CSS and parsing that at render time would put
 * the shape of a `node_modules` file inside every Open Graph response.
 *
 * This is the other half of that trade. It reads the real stylesheet and
 * asserts the transcription still matches, so the drift the transcription
 * risks is caught at `pnpm test` rather than months later, on a banner, by eye.
 */
const require = createRequire(import.meta.url);
const theme = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");

/** `--color-mauve-400: oklch(71.1% 0.019 323.02);` → the hex it means. */
function fromStylesheet(token: string): string {
  const declaration = new RegExp(
    `--color-${token}:\\s*oklch\\(\\s*([\\d.]+)%\\s+([\\d.]+|none)\\s+([\\d.]+|none)\\s*\\)`,
  ).exec(theme);

  if (!declaration)
    throw new Error(`tailwindcss/theme.css declares no --color-${token}`);

  const [, lightness, chroma, hue] = declaration;

  // `none` is Tailwind's spelling of an achromatic hue, where the angle cannot
  // matter because chroma is zero.
  return oklch(
    Number(lightness) / 100,
    chroma === "none" ? 0 : Number(chroma),
    hue === "none" ? 0 : Number(hue),
  );
}

describe("the mauve ramp", () => {
  for (const [step, hex] of Object.entries(MAUVE)) {
    it(`mauve-${step} matches Tailwind`, () => {
      expect(hex).toBe(fromStylesheet(`mauve-${step}`));
    });
  }
});

describe("the project accents", () => {
  // Keyed the way `brand.ts` names them, valued the way Tailwind does.
  const tokens: Record<keyof typeof ACCENT, string> = {
    red400: "red-400",
    red700: "red-700",
    purple400: "purple-400",
    purple700: "purple-700",
    cyan400: "cyan-400",
    amber400: "amber-400",
    emerald400: "emerald-400",
  };

  for (const [name, token] of Object.entries(tokens)) {
    it(`${name} matches Tailwind's ${token}`, () => {
      expect(ACCENT[name as keyof typeof ACCENT]).toBe(fromStylesheet(token));
    });
  }
});

describe("oklch", () => {
  it("clips out-of-gamut colours into sRGB rather than wrapping", () => {
    // A chroma no sRGB primary can reach. Every channel must still land in
    // range: a wrapped byte would render as a wildly wrong colour rather than
    // as a slightly duller one.
    expect(oklch(0.7, 0.9, 150)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("renders an achromatic colour as a true grey", () => {
    const grey = oklch(0.5, 0, 0);
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7));
  });
});
