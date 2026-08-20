"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
    <div ref={rootRef} className={`overflow-hidden ${className ?? ""}`}>
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
            style={
              copyZBase !== undefined
                ? { position: "relative", zIndex: copyZBase - i }
                : undefined
            }
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
