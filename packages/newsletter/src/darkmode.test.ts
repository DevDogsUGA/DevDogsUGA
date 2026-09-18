import { describe, expect, it } from "vitest";
import {
  bc,
  brc,
  darkModeCss,
  DOT_GRID_CLASS,
  paintCss,
  SLANTS_CLASS,
  tc,
} from "./darkmode.js";
import { chipColors, KIND, PALETTE, UGA } from "./theme.js";

describe("class helpers", () => {
  it("name the hex they pin", () => {
    expect(tc("#f3f1f6")).toBe("tc-f3f1f6");
    expect(bc("#13121b")).toBe("bc-13121b");
    expect(brc("#332f40")).toBe("brc-332f40");
  });
});

describe("paintCss", () => {
  const css = paintCss();

  it("paints each background class with its color and gradient underlay", () => {
    for (const color of [PALETTE.bg, PALETTE.bar, PALETTE.card, UGA]) {
      expect(css).toContain(
        `.${bc(color)}{background-color:${color};background-image:linear-gradient(${color},${color})}`,
      );
    }
  });

  it("paints the textures after the flat rules so their image layer wins", () => {
    // Same specificity, one class each — source order is the tiebreak.
    const lastFlat = css.lastIndexOf(".bc-");
    expect(css.indexOf(`.${SLANTS_CLASS}{`)).toBeGreaterThan(lastFlat);
    expect(css.indexOf(`.${DOT_GRID_CLASS}{`)).toBeGreaterThan(lastFlat);
    expect(css).toContain(`.${DOT_GRID_CLASS}{background-color:${PALETTE.bar}`);
  });

  it("carries no !important, so the dark-mode pins outrank it", () => {
    expect(css).not.toContain("!important");
  });
});

describe("darkModeCss", () => {
  const css = darkModeCss();

  it("tells scheme-aware clients the email handles both schemes", () => {
    expect(css).toContain(
      ":root{color-scheme:light dark;supported-color-schemes:light dark}",
    );
  });

  it("duplicates every pin under the media query and the Outlook hooks", () => {
    // One representative of each property; the render test covers coverage.
    for (const rule of [
      `.${tc(PALETTE.ink)}{color:${PALETTE.ink} !important}`,
      `.${bc(PALETTE.card)}{background-color:${PALETTE.card} !important}`,
      `.${brc(PALETTE.border)}{border-color:${PALETTE.border} !important}`,
    ]) {
      expect(css).toContain(rule);
    }
    expect(css).toContain(`[data-ogsc] .${tc(PALETTE.ink)}{`);
    expect(css).toContain(`[data-ogsb] .${tc(PALETTE.ink)}{`);
    expect(css).toContain(`[data-ogsb] .${bc(PALETTE.card)}{`);
  });

  it("armors scoped background pins with the inset shadow, and only those", () => {
    // Carrier probe against outlook.com dark mode (2026-09-11): the transform
    // injects computed background repaints inline with !important — which no
    // stylesheet color can beat — but does not process box-shadow. The armor
    // repaints the authored color on top, and lives only under the data-og*
    // scopes so no other client ever renders it (an inset shadow would paint
    // over the bar textures everywhere box-shadow works).
    const armor = (color: string) =>
      `box-shadow:inset 0 0 0 3000px ${color} !important`;
    for (const scope of ["[data-ogsc]", "[data-ogsb]"]) {
      expect(css).toContain(
        `${scope} .${bc(PALETTE.bg)}{background-color:${PALETTE.bg} !important;${armor(PALETTE.bg)}}`,
      );
    }
    const mediaLayer = css.slice(0, css.indexOf("[data-ogsc]"));
    expect(mediaLayer).toContain(`.${bc(PALETTE.bg)}{`);
    expect(mediaLayer).not.toContain("box-shadow");
    expect(css).not.toContain(
      `[data-ogsb] .${tc(PALETTE.ink)}{color:${PALETTE.ink} !important;box-shadow`,
    );
    // Outlook.com only keeps ancestor-scoped attribute selectors; a compound
    // form (`.x[data-ogsc]`) risks the sanitizer dropping the whole rule.
    expect(css).not.toContain("[data-ogsc],");
    expect(css).not.toContain(`.${tc(PALETTE.ink)}[data-ogsc]`);
  });

  it("covers the flattened chip colors on both card grounds", () => {
    for (const ground of [PALETTE.card, PALETTE.card2]) {
      for (const kind of Object.values(KIND)) {
        const chip = chipColors(kind, ground);
        expect(css).toContain(`.${tc(chip.text)}{color:${chip.text}`);
        expect(css).toContain(
          `.${bc(chip.fill)}{background-color:${chip.fill}`,
        );
        expect(css).toContain(
          `.${brc(chip.border)}{border-color:${chip.border}`,
        );
      }
    }
    expect(css).toContain(`.${bc(UGA)}{background-color:${UGA}`);
  });
});
