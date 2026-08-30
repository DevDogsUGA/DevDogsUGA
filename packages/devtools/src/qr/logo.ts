/**
 * The logo: read it, embed it, and say which modules it displaces.
 *
 * An SVG logo is embedded as SVG so it stays vector in an SVG export; a
 * raster one is embedded as it is, and anything else is converted to PNG.
 * The reference clears exactly the square the artwork is fitted into. That
 * cleared area is the 9×9 box, not the mascot's outline, so the clearing is
 * arithmetic on the box and needs no pixels.
 */
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import sharp from "sharp";
import { PROJECT_ROOT } from "../instance.js";
import { logoBox, type Logo } from "./style.js";

/** The mascot the reference code carries, as the vector the brand kit ships. */
export const DEFAULT_LOGO = join(
  PROJECT_ROOT,
  "apps/platform/public/brand/devdog.svg",
);

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface LogoOptions {
  path: string;
  /** Side of the box the logo is fitted into, in modules. */
  modules: number;
  /** Extra rows and columns cleared around the box, in modules. */
  padding: number;
  /** Modules per side of the symbol. */
  gridSize: number;
}

export async function loadLogo(options: LogoOptions): Promise<Logo> {
  const bytes = await readFile(options.path);
  const mime = MIME[extname(options.path).toLowerCase()];
  const href = mime
    ? `data:${mime};base64,${bytes.toString("base64")}`
    : `data:image/png;base64,${(await sharp(bytes).png().toBuffer()).toString("base64")}`;

  return {
    href,
    modules: options.modules,
    cleared: clearedModules(options),
  };
}

/**
 * Every module whose cell overlaps the box, grown by the padding.
 *
 * The box is centred on the symbol, so with an even grid and an odd box (or
 * the reverse) its edge falls half-way through a module; a half-covered
 * module is cleared, since half a module under artwork is unreadable anyway.
 */
export function clearedModules(
  options: Pick<LogoOptions, "modules" | "padding" | "gridSize">,
): Set<number> {
  const { gridSize, padding } = options;
  const box = logoBox(gridSize, options.modules);
  const first = Math.max(0, Math.floor(box.x - padding));
  const last = Math.min(
    gridSize - 1,
    Math.ceil(box.x + box.side + padding) - 1,
  );

  const cleared = new Set<number>();
  for (let y = first; y <= last; y += 1) {
    for (let x = first; x <= last; x += 1) {
      cleared.add(y * gridSize + x);
    }
  }
  return cleared;
}
