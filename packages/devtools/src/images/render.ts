/**
 * Turning a template into a PNG on disk.
 *
 * Two libraries, and the choice of each is load-bearing:
 *
 *   * **Satori** lays the template out and emits SVG. It is the same engine
 *     `next/og` runs inside the platform, so a card exported here and a card
 *     unfurled from a URL are the same picture rather than two implementations
 *     of one design.
 *   * **resvg** rasterises it, for the same reason. The obvious alternative was
 *     sharp, which this package already depends on — but sharp rasterises
 *     through librsvg, and librsvg does not read `rgba()` in a gradient stop,
 *     which is exactly the notation Satori emits. The background washes came
 *     out as flat black, silently and only in the CLI's copy of an image the
 *     site rendered correctly. resvg is what `@vercel/og` itself uses.
 *
 * `@vercel/og` is deliberately NOT used here even though this mirrors it. Its
 * Node build is bundled for a CommonJS loader: imported as ESM it wants a
 * global `require`, then a global `__dirname`, and then an `hb.wasm` the
 * package does not ship. `next/og` cannot be imported outside Next's bundler at
 * all. Driving Satori directly is the same rendering, three hacks fewer.
 */
import { Resvg } from "@resvg/resvg-js";
import satori, { type Font } from "satori";
import { loadFonts } from "@devdogsuga/og";
import type { ReactElement } from "react";

let fonts: Font[] | undefined;

/** The embedded faces, in Satori's shape. Decoded once per process. */
function satoriFonts(): Font[] {
  return (fonts ??= loadFonts().map((font) => ({
    name: font.name,
    data: font.data,
    weight: font.weight,
    style: font.style,
  })));
}

export interface RenderOptions {
  /** The layout's own width. Every size in the template is against this. */
  width: number;
  height: number;
  /**
   * Output pixels per layout pixel. The layout is computed once at `width` and
   * the vector result is rasterised larger, so 3x is genuinely three times the
   * detail rather than an upscaled 1x — and the type stays on the same metrics
   * at every scale, which is what makes @1x/@2x/@3x a set rather than three
   * slightly different pictures.
   */
  scale?: number;
}

export interface Rendered {
  png: Buffer;
  svg: string;
  width: number;
  height: number;
}

export async function render(
  element: ReactElement,
  { width, height, scale = 1 }: RenderOptions,
): Promise<Rendered> {
  const svg = await satori(element, { width, height, fonts: satoriFonts() });

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(width * scale) },
    // Satori has already turned every glyph into a path, so resvg never needs
    // to resolve a family. Saying so keeps it from probing the host's fonts,
    // which is the one thing here that could differ between a contributor's
    // machine and CI.
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

  return {
    png,
    svg,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
