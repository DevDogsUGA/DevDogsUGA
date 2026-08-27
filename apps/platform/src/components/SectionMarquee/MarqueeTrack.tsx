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

/**
 * How much of a card has to be on screen before it will answer the pointer at
 * all. Below this it is marked `data-clipped` and CSS takes its pointer events
 * away, which is what keeps a scroll from provoking the next one: bringing a
 * card to EDGE_MARGIN leaves whatever slides in behind it barely a sliver
 * wide, and a sliver cannot be hovered, so the chain has nowhere to go.
 */
const MIN_VISIBLE = 0.5;

/** Ratios to be told about. Fine enough that the flip lands within ~5%. */
const VISIBILITY_STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

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
     * Scrolls the strip so `card` clears both edges of the viewport. Done by
     * moving the animation's own clock rather than adding a transform, so the
     * loop stays seamless and there is nothing to undo when the pointer
     * leaves.
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

    // A card too far off screen to be hovered cannot start a scroll, and
    // bringing one to EDGE_MARGIN leaves only a sliver of its neighbour
    // behind it — so the scroll has nothing to hand off to. `shift === 0` is
    // ordinary hygiene on top: no stacking a correction onto a running one.
    let hovered: Element | null = null;
    const onMouseOver = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest("a") ?? null;
      if (card === hovered) return;
      hovered = card;
      if (card && shift === 0) bringIntoView(card);
    };

    // Ratios, not rects: the observer already intersects with every clipping
    // ancestor on the way up, so the strip's own overflow counts as much as
    // the viewport edge does, and it costs nothing per frame.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.toggleAttribute(
            "data-clipped",
            entry.intersectionRatio < MIN_VISIBLE,
          );
        }
      },
      { threshold: VISIBILITY_STEPS },
    );
    if (keepHoveredInView) {
      for (const card of root.querySelectorAll("a")) observer.observe(card);
    }

    /**
     * A strip only costs anything while it is on screen, and at 5,950–13,180px
     * wide these are the largest animated surfaces on the site — the homepage
     * runs five of them and never shows more than two at once. Pausing the
     * off-screen ones is invisible and, unlike lowering COPIES, actually
     * removes work: cutting the copy count measured 13.9 -> 13.9 FPS, because
     * the cost tracks animated area rather than how many copies fill it.
     *
     * Paused through the Animation object rather than `animation-play-state`,
     * because the strip's own animation is an inline style that a stylesheet
     * cannot reach, and because `step` above already owns this object via
     * `playbackRate`/`currentTime`. Pausing composes with both: the hover ramp
     * survives a scroll past, and resuming picks the clock back up where it
     * stopped, so the loop never jumps.
     *
     * Reduced motion holds it paused for good. The stylesheet stops the other
     * expensive animations, but it cannot stop this one for the same reason.
     */
    const applyMotionState = () => {
      const anim = track.getAnimations()[0];
      if (!anim) return;
      if (reduced.matches || !onScreen) anim.pause();
      else anim.play();
    };

    let onScreen = true;
    const visibility = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onScreen = entry.isIntersecting;
        applyMotionState();
      },
      // A little margin so a strip is already running by the time its first
      // pixel is visible, rather than starting as the user arrives at it.
      { rootMargin: "200px 0px" },
    );
    // The track, not the root. `skew-section` gives the strip a negative
    // top margin and a skew, so the track paints well outside its parent --
    // measured at 1440x900, track #1 spans y[803,1665] while its root sits at
    // y[1523,1680]. The root is `overflow-y-visible`, so those 700-odd pixels
    // above it are on screen. Observing the root would leave a visible sliver
    // of a frozen strip at the bottom of the first viewport; observing the
    // track matches what a reader can actually see.
    visibility.observe(track);
    reduced.addEventListener("change", applyMotionState);
    // The animation does not exist until after first paint on some routes.
    requestAnimationFrame(applyMotionState);

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
      observer.disconnect();
      visibility.disconnect();
      reduced.removeEventListener("change", applyMotionState);
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
