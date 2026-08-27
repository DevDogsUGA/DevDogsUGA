"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";

import {
  blobStops,
  blurGeometry,
  f,
  LENGTH,
  scaleLength,
  type BlobDef,
} from "./blob-gradient";

export type EdgeType = "flat" | "bs" | "fs";

// Re-exported so the sections that define blobs keep importing the type from
// the component they hand them to.
export type { BlobDef };

interface Props {
  topEdge: EdgeType;
  bottomEdge: EdgeType;
  base: string;
  blobs: BlobDef[];
  /**
   * How soft the blob edges are. Named for the `feGaussianBlur` stdDeviation it
   * used to be (see the note on the component); it is now a multiplier on the
   * gradient falloff, so the two call sites that tuned it still read the same.
   */
  blurSd?: number;
  className?: string;
}

// useLayoutEffect synchronises the clip path before the first paint in the browser,
// but falls back to useEffect on the server (where useLayoutEffect is a no-op anyway).
const useSafeLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Parallax speed per blob slot. Alternating sign creates opposing depth layers.
const PARALLAX_FACTORS = [0.18, -0.13, 0.1, -0.16, 0.12] as const;

/**
 * The travel a factor of 1 would have while any part of the section is still on
 * screen, which is what every layer's headroom is a fraction of.
 *
 * `progress` is 0 with the section centred and ±0.5 with its centre one
 * half-viewport away, so it reaches ±(0.5 + H/2V) over the range where the
 * section is visible at all — its top at the viewport bottom, through its
 * bottom at the viewport top. Multiplying by V leaves a bound in pixels with V
 * and H the only terms, and a layer's own bound is that times its factor:
 *
 *     |dy| ≤ |factor| · (V + H) / 2
 *
 * Tight rather than generous, which is the point: headroom is paint area, and
 * the slowest blob asks for barely half of what the fastest one does. Past this
 * the section is entirely off screen, which is why `applyParallax` can clamp to
 * it without anyone seeing a blob stop.
 */
const parallaxSpan = (sectionH: number, viewH: number) =>
  Math.ceil((viewH + sectionH) / 2);

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

// Duration of the intro reveal that eases the diagonal edge in from a flat rect.
const REVEAL_MS = 450;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Measures `ref` and drives `paint(width, height, slope)` — on mount, on every
 * resize, and once per frame during the intro reveal.
 *
 * The slope is a function of the measured width, so it can't be resolved during
 * SSR. Rather than leaving the section invisible until hydration, callers render
 * a full-bleed fallback and this hook eases the slope up from 0 (which draws
 * that same flat rect) to its real value, then tracks resizes instantly.
 */
export function useSectionSlope(
  ref: RefObject<HTMLElement | null>,
  paint: (W: number, H: number, S: number) => void,
) {
  const paintRef = useRef(paint);
  paintRef.current = paint;

  useSafeLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId = 0;
    let startedAt = 0;
    let progress = 0;

    function draw() {
      const W = el!.clientWidth;
      const angle = window.innerWidth >= 768 ? 4 : 2;
      paintRef.current(
        W,
        el!.clientHeight,
        Math.tan((angle * Math.PI) / 180) * W * progress,
      );
    }

    const ro = new ResizeObserver(draw);
    ro.observe(el);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress = 1;
      draw();
    } else {
      // Slope 0 is pixel-identical to the pre-hydration fallback, so the handoff
      // from CSS-clipped rect to measured path is invisible.
      draw();
      rafId = requestAnimationFrame(function tick(now) {
        startedAt ||= now;
        progress = easeOutCubic(Math.min((now - startedAt) / REVEAL_MS, 1));
        draw();
        if (progress < 1) rafId = requestAnimationFrame(tick);
      });
    }

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [ref]);
}

/**
 * The soft coloured wash behind a section, with the diagonal edges cut into it.
 *
 * ## Why the blobs are CSS gradients and not blurred SVG ellipses
 *
 * This used to be an SVG: a `<g>` of hard-edged `<ellipse>`s pushed through one
 * `feGaussianBlur` at stdDeviation 45 (55 on the hero). It looked right and it
 * was the single most expensive thing on the site. Six of these mount on the
 * homepage, so every scroll frame that moved a section across the viewport had
 * to re-run six full-section Gaussian blurs on the CPU. Measured on a scroll
 * harness:
 *
 * - as it was ......................................... 10.9 FPS
 * - filter removed, ellipses kept ..................... 31.2 FPS
 * - blobs as CSS radial-gradients ..................... 46.2 FPS
 * - stdDeviation dropped 45 → 4, filter kept .......... 17.9 FPS
 * - parallax frozen, filter kept ...................... 11.5 FPS
 *
 * So the blur was the whole cost — shrinking it was not a fix, and the parallax
 * was never the problem (with gradients, parallax running 46.4 / frozen 46.8 /
 * listeners removed 45.4 are all one number). A radial-gradient whose stops
 * trace the same Gaussian falloff reads as the same shape, and the browser
 * rasterises it as an ordinary background instead of a filter pass.
 *
 * The one thing gradients cannot reproduce exactly: the old filter blurred the
 * blobs *after* compositing them together, and the blur was isotropic in pixels
 * while each gradient's falloff is a fraction of its own radius. Overlaps and
 * very flat blobs are therefore a shade softer or harder than they were. At
 * these radii — every blob is half the section wide — that is not visible.
 */
export default function SectionBackground({
  topEdge,
  bottomEdge,
  base,
  blobs,
  blurSd = 45,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paintedRef = useRef<HTMLDivElement>(null);
  const parallaxRefs = useRef<(HTMLDivElement | null)[]>([]);

  const layers = useMemo(
    () => blobs.map((b, i) => blobLayerStyle(b, blurSd, i)),
    [blobs, blurSd],
  );

  useSectionSlope(containerRef, (W, H, S) => {
    const container = containerRef.current;
    const painted = paintedRef.current;
    // Painted only once a shape exists — a degenerate clip path makes the
    // browser drop the whole layer, which is what left the section blank.
    if (!container || !painted || !W || !H) return;

    const cs = getComputedStyle(container);
    const radii: [number, number, number, number] = [
      parseFloat(cs.borderTopLeftRadius),
      parseFloat(cs.borderTopRightRadius),
      parseFloat(cs.borderBottomRightRadius),
      parseFloat(cs.borderBottomLeftRadius),
    ];
    // The painted layer is inset-0 inside the measured container, so the path's
    // user units are that container's own pixels — the same space buildPath
    // works in, and the same space HeroSection clips its <section> with.
    painted.style.clipPath = `path('${buildPath(W, H, S, topEdge, bottomEdge, radii)}')`;
    // Each blob layer is taller than the section (see blobLayerStyle), so it
    // can no longer let its gradient default to the size of its own box. This
    // is the box the gradient's percentages are meant to resolve against.
    painted.style.setProperty("--bg-h", `${H}px`);
  });

  // Scroll-driven parallax: each blob moves at a different rate, creating depth.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The reveal in useSectionSlope has its own reduced-motion branch; this is a
    // separate effect and needs its own. "Reduce" here means the blobs sit where
    // the design puts them and never move.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let listening = false;

    // Written to the DOM only when it changes, which is on resize and not on
    // scroll: it drives `top`/`bottom`, so setting it per frame would put a
    // layout in the middle of the one thing here that has to stay cheap.
    let span = -1;

    function applyParallax() {
      const rect = container!.getBoundingClientRect();
      const viewH = window.innerHeight;
      const progress = (viewH / 2 - (rect.top + rect.height / 2)) / viewH;

      const wanted = parallaxSpan(rect.height, viewH);
      if (wanted !== span) {
        span = wanted;
        paintedRef.current?.style.setProperty("--bg-span", `${span}px`);
      }

      parallaxRefs.current.forEach((el, i) => {
        if (!el) return;
        const factor = PARALLAX_FACTORS[i % PARALLAX_FACTORS.length]!;
        // Exactly the headroom this layer was given, since both are this
        // factor's share of the same span. Reachable only with the section off
        // screen, so the clamp is what keeps travel and headroom in step —
        // including for a frame after a resize, before the span is rewritten —
        // rather than a limit anyone can see.
        const reach = Math.abs(factor) * span;
        const dy = clamp(progress * factor * viewH, -reach, reach);
        el.style.transform = `translateY(${dy.toFixed(1)}px)`;
      });
    }

    function onScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyParallax);
    }

    // Six sections mount on the homepage and five of them are off-screen at any
    // moment; none of those should be answering the scroll event. The margin
    // starts a section a quarter-screen early so it is already in position by
    // the time it is visible — the catch-up never happens on screen.
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[entries.length - 1]?.isIntersecting ?? false;
        if (visible === listening) return;
        listening = visible;

        if (visible) {
          window.addEventListener("scroll", onScroll, { passive: true });
          applyParallax();
        } else {
          window.removeEventListener("scroll", onScroll);
          cancelAnimationFrame(rafId);
        }
      },
      { rootMargin: "25% 0px" },
    );
    io.observe(container);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? "rounded-xl"}`}
    >
      {/* Unclipped until measured, so the first paint is the full box with the
          container's CSS corner radius. useSectionSlope then eases the diagonal in. */}
      <div
        ref={paintedRef}
        className="absolute inset-0"
        style={{ backgroundColor: base }}
      >
        {layers.map((style, i) => (
          // One layer per blob, stacked in source order, so later blobs paint
          // over earlier ones exactly as the <ellipse> list did. No will-change:
          // the measurements above show the parallax costs nothing once the
          // filter is gone, and promoting five full-section layers per section
          // would spend a lot of GPU memory to buy nothing.
          //
          // Only the horizontal inset is a class. The vertical one is the
          // parallax headroom and comes from `style`, which needs a custom
          // property Tailwind has no utility for.
          <div
            key={i}
            ref={(el) => {
              parallaxRefs.current[i] = el;
            }}
            className="absolute inset-x-0"
            style={style}
          />
        ))}
      </div>
    </div>
  );
}

// ── public helpers (reusable for CSS clip-path: path() on host elements) ────

export function buildSectionPath(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
  r = 12,
): string {
  return buildPath(W, H, S, top, bot, [r, r, r, r]);
}

// ── internal helpers ─────────────────────────────────────────────────────────

/**
 * One blob as its own parallax layer: the gradient from {@link blobStops},
 * given a box that can travel without its edges showing.
 *
 * {@link blobsBackgroundImage} is the same blobs without any of that, for the
 * cards, which don't move.
 */
function blobLayerStyle(
  b: BlobDef,
  blurSd: number,
  index: number,
): CSSProperties {
  const { grow, edge, sd } = blurGeometry(blurSd);

  // This layer's own share of the parallax span — see `parallaxSpan`. Kept as
  // a fraction of one shared custom property rather than five of them, so a
  // resize rewrites one value per section instead of one per blob.
  const reach = Math.abs(PARALLAX_FACTORS[index % PARALLAX_FACTORS.length]!);
  const m = `calc(var(--bg-span, 0px) * ${reach})`;

  const stops = blobStops(b.fill, edge, sd, 1);

  return {
    // ## Why the layer is taller than the section it fills
    //
    // An SVG ellipse is a shape in the section's own coordinate space, so
    // moving it moved a shape, and the only thing that ever cut it was the
    // section boundary. A gradient is the *background of a box*, and both the
    // box and the image inside it have edges. Sized to the section and then
    // translated by dy, the image's own edge came to rest dy pixels inside the
    // section — and these blobs are taller than the section they sit in (ry
    // ~45%, grown again by the tail), so the gradient still had alpha to draw
    // where that edge fell. It rendered as a hard horizontal line ruled across
    // the band: measured at up to 193px in from the edge on the homepage, a
    // 2px step from rgb(127,228,189) to rgb(240,253,244), and the more obvious
    // for being horizontal on a section whose own edges are slanted.
    //
    // Growing the box alone does not fix it, because the image travels with the
    // box. The image has to grow too, so that it still covers the section once
    // moved: both gain `m` at each end, this layer's share of the span that
    // `applyParallax` publishes and clamps the travel to. The image then
    // overhangs by exactly the distance it can move, and only the section
    // boundary ever cuts it — which is where `overflow-hidden` and the clip
    // path cut anyway.
    //
    // The cost is that `BlobDef`'s vertical percentages no longer mean what
    // they say: they were written against the section, and the image is now
    // taller than that. `vertical()` re-expresses them against `--bg-h`, and
    // the centre is pushed down by the same overhang the image gained, which
    // together put the blob back exactly where it was.
    //
    // With both custom properties unset — server-rendered, or reduced motion,
    // where nothing translates and the headroom would be dead weight — every
    // one of these collapses to what it was. `--bg-h` falls back to `100%`,
    // which inside a gradient already means the image height, and the image is
    // the box again.
    top: `calc(-1 * ${m})`,
    bottom: `calc(-1 * ${m})`,
    backgroundImage:
      `radial-gradient(${scaleLength(b.rx, grow)} ${vertical(b.ry, grow)}` +
      ` at ${b.cx} calc(${m} + ${vertical(b.cy, 1)}), ${stops})`,
    backgroundSize: `100% calc(var(--bg-h, 100%) + 2 * ${m})`,
    // The image is sized to the box rather than left to tile into it — but a
    // stale `--bg-h` would make those disagree, and a tiled blob is a much
    // louder failure than a slightly mismeasured one.
    backgroundRepeat: "no-repeat",
    // Matches the <ellipse opacity> default this replaced.
    opacity: b.opacity ?? 0.65,
  };
}

/**
 * The same, for a length down the page — where the gradient image is taller
 * than the section by `--bg-span` at each end, so a percentage of the image is no
 * longer a percentage of the section.
 *
 * Percentages are rewritten as that fraction of `--bg-h`, the section's own
 * measured height. Everything else is already absolute and only needs scaling.
 * The `100%` fallback is what makes this a no-op before the section has been
 * measured: inside a gradient it resolves against the image, and until
 * `--bg-span` exists the image is exactly the section.
 */
function vertical(value: string, k: number): string {
  const m = LENGTH.exec(value);
  if (!m) return value;
  const n = parseFloat(m[1]!) * k;
  const unit = m[2] ?? "px";
  // Not `f`: that rounds to a tenth, which is a tenth of a pixel on a length
  // and a tenth of the whole section on a fraction.
  return unit === "%"
    ? `calc(${Math.round(n * 100) / 10000} * var(--bg-h, 100%))`
    : `${f(n)}${unit}`;
}

function getVertices(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
): [number, number][] {
  // bs top: right dips to S (\); fs top: left dips to S (/)
  const tl: [number, number] = top === "fs" ? [0, S] : [0, 0];
  const tr: [number, number] = top === "bs" ? [W, S] : [W, 0];
  // fs bottom: right dips to H-S (/); bs bottom: left dips to H-S (\)
  const br: [number, number] = bot === "fs" ? [W, H - S] : [W, H];
  const bl: [number, number] = bot === "bs" ? [0, H - S] : [0, H];
  return [tl, tr, br, bl];
}

function buildPath(
  W: number,
  H: number,
  S: number,
  top: EdgeType,
  bot: EdgeType,
  radii: [number, number, number, number] = [12, 12, 12, 12],
): string {
  const verts = getVertices(W, H, S, top, bot);
  const n = verts.length;
  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]!;
    const curr = verts[i]!;
    const next = verts[(i + 1) % n]!;

    const inX = curr[0] - prev[0];
    const inY = curr[1] - prev[1];
    const outX = next[0] - curr[0];
    const outY = next[1] - curr[1];
    const inL = Math.sqrt(inX * inX + inY * inY);
    const outL = Math.sqrt(outX * outX + outY * outY);
    const ri = Math.min(radii[i]!, inL / 2, outL / 2);

    const sx = curr[0] - (ri * inX) / inL;
    const sy = curr[1] - (ri * inY) / inL;
    const ex = curr[0] + (ri * outX) / outL;
    const ey = curr[1] + (ri * outY) / outL;

    parts.push(i === 0 ? `M ${f(sx)} ${f(sy)}` : `L ${f(sx)} ${f(sy)}`);
    parts.push(`Q ${f(curr[0])} ${f(curr[1])} ${f(ex)} ${f(ey)}`);
  }
  return parts.join(" ") + " Z";
}
