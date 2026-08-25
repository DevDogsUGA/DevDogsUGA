"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Copies of `children` rendered side by side. Must be EVEN: the keyframe
 * translates the strip by -50%, so it loops after exactly COPIES / 2 copies.
 * Enough copies that the strip stays ≥ 2× the viewport on wide screens.
 */
const COPIES = 6;

/** Fraction of the remaining gap closed each frame when ramping speed. */
const EASE = 0.12;

interface Props {
  /** Content to scroll. Rendered `COPIES` times for a seamless loop. */
  children: ReactNode;
  /** Time for one full loop, in seconds. */
  duration?: number;
  direction?: "left" | "right";
  className?: string;
  /**
   * When set, each copy gets `position: relative` and its own stacking context,
   * with z-index descending from `copyZBase`. This keeps the left copy on top of
   * the right one at every seam, so cards whose z-index descends within a copy
   * also overlap correctly across the loop point.
   *
   * Only the `--copy-z` custom property is set here; `[data-marquee-copy]` in
   * globals.css turns it into the actual `position`/`z-index`. That indirection
   * is what lets the hover rule beside it lift whichever copy holds the hovered
   * card above the rest — an inline `z-index` would outrank that rule on
   * specificity, and a card hovered at a seam could never rise above the copy
   * to its left.
   */
  copyZBase?: number;
}

/**
 * CSS-keyframe marquee that eases to a stop on hover and back up on leave.
 * Ramps the Web Animations API `playbackRate` so speed changes never reset the
 * strip's position.
 */
export default function MarqueeTrack({
  children,
  duration = 100,
  direction = "left",
  className,
  copyZBase,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    let rate = 1;
    let target = 1;
    let raf: number | undefined;

    const step = () => {
      rate += (target - rate) * EASE;
      if (Math.abs(target - rate) < 0.01) rate = target;
      const anim = track.getAnimations()[0];
      if (anim) anim.playbackRate = rate;
      raf = rate === target ? undefined : requestAnimationFrame(step);
    };

    const rampTo = (to: number) => {
      target = to;
      raf ??= requestAnimationFrame(step);
    };

    const onMouseEnter = () => rampTo(0);
    const onMouseLeave = () => rampTo(1);

    root.addEventListener("mouseenter", onMouseEnter);
    root.addEventListener("mouseleave", onMouseLeave);

    return () => {
      root.removeEventListener("mouseenter", onMouseEnter);
      root.removeEventListener("mouseleave", onMouseLeave);
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    // `clip`, not `hidden`. Per CSS Overflow 3, `visible` on one axis computes
    // to `auto` when the other axis is `hidden` — so `overflow-x-hidden
    // overflow-y-visible` quietly became `overflow-y: auto` and went on
    // clipping a hovered card's lift at the strip's top edge. `clip` is the
    // documented exception: paired with it, `visible` stays visible. x still
    // clips, which is what makes the loop read as an endless strip rather than
    // COPIES laid out side by side.
    <div
      ref={rootRef}
      className={`overflow-x-clip overflow-y-visible ${className ?? ""}`}
    >
      <div
        ref={trackRef}
        className="flex w-max"
        style={{
          animation: `marquee-scroll ${duration}s linear infinite`,
          animationDirection: direction === "right" ? "reverse" : "normal",
        }}
      >
        {Array.from({ length: COPIES }, (_, i) => (
          <div
            key={i}
            className="flex"
            aria-hidden={i > 0 || undefined}
            data-marquee-copy={copyZBase === undefined ? undefined : ""}
            style={
              copyZBase === undefined
                ? undefined
                : ({ "--copy-z": copyZBase - i } as CSSProperties)
            }
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
