/**
 * SVG → pixels, through `sharp`.
 *
 * Every raster format is the same render with a different encoder on the
 * end. The one wrinkle is transparency: the reference is white on nothing,
 * and a JPEG has no nothing, so opaque formats are flattened onto a
 * background — the one asked for, or a contrasting default so the code does
 * not vanish into a white page.
 */
import sharp from "sharp";

export const RASTER_FORMATS = ["png", "jpeg", "webp", "avif", "tiff"] as const;
export type RasterFormat = (typeof RASTER_FORMATS)[number];

export const FORMATS = ["svg", ...RASTER_FORMATS] as const;
export type Format = (typeof FORMATS)[number];

/** `jpg` is `jpeg`; everything else is its own name. */
export function parseFormat(value: string): Format | null {
  const name = value.toLowerCase().replace(/^\./, "");
  if (name === "jpg") return "jpeg";
  return (FORMATS as readonly string[]).includes(name) ? (name as Format) : null;
}

/** The file extension a format is written with. */
export function extensionOf(format: Format): string {
  return format === "jpeg" ? "jpg" : format;
}

const OPAQUE: ReadonlySet<Format> = new Set(["jpeg"]);

export function needsBackground(format: Format): boolean {
  return OPAQUE.has(format);
}

/**
 * Black or white, whichever a colour stands out against.
 *
 * Only reached for a JPEG with no `--background`; a rough luminance from the
 * hex is enough to keep white modules off a white page.
 */
export function contrastingBackground(color: string): string {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return "#000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 128 ? "#000000" : "#ffffff";
}

export interface RasterOptions {
  size: number;
  /** Applied under opaque formats only; the SVG already carries its own. */
  background?: string;
}

export async function rasterize(
  svg: string,
  format: RasterFormat,
  options: RasterOptions,
): Promise<Buffer> {
  let image = sharp(Buffer.from(svg)).resize(options.size, options.size);
  if (needsBackground(format) && options.background) {
    image = image.flatten({ background: options.background });
  }
  switch (format) {
    case "png":
      return image.png().toBuffer();
    case "jpeg":
      return image.jpeg({ quality: 92 }).toBuffer();
    case "webp":
      return image.webp({ lossless: true }).toBuffer();
    case "avif":
      return image.avif({ lossless: true }).toBuffer();
    case "tiff":
      return image.tiff().toBuffer();
  }
}
