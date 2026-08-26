"use client";

import { useEffect, useRef } from "react";

/**
 * Analogue snow, invented in the browser instead of downloaded.
 *
 * ## Why this is not a GIF any more
 *
 * It used to be `static.gif`: 1.8 MB, and sixty per cent of the homepage's
 * entire image payload — spent on the picture that is on screen when the
 * television is showing *nothing*. A GIF is also the most expensive possible
 * container for it. Every frame is decoded on the CPU, none of it can be
 * hardware accelerated, and Chrome pauses animated images that are off screen,
 * so the whole bill arrives in the moment the band scrolls into view. It was a
 * megabyte and a half of scroll jank buying a texture.
 *
 * Noise is the one picture that is cheaper to generate than to fetch, because
 * it has no content to be faithful to. Nothing here has to match the original
 * frame for frame; it has to look like snow, and snow is a formula.
 *
 * ## What the formula is
 *
 * Not white noise. Per-pixel randomness reads as digital dither — an even
 * sand, wrong in a way that is hard to name until you see the two side by
 * side. Analogue snow is drawn by a beam sweeping left to right, so the grain
 * smears *along the scan* into short horizontal streaks, sits nearly bimodal
 * between black and white, and falls off toward the corners of the tube. Three
 * cheap terms, applied in that order, and the reference GIF stops being
 * distinguishable from the generated one at the size this renders.
 */

/**
 * Internal resolution. The aperture is around 220 CSS px wide at the widest
 * layout, so this is roughly half-scale and the browser stretches it back up
 * for free. Static is uniquely forgiving of that: "the grain is slightly too
 * coarse" is a thing real snow does anyway. The ratio matches `PICTURE`'s
 * 188x158 in `CrtTv`, so its `slice` crops essentially nothing.
 */
const WIDTH = 112;
const HEIGHT = 94;

/**
 * How many frames get baked. They are picked at random rather than cycled, so
 * six is enough never to read as a loop — six cycled in order is a repeat
 * every half second, and the eye finds a repeat in noise almost immediately.
 */
const FRAME_COUNT = 6;

/** ~12 fps. Snow at 60 does not look better, it looks the same and costs five
 *  times as much. */
const FRAME_MS = 80;

/** How much of each pixel is inherited from the one to its left: the smear
 *  along the scan line. */
const SMEAR = 0.42;

/** Averaging with the left neighbour pulls everything toward mid grey, so the
 *  result is pushed back apart around 0.5. Snow is mostly black and white. */
const CONTRAST = 2.6;

/**
 * How far the corners fall off. A tube is brightest in the middle. Applied on
 * both axes, so a corner lands at (1 - VIGNETTE)² of centre brightness —
 * enough to see, not enough to look like a spotlight.
 */
const VIGNETTE = 0.24;

/**
 * Builds a painter over one reused canvas: call it, get back a fresh frame as
 * a data URL. Null if the context is unavailable, which is the caller's cue to
 * leave the screen black rather than to retry.
 */
function createNoiseSource(): (() => string) | null {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  // alpha: false — the picture is opaque, and saying so lets the encoder drop
  // a channel it would otherwise write for every pixel.
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  const frame = ctx.createImageData(WIDTH, HEIGHT);
  const pixels = frame.data;

  return () => {
    let i = 0;
    for (let y = 0; y < HEIGHT; y++) {
      // Separable vignette — a product of two parabolas rather than a true
      // radial falloff. The difference is slightly squarer corners, which
      // nothing clipped to a bulging tube can show.
      const ty = (y / (HEIGHT - 1)) * 2 - 1;
      const rowGain = 1 - VIGNETTE * ty * ty;
      let level = Math.random();

      for (let x = 0; x < WIDTH; x++) {
        level = level * SMEAR + Math.random() * (1 - SMEAR);
        const tx = (x / (WIDTH - 1)) * 2 - 1;
        const gain = rowGain * (1 - VIGNETTE * tx * tx);
        // No clamping: `pixels` is a Uint8ClampedArray, so the contrast curve
        // is allowed to overshoot at both ends and the assignment rounds it
        // back into range. That overshoot is what makes the whites white.
        const v = ((level - 0.5) * CONTRAST + 0.5) * gain * 255;
        pixels[i] = v;
        pixels[i + 1] = v;
        pixels[i + 2] = v;
        pixels[i + 3] = 255;
        i += 4;
      }
    }
    ctx.putImageData(frame, 0, 0);
    return canvas.toDataURL("image/png");
  };
}

/**
 * Drives one SVG `<image>` as a no-signal screen. Returns the ref to hang on
 * it.
 *
 * The `href` is set imperatively rather than through state. A state update per
 * frame would re-render the entire television — forty-odd nodes of gradients
 * and paths — twelve times a second in order to change one attribute on one of
 * them.
 *
 * Two gates, and both are the point rather than politeness:
 *
 * - **On screen.** An IntersectionObserver starts and stops the loop. The GIF
 *   this replaces was a jank source *precisely because* the browser only began
 *   decoding it when it scrolled into view; swapping that for a rAF loop that
 *   runs from page load would be a worse bargain, not a better one.
 * - **Reduced motion.** A visitor who has asked for less movement gets a
 *   single frozen frame of snow. Not a black screen — the tube should still
 *   read as a tube, it just is not flickering.
 *
 * A hidden tab is covered for free: `requestAnimationFrame` stops being
 * delivered, so the loop suspends itself without a `visibilitychange` listener.
 */
export function useTvStatic() {
  const ref = useRef<SVGImageElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const paint = createNoiseSource();
    if (!paint) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frames: string[] = [];
    let showing = -1;
    let raf: number | undefined;
    let due = 0;
    let onScreen = false;

    const show = (i: number) => {
      const url = frames[i];
      if (!url) return;
      showing = i;
      target.setAttribute("href", url);
    };

    const bake = () => {
      frames.push(paint());
      show(frames.length - 1);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < due) return;
      due = now + FRAME_MS;

      // One encode per tick until the set is full, rather than six of them in
      // the single frame the band scrolls into view. Each costs a millisecond
      // or two; the first is on screen immediately and the picture simply
      // stops repeating over the following half second.
      if (frames.length < FRAME_COUNT) {
        bake();
        return;
      }

      // Any frame but the one already up.
      let next = Math.floor(Math.random() * (FRAME_COUNT - 1));
      if (next >= showing) next += 1;
      show(next);
    };

    const sync = () => {
      if (onScreen && !reduced.matches) {
        if (raf === undefined) raf = requestAnimationFrame(tick);
        return;
      }
      if (raf !== undefined) cancelAnimationFrame(raf);
      raf = undefined;
      // Reduced motion still gets a picture: one frame, painted once, left up.
      if (onScreen && frames.length === 0) bake();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onScreen = entry.isIntersecting;
        sync();
      },
      // Observe the whole set, not the `<image>`: the image lives inside a
      // clipped group, and an element's intersection geometry under a clip
      // path is not something to rely on. "The television is in view" is what
      // we mean anyway. The margin gets the first frames baked and up shortly
      // before anyone is looking at it.
      { rootMargin: "200px" },
    );
    observer.observe(target.ownerSVGElement ?? target);
    reduced.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
