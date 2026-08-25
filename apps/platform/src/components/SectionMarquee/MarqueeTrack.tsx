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

/**
 * How much clear space a hovered card is pulled to, past the viewport edge.
 * Enough that the card reads as deliberately parked rather than jammed against
 * the side, and enough to clear its own hover lift.
 */
const EDGE_MARGIN = 24;

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
  /**
   * Scroll the strip when the pointer lands on a link the viewport is cutting
   * off, so hovering a half-visible card pulls it fully into view. For
   * marquees whose items are individually meaningful — the plain text strips
   * have nothing worth bringing over.
   */
  keepHoveredInView?: boolean;
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
  keepHoveredInView,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    let rate = 1;
    let target = 1;
    // Milliseconds of animation time still owed to an in-flight scroll, eased
    // off a frame at a time by `step` below.
    let shift = 0;
    let raf: number | undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const step = () => {
      rate += (target - rate) * EASE;
      if (Math.abs(target - rate) < 0.01) rate = target;

      const anim = track.getAnimations()[0];
      if (anim) {
        anim.playbackRate = rate;

        if (shift !== 0) {
          const slice = reduced.matches ? shift : shift * EASE;
          shift -= slice;
          if (Math.abs(shift) < 0.5) shift = 0;
          // The strip loops every `duration`, so whole periods are invisible —
          // adding them back keeps currentTime positive when a scroll would
          // otherwise push it below zero on a freshly started animation.
          const period = duration * 1000;
          let next = Number(anim.currentTime ?? 0) + slice;
          if (next < 0) next += Math.ceil(-next / period) * period;
          anim.currentTime = next;
        }
      }

      raf =
        rate === target && shift === 0
          ? undefined
          : requestAnimationFrame(step);
    };

    const rampTo = (to: number) => {
      target = to;
      raf ??= requestAnimationFrame(step);
    };

    /**
     * Scrolls the strip just far enough that `card` clears both edges of the
     * viewport. Done by moving the animation's own clock rather than adding a
     * transform, so the loop stays seamless and there is nothing to undo when
     * the pointer leaves.
     */
    const bringIntoView = (card: Element) => {
      const anim = track.getAnimations()[0];
      if (!anim) return;

      // One period covers half the track — that is what the -50% keyframe
      // means — so this is how far the strip travels per millisecond.
      const travel = track.scrollWidth / 2;
      if (travel <= 0) return;

      const rect = card.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const dx =
        rect.left < EDGE_MARGIN
          ? EDGE_MARGIN - rect.left
          : rect.right > viewport - EDGE_MARGIN
            ? viewport - EDGE_MARGIN - rect.right
            : 0;
      if (dx === 0) return;

      // Advancing the clock walks the strip left, except under `reverse`,
      // where the keyframes are read back to front and it walks right.
      const perMs =
        (travel / (duration * 1000)) * (direction === "right" ? 1 : -1);
      shift += dx / perMs;
      raf ??= requestAnimationFrame(step);
    };

    // Only when the pointer crosses into a different card: `mouseover` repeats
    // for every child it passes over, and re-measuring mid-scroll would stack
    // a second correction on top of the one already running.
    let hovered: Element | null = null;
    const onMouseOver = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest("a") ?? null;
      if (card === hovered) return;
      hovered = card;
      if (card) bringIntoView(card);
    };

    const onMouseEnter = () => rampTo(0);
    const onMouseLeave = () => {
      hovered = null;
      rampTo(1);
    };

    root.addEventListener("mouseenter", onMouseEnter);
    root.addEventListener("mouseleave", onMouseLeave);
    if (keepHoveredInView) root.addEventListener("mouseover", onMouseOver);

    return () => {
      root.removeEventListener("mouseenter", onMouseEnter);
      root.removeEventListener("mouseleave", onMouseLeave);
      root.removeEventListener("mouseover", onMouseOver);
      if (raf !== undefined) cancelAnimationFrame(raf);
    };
  }, [duration, direction, keepHoveredInView]);

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
