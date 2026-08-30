import type { CSSProperties } from "react";
import hypno from "~/assets/hypno.webp";

/**
 * The hero's slowly turning spiral.
 *
 * This used to be the 24-path SVG inline, wrapped in `blur-sm` and rotated by
 * `animate-spin-slower`. Measured on a production build, that one element held
 * the whole page to 36.8 FPS at idle; hiding it restored 60.4. The expense is
 * the live filter, not the geometry: a rotating element under `filter` cannot
 * be handed to the compositor, because the filter's input changes every frame,
 * so Skia re-blurs roughly 12.5 megapixels sixty times a second. Shrinking the
 * blurred area sixfold bought 3 FPS; removing the blur at full size bought 25.
 *
 * So the blur is baked in instead. `scripts/generate-hypno.mjs` renders the
 * same paths, blurs them once, and writes `hypno.webp`; the browser now
 * rotates a finished texture, which is a compositor transform and costs
 * nothing. The look and the motion are unchanged.
 *
 * The source is deliberately small, 512px for 58 KB, upscaled ~7x here. That
 * is invisible because the image is blurred: the sweep in the generator found
 * 1024px cost twice the bytes for no visible gain. It is a plain `<img>`
 * rather than `next/image` on purpose, so the optimizer does not re-encode a
 * blurred texture back up to a larger candidate.
 *
 * One honest difference: the SVG carried `vector-effect: non-scaling-stroke`,
 * so its line stayed 2px at any viewport. A raster's line scales with the
 * image, so on a much wider viewport the spiral reads slightly heavier than it
 * used to. On a blurred background decoration that is not a difference anyone
 * can name.
 */
export default function Hypno() {
  return (
    <div
      className="@container absolute size-full"
      style={
        {
          "--pos-x": "2/3",
          "--pos-y": "1/2",
        } as CSSProperties
      }
    >
      <img
        src={hypno.src}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="animate-spin-slower absolute aspect-square max-w-none"
        style={{
          top: "calc(var(--pos-y)*100%)",
          left: "calc(var(--pos-x)*100%)",
          translate: "-50% -50%",
          minHeight:
            "max(calc((1 - var(--pos-y)) * 200% * sqrt(2)), calc(var(--pos-y)) * 200% * sqrt(2))",
          minWidth:
            "max(calc((1 - var(--pos-x)) * 200% * sqrt(2)), calc(var(--pos-x)) * 200% * sqrt(2))",
          aspectRatio: "1/1",
        }}
      />
    </div>
  );
}
