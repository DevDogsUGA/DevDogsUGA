/**
 * The style is checked against the file it was read from.
 *
 * `apps/platform/public/attendance/qr.svg` is parsed into a grid and rendered
 * back; every module must land at the same place with the same corners
 * rounded, the eyes and the logo at the same coordinates and scales. That
 * is the whole claim of `style.ts`, so it is the whole test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../instance.js";
import { clearedModules } from "./logo.js";
import type { Grid } from "./matrix.js";
import { renderSvg, tile } from "./style.js";

const REFERENCE = join(PROJECT_ROOT, "apps/platform/public/attendance/qr.svg");
const MODULE = 27;
const ORIGIN = 54;
const SIZE = 33;

/** The reference's nine tile paths, by which corners they round. */
const REFERENCE_TILES: Record<string, string> = {
  '<rect width="6" height="6"></rect>': "",
  '<circle cx="3" cy="3" r="3"></circle>': "tl,tr,br,bl",
  '<path d="M6,6H0V3c0-1.7,1.3-3,3-3h0c1.7,0,3,1.3,3,3V6z"></path>': "tl,tr",
  '<path d="M6,6H0V3c0-1.7,1.3-3,3-3l3,0V6z"></path>': "tl",
  '<path d="M6,6H0V0l3,0c1.7,0,3,1.3,3,3V6z"></path>': "tr",
  '<path d="M6,6H3C1.3,6,0,4.7,0,3v0c0-1.7,1.3-3,3-3h3C6,0,6,6,6,6z"></path>':
    "tl,bl",
  '<path d="M3,6H0V0l3,0c1.7,0,3,1.3,3,3v0C6,4.7,4.7,6,3,6z"></path>': "tr,br",
  '<path d="M3,6L3,6C1.3,6,0,4.7,0,3V0h6v3C6,4.7,4.7,6,3,6z"></path>': "br,bl",
  '<path d="M3,6H0V0l6,0v3C6,4.7,4.7,6,3,6z"></path>': "br",
  '<path d="M6,6H3C1.3,6,0,4.7,0,3V0l6,0V6z"></path>': "bl",
};

interface Placed {
  x: number;
  y: number;
  shape: string;
}

function modulesOf(svg: string): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const re =
    /<g transform="translate\(([\d.]+),([\d.]+)\) scale\(([\d.]+)\)">(.*?)<\/g>/g;
  for (const m of svg.matchAll(re)) {
    expect(Number(m[3])).toBeCloseTo(4.635, 2);
    const x = (Number(m[1]) - ORIGIN) / MODULE;
    const y = (Number(m[2]) - ORIGIN) / MODULE;
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    out.set(`${x},${y}`, { x, y, shape: m[4]! });
  }
  return out;
}

function cornersOf(shape: string): string {
  const known = REFERENCE_TILES[shape];
  if (known !== undefined) return known;
  // Ours: rebuild each candidate and match.
  for (const mask of Object.values(REFERENCE_TILES)) {
    const set = new Set(mask.split(",").filter(Boolean));
    const candidate = tile({
      tl: set.has("tl"),
      tr: set.has("tr"),
      br: set.has("br"),
      bl: set.has("bl"),
    });
    if (candidate === shape) return mask;
  }
  throw new Error(`unrecognised tile ${shape}`);
}

const reference = readFileSync(REFERENCE, "utf8");
const referenceModules = modulesOf(reference);

/** The reference as a grid: its drawn modules, plus the finders it draws as eyes. */
const grid: Grid = {
  size: SIZE,
  version: 4,
  errorLevel: "H",
  isDark: (x, y) => {
    const finder = (v: number, start: number) => v >= start && v < start + 7;
    if (finder(x, 0) && finder(y, 0)) return true;
    if (finder(x, SIZE - 7) && finder(y, 0)) return true;
    if (finder(x, 0) && finder(y, SIZE - 7)) return true;
    return referenceModules.has(`${x},${y}`);
  },
};

const rendered = renderSvg(grid, {
  size: 999,
  margin: 2,
  color: "#ffffff",
  logo: {
    href: "data:image/png;base64,AA==",
    modules: 9,
    cleared: clearedModules({ modules: 9, padding: 0, gridSize: SIZE }),
  },
});
const ours = modulesOf(rendered);

describe("renderSvg against attendance/qr.svg", () => {
  it("draws the same modules", () => {
    expect([...ours.keys()].sort()).toEqual([...referenceModules.keys()].sort());
  });

  it("rounds the same corners on every module", () => {
    const mismatches: string[] = [];
    for (const [key, ref] of referenceModules) {
      const mine = ours.get(key)!;
      if (cornersOf(ref.shape) !== cornersOf(mine.shape)) {
        mismatches.push(
          `${key}: reference ${cornersOf(ref.shape) || "square"}, ours ${cornersOf(mine.shape) || "square"}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("places the eyes where the reference does, at the same scale", () => {
    const eyes = (svg: string) =>
      [...svg.matchAll(/translate\((\d+),(\d+)\)" fill="#ffffff"><g transform="scale\(([\d.]+)\)"/g)]
        .map((m) => `${m[1]},${m[2]}@${m[3]}`)
        .sort();
    expect(eyes(rendered)).toEqual(eyes(reference));
    expect(eyes(rendered)).toHaveLength(6);
  });

  it("places the logo in the same 243px box at (378,378)", () => {
    const box = (svg: string) =>
      /<image [^>]*?width="(\d+)" height="(\d+)" x="(\d+)" y="(\d+)"/.exec(svg)?.slice(1);
    expect(box(rendered)).toEqual(box(reference));
    expect(box(rendered)).toEqual(["243", "243", "378", "378"]);
  });

  it("is 999px with no background, like the reference", () => {
    expect(rendered).toContain('width="999" height="999" viewBox="0 0 999 999"');
    expect(rendered).not.toContain("<rect width=\"999\"");
  });
});

describe("tile", () => {
  it("is a circle when alone and a square when surrounded", () => {
    expect(tile({ tl: true, tr: true, br: true, bl: true })).toContain("<circle");
    expect(tile({ tl: false, tr: false, br: false, bl: false })).toContain("<rect");
  });

  it("uses a half-module arc for each rounded corner", () => {
    const d = tile({ tl: true, tr: false, br: true, bl: false });
    expect(d.match(/A3,3/g)).toHaveLength(2);
    expect(d).toMatch(/^<path d="M0,3A3,3 0 0 1 3,0H6V3A3,3 0 0 1 3,6H0Z"><\/path>$/);
  });
});

describe("renderSvg options", () => {
  it("adds a background rect only when asked", () => {
    const svg = renderSvg(grid, { size: 370, margin: 2, color: "#ba0c2f", background: "#000" });
    expect(svg).toContain('<rect width="370" height="370" fill="#000"></rect>');
    expect(svg).toContain('<g fill="#ba0c2f">');
    expect(svg).not.toContain("<image");
  });

  it("divides the size evenly across grid plus margins", () => {
    // 33 + 2×3 = 39 modules into 390px is 10px each: first data module at 30.
    const svg = renderSvg(grid, { size: 390, margin: 3, color: "#fff" });
    expect(svg).toContain('translate(30,30)" fill="#fff"><g transform="scale(5)">');
  });
});
