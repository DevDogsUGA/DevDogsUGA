import {
  EventCard,
  FORMATS,
  staticBrandGraphics,
  type BrandGraphic,
  type Format,
} from "@devdogsuga/sdk/brand";
import { imageResponse } from "@devdogsuga/sdk/brand/next";
import type { GraphicSubject } from "~/lib/graphics/subjects";

/**
 * Drawing one graphic as PNG bytes, on the Worker.
 *
 * This is `next/og`, the same renderer that serves every link card in
 * production, so a console download and an unfurled card are the same picture.
 * The alternative, the CLI's Satori plus the native resvg, cannot load in a
 * Worker.
 *
 * One graphic per call, never a batch: a render is the CPU-heavy step on a
 * Worker, so the ZIP route awaits them one at a time and releases each before
 * starting the next (see `zipStream`).
 *
 * `next/og` draws at the dimensions it is given and has no raster scale. A
 * format with `scale` other than 1 (the icon sizes, the email densities) is
 * therefore laid out at its output size, which every such template supports
 * because they size everything off `width`. Below {@link MIN_LAYOUT_PX} that
 * stops being faithful, since a 1px rule rounds away, so those formats stay
 * with `backstage graphics`, which rasterises one larger layout down.
 */

export const MIN_LAYOUT_PX = 64;

export function formatOf(name: string): Format | undefined {
  return FORMATS[name];
}

/** The output size, in pixels. */
export function outputSize(format: Format): { width: number; height: number } {
  return {
    width: Math.round(format.width * format.scale),
    height: Math.round(format.height * format.scale),
  };
}

/** Whether the console can draw this format faithfully on a Worker. */
export function renderableOnWorker(format: Format): boolean {
  const { width, height } = outputSize(format);

  return Math.min(width, height) >= MIN_LAYOUT_PX;
}

async function pngOf(
  element: Parameters<typeof imageResponse>[0],
  format: Format,
): Promise<Uint8Array> {
  const response = imageResponse(element, outputSize(format));

  return new Uint8Array(await response.arrayBuffer());
}

/** One meeting subject at one format. */
export async function renderMeetingGraphic(
  subject: GraphicSubject,
  format: Format,
): Promise<Uint8Array> {
  // Laid out at the format's own size: every meeting format has scale 1.
  const { width, height } = outputSize(format);

  return pngOf(
    EventCard({ width, height, cobrand: true, ...subject.detail }),
    format,
  );
}

/** The static brand graphics, by `group/name`. */
export function brandGraphics(): BrandGraphic[] {
  return staticBrandGraphics();
}

/** One reusable brand graphic at one format. */
export async function renderBrandGraphic(
  graphic: BrandGraphic,
  format: Format,
): Promise<Uint8Array> {
  const { width, height } = outputSize(format);
  // The template is told the OUTPUT size, since next/og has no scale: see the
  // module comment.
  return pngOf(graphic.render({ ...format, width, height, scale: 1 }), format);
}
