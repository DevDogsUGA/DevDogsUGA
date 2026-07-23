"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /** Content to scroll. Rendered multiple times for a seamless loop. */
  children: ReactNode;
  /** Base animation duration in seconds. */
  baseDuration?: number;
  direction?: "left" | "right";
  className?: string;
  /**
   * When set, each copy div gets `position: relative` and a stacking context
   * with z-index decreasing from copyZBase down to (copyZBase - 7). This lets
   * the LEFT copy always render on top of the RIGHT copy at every seam boundary,
   * so cards with descending z-index inside each copy appear correctly at the
   * loop point as well as within a copy.
   */
  copyZBase?: number;
}

/**
 * CSS-keyframe marquee whose speed tracks scroll velocity.
 * Uses Web Animations API `playbackRate` so speed changes never reset position.
 * Renders 8 copies so the loop is always seamless even on wide viewports with
 * short content (requires total strip ≥ 2× viewport to avoid gaps at any rate).
 */
export default function ScrollMarquee({
  children,
  baseDuration = 100,
  direction = "left",
  className,
  copyZBase,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const rate = useRef(1);
  const rafRef = useRef<number | undefined>(undefined);
  const hoverRafRef = useRef<number | undefined>(undefined);
  const hovering = useRef(false);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!inner || !outer) return;

    const applyRate = (r: number) => {
      const anim = inner.getAnimations()[0];
      if (anim) anim.playbackRate = r;
    };

    const cancelScrollRaf = () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };

    const cancelHoverRaf = () => {
      if (hoverRafRef.current !== undefined) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = undefined;
      }
    };

    const decay = () => {
      rate.current = Math.max(1, rate.current * 0.93);
      applyRate(rate.current);
      if (rate.current > 1.01) {
        rafRef.current = requestAnimationFrame(decay);
      } else {
        rate.current = 1;
        applyRate(1);
      }
    };

    const slowDown = () => {
      rate.current = Math.max(0, rate.current * 0.88);
      applyRate(rate.current);
      if (rate.current > 0.005) {
        hoverRafRef.current = requestAnimationFrame(slowDown);
      } else {
        rate.current = 0;
        applyRate(0);
      }
    };

    const recover = () => {
      rate.current = rate.current + (1 - rate.current) * 0.1;
      applyRate(rate.current);
      if (rate.current < 0.99) {
        hoverRafRef.current = requestAnimationFrame(recover);
      } else {
        rate.current = 1;
        applyRate(1);
      }
    };

    const onScroll = () => {
      if (hovering.current) return;
      const delta = Math.abs(window.scrollY - lastScrollY.current);
      lastScrollY.current = window.scrollY;
      rate.current = Math.min(rate.current + delta * 0.07, 3.5);
      applyRate(rate.current);
      cancelScrollRaf();
      rafRef.current = requestAnimationFrame(decay);
    };

    const onMouseEnter = () => {
      hovering.current = true;
      cancelScrollRaf();
      cancelHoverRaf();
      hoverRafRef.current = requestAnimationFrame(slowDown);
    };

    const onMouseLeave = () => {
      hovering.current = false;
      cancelHoverRaf();
      hoverRafRef.current = requestAnimationFrame(recover);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    outer.addEventListener("mouseenter", onMouseEnter);
    outer.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("scroll", onScroll);
      outer.removeEventListener("mouseenter", onMouseEnter);
      outer.removeEventListener("mouseleave", onMouseLeave);
      cancelScrollRaf();
      cancelHoverRaf();
    };
  }, []);

  return (
    <div ref={outerRef} className={`overflow-hidden ${className ?? ""}`}>
      <div
        ref={innerRef}
        className="flex w-max"
        style={{
          animation: `marquee-scroll ${baseDuration}s linear infinite`,
          animationDirection: direction === "right" ? "reverse" : "normal",
        }}
      >
        {Array.from({ length: 5 }, (_, i) => (
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
