/**
 * The DevDogs QR style, as SVG.
 *
 * The model is `apps/platform/public/attendance/qr.svg`, and every rule here
 * was read off that file rather than invented:
 *
 *   * A module is a 6×6 unit tile, scaled to the module size and then a
 *     further 3% (the reference's `scale(4.635)` against a 27px module — the
 *     overlap is what stops rasterisers leaving hairlines between neighbours).
 *   * A tile's corner is rounded to a half-module radius exactly when BOTH
 *     modules that touch that corner orthogonally are empty. A lone module is
 *     therefore a circle, a module in a run is a rectangle, and the end of a
 *     run is a half-capsule.
 *   * The three finder patterns are not built from modules: each is one
 *     rounded-square frame (14 units, scaled to half a module) with a rounded
 *     3×3 ball two modules in. Alignment patterns ARE ordinary modules.
 *   * The logo sits in a centred box (9 of the reference's 33 modules) and
 *     every module in that box is cleared — the box, not the artwork's
 *     outline. Colour is one fill for everything; there is no background
 *     unless asked for.
 *
 * Nothing here touches the filesystem or `sharp`: given a grid and a logo
 * already turned into a data URI, this returns a string. That is what makes
 * it testable against the reference file module for module.
 */
import type { Grid } from "./matrix.js";

/** Reference eye frame: 14×14 units, outer radius 4.5, ring 2 units wide. */
const EYE_FRAME_PATH =
  "M4.5,14h5.1C12,14,14,12,14,9.6V4.5C14,2,12,0,9.5,0H4.4C2,0,0,2,0,4.4v5.1C0,12,2,14,4.5,14z M12,4.8v4.4 c0,1.5-1.3,2.8-2.8,2.8H4.8C3.2,12,2,10.8,2,9.2V4.8C2,3.3,3.3,2,4.8,2h4.4C10.8,2,12,3.2,12,4.8z";

/** Reference eye ball: 6×6 units, radius 1.7. */
const EYE_BALL_PATH =
  "M6,1.7v2.7C6,5.2,5.2,6,4.3,6H1.7C0.7,6,0,5.3,0,4.3V1.7C0,0.8,0.8,0,1.7,0h2.7C5.3,0,6,0.7,6,1.7z";

const FINDER = 7;
const TILE = 6;
const TILE_OVERLAP = 1.03;

export interface Logo {
  /** `data:` URI, any image type the consumer can draw. */
  href: string;
  /** Side of the box the logo is fitted into, in modules. */
  modules: number;
  /** Module indexes (`y * size + x`) not to draw. */
  cleared: ReadonlySet<number>;
}

export interface StyleOptions {
  /** Output side in px. The module size is whatever divides this evenly. */
  size: number;
  /** Quiet zone, in modules. The reference uses 2. */
  margin: number;
  /** Any CSS colour. */
  color: string;
  /** Omitted: transparent, like the reference. */
  background?: string;
  logo?: Logo;
}

/** Where the logo box sits, in module units from the symbol's top-left. */
export function logoBox(gridSize: number, logoModules: number) {
  const offset = (gridSize - logoModules) / 2;
  return { x: offset, y: offset, side: logoModules };
}

function isFinder(size: number, x: number, y: number): boolean {
  const inRange = (v: number, start: number) =>
    v >= start && v < start + FINDER;
  return (
    (inRange(x, 0) && inRange(y, 0)) ||
    (inRange(x, size - FINDER) && inRange(y, 0)) ||
    (inRange(x, 0) && inRange(y, size - FINDER))
  );
}

/**
 * A module tile with the given corners rounded, in the 6×6 unit space.
 *
 * Four corners is a circle and none is a square; both get the element the
 * reference uses for them rather than an equivalent path, so a diff against
 * it stays readable.
 */
export function tile(corners: {
  tl: boolean;
  tr: boolean;
  br: boolean;
  bl: boolean;
}): string {
  const { tl, tr, br, bl } = corners;
  if (tl && tr && br && bl) return `<circle cx="3" cy="3" r="3"></circle>`;
  if (!tl && !tr && !br && !bl) return `<rect width="6" height="6"></rect>`;
  const r = TILE / 2;
  const arc = `A${r},${r} 0 0 1 `;
  let d = tl ? `M0,${r}${arc}${r},0` : "M0,0";
  d += tr ? `H${TILE - r}${arc}${TILE},${r}` : `H${TILE}`;
  d += br ? `V${TILE - r}${arc}${TILE - r},${TILE}` : `V${TILE}`;
  d += bl ? `H${r}${arc}0,${TILE - r}` : "H0";
  return `<path d="${d}Z"></path>`;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function renderSvg(grid: Grid, options: StyleOptions): string {
  const { size: n } = grid;
  const module = options.size / (n + 2 * options.margin);
  const side = fmt(options.size);
  const origin = options.margin * module;
  const cleared = options.logo?.cleared ?? new Set<number>();

  const drawn = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < n &&
    y < n &&
    grid.isDark(x, y) &&
    !isFinder(n, x, y) &&
    !cleared.has(y * n + x);

  const tileScale = fmt((module / TILE) * TILE_OVERLAP);
  const modules: string[] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!drawn(x, y)) continue;
      const up = drawn(x, y - 1);
      const down = drawn(x, y + 1);
      const left = drawn(x - 1, y);
      const right = drawn(x + 1, y);
      const shape = tile({
        tl: !up && !left,
        tr: !up && !right,
        br: !down && !right,
        bl: !down && !left,
      });
      modules.push(
        `<g transform="translate(${fmt(origin + x * module)},${fmt(origin + y * module)}) scale(${tileScale})">${shape}</g>`,
      );
    }
  }

  const eyeScale = fmt(module / 2);
  const eye = (mx: number, my: number, path: string) =>
    `<g transform="translate(${fmt(origin + mx * module)},${fmt(origin + my * module)})" fill="${options.color}"><g transform="scale(${eyeScale})"><path d="${path}"></path></g></g>`;
  const eyes = [
    [0, 0],
    [n - FINDER, 0],
    [0, n - FINDER],
  ] as const;
  const frames = eyes.map(([x, y]) => eye(x, y, EYE_FRAME_PATH));
  const balls = eyes.map(([x, y]) => eye(x + 2, y + 2, EYE_BALL_PATH));

  let logo = "";
  if (options.logo) {
    const box = logoBox(n, options.logo.modules);
    const px = fmt(box.side * module);
    logo = `<image href="${options.logo.href}" width="${px}" height="${px}" x="${fmt(origin + box.x * module)}" y="${fmt(origin + box.y * module)}"></image>`;
  }

  const background = options.background
    ? `<rect width="${side}" height="${side}" fill="${options.background}"></rect>\n`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">\n` +
    background +
    `<g fill="${options.color}">\n${modules.join("\n")}\n</g>\n` +
    `<g>${frames.join("\n")}\n${balls.join("\n")}</g>\n` +
    (logo ? `${logo}\n` : "") +
    `</svg>\n`
  );
}
