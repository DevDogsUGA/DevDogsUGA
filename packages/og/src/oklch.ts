/**
 * oklch() to sRGB hex.
 *
 * The palette below is copied from Tailwind's `theme.css` in the notation
 * Tailwind writes it in, and Satori cannot parse that notation: its CSS layer
 * resolves `#rrggbb`, `rgb()` and named colours, and treats anything else as
 * transparent — silently, so an unconverted token renders as a hole in the
 * image rather than an error anyone would notice.
 *
 * Converting here rather than pasting hex literals is what keeps the two in
 * step. A hex ramp would be a second copy of the palette that no build step
 * compares against the first, and the failure it hides is the one that matters
 * least visibly and most often: a brand colour a few percent off, on an asset
 * nobody re-renders for months.
 */

/** OKLab to linear sRGB — Björn Ottosson's matrices, unmodified. */
function oklabToLinearSrgb(L: number, a: number, b: number) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Linear light to an 8-bit sRGB channel, clipped to the gamut. */
function encode(channel: number): number {
  const v =
    channel > 0.0031308
      ? 1.055 * channel ** (1 / 2.4) - 0.055
      : 12.92 * channel;

  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/**
 * @param l Lightness as a fraction, so Tailwind's `70.4%` is `0.704`.
 * @param c Chroma.
 * @param h Hue in degrees. Ignored when chroma is zero, which is why the
 *   achromatic entries in the ramp can write `0` where Tailwind writes `none`.
 */
export function oklch(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const { r, g, b } = oklabToLinearSrgb(
    l,
    c * Math.cos(rad),
    c * Math.sin(rad),
  );

  return `#${[r, g, b]
    .map((channel) => encode(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}
