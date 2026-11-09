/**
 * The blob wash, as CSS gradient strings.
 *
 * Split out of `section-background` because that module is `"use client"`, so
 * every export there is a client reference a server component cannot call. This
 * is the half with no hooks and no DOM, which lets a server-rendered card draw
 * the same wash as the section it links to. See {@link blobsBackgroundImage}.
 */

export interface BlobDef {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  fill: string;
  opacity?: number;
}

/**
 * Alpha profile of a hard-edged ellipse pushed through a Gaussian blur, which is
 * exactly the normal CDF: α(d) = Φ(-d/σ), where d is the distance outward from
 * the ellipse edge. Sampled here as [distance in standard deviations, alpha].
 *
 * The first entry is where the blur is still effectively opaque and the last is
 * where the tail is close enough to nothing to stop drawing it.
 */
const BLUR_TAIL: [sigmas: number, alpha: number][] = [
  [-2, 1],
  [-1, 0.84],
  [-0.5, 0.69],
  [0, 0.5],
  [0.5, 0.31],
  [1, 0.16],
  [1.5, 0.07],
  [2.2, 0],
];

const TAIL_REACH = BLUR_TAIL[BLUR_TAIL.length - 1]![0];

/**
 * One standard deviation of the falloff, as a fraction of the blob's own radius,
 * at the default blurSd of 45.
 *
 * The old filter blurred in pixels, so its softness relative to a blob depended
 * on which axis you looked along: 45px is ~6% of a 700px rx but ~16% of a 275px
 * ry. A gradient's stops are in normalised ellipse space and cannot be
 * anisotropic, so this is the geometric middle of that range, the value that
 * looks like the old blur from both directions at once.
 */
const SOFTNESS_AT_45 = 0.11;

export const f = (n: number) => Math.round(n * 10) / 10;

// The unit group is optional rather than possibly-empty, so an absent unit
// reads as undefined and every call site can default it with `??`.
export const LENGTH = /^\s*(-?\d*\.?\d+)\s*([a-z%]+)?\s*$/i;

/**
 * Scales a CSS length, keeping its unit. A percentage blob needs no conversion
 * beyond this: percentages resolve against the same axis in a radial-gradient
 * as they did on an SVG ellipse, width for rx/cx and height for ry/cy.
 *
 * Anything the regex can't read, calc() or var(), is passed through untouched.
 * The blob then keeps its stated extent and the soft rim falls just inside the
 * radius rather than straddling it.
 */
export function scaleLength(value: string, k: number): string {
  const m = LENGTH.exec(value);
  return m ? `${f(parseFloat(m[1]!) * k)}${m[2] ?? "px"}` : value;
}

// color-mix rather than parsing the hex, because BlobDef.fill is any CSS colour.
// Mixing with `transparent` in sRGB is premultiplied, so this is the fill at the
// given alpha with no shift toward grey.
export const withAlpha = (color: string, a: number) =>
  a >= 1
    ? color
    : a <= 0
      ? "transparent"
      : `color-mix(in srgb, ${color} ${f(a * 100)}%, transparent)`;

/**
 * How far past its stated radius a blob's gradient has to be drawn, and where
 * the stops land once it is.
 *
 * The gradient is grown so the whole falloff fits inside it. A gradient paints
 * nothing beyond its extent, so a tail that ran off the end would be chopped
 * into a visible ring. The stops are then placed so α = 0.5 lands back on the
 * original radius, which is where a blurred edge sits: the blob keeps the size
 * it has today and gains a soft rim.
 */
export function blurGeometry(blurSd: number) {
  const sigma = SOFTNESS_AT_45 * (blurSd / 45);
  const grow = 1 + TAIL_REACH * sigma; // extent that fits the whole tail
  return {
    grow,
    edge: 100 / grow, // the stated radius, as a % of that extent
    sd: (sigma / grow) * 100, // one σ, likewise
  };
}

/**
 * The stop list for one blob, at `scale` times its alpha throughout.
 *
 * `scale` is 1 wherever the layer carries the blob's own opacity itself.
 * Folding it in here instead is exact, not an approximation, because a blob is
 * a single colour: compositing per-pixel alpha `a` at opacity `α` lands on the
 * same pixels as alpha `a·α`, and `withAlpha` premultiplies, so no stop shifts
 * toward grey on the way.
 */
export function blobStops(
  fill: string,
  edge: number,
  sd: number,
  scale: number,
) {
  return [
    `${withAlpha(fill, scale)} 0%`,
    ...BLUR_TAIL.map(
      ([k, a]) => `${withAlpha(fill, a * scale)} ${f(edge + k * sd)}%`,
    ),
  ].join(", ");
}

/**
 * The same blobs as one element's `background-image`, for a box that never
 * moves, such as a card echoing the section it links to.
 *
 * `SectionBackground` gives every blob a layer of its own because each has to
 * travel at its own parallax rate. Nothing here travels, so the whole set fits
 * on one element as a comma-separated list: a quarter of the elements in a
 * strip that renders its children six times, and no per-blob `opacity` left to
 * composite, since {@link blobStops} folds each one into its own stops.
 *
 * Vertical percentages are read straight, with none of the `--bg-h` rewriting
 * `blobLayerStyle` needs. That exists because parallax makes the image taller
 * than the section it fills, and here the image is exactly its box again.
 *
 * The list is reversed because the two stacking orders are opposites: a later
 * element paints over an earlier one, a later background layer paints under.
 */
export function blobsBackgroundImage(blobs: BlobDef[], blurSd = 45): string {
  const { grow, edge, sd } = blurGeometry(blurSd);
  return blobs
    .map(
      (b) =>
        `radial-gradient(${scaleLength(b.rx, grow)} ${scaleLength(b.ry, grow)}` +
        ` at ${b.cx} ${b.cy}, ${blobStops(b.fill, edge, sd, b.opacity ?? 0.65)})`,
    )
    .reverse()
    .join(", ");
}
