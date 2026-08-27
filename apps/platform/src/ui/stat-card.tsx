import type { ComponentType } from "react";
import Link from "next/link";

import { blobsBackgroundImage, type BlobDef } from "./blob-gradient";

// Both vertical edges of a card are the SAME zigzag, in phase, exactly
// CHEVRON_DEPTH apart — which is what the -CHEVRON_DEPTH margin on the wrapper
// below pays for: a card's right-hand teeth drop precisely into the next
// card's left-hand valleys. The tiling is exact rather than overlapping, so
// what shows at a seam is the two cards' borders meeting, not one card's teeth
// painted over the other's fill.
const CHEVRON_DEPTH = 10;
const CHEVRON_COUNT = 6;
/** Vertices down one edge: every tooth contributes a peak and a valley. */
const CHEVRON_STEPS = CHEVRON_COUNT * 2;
/** Thickness of the darkBg ring, now drawn on all four sides. */
const BORDER_W = 5;

/**
 * The card silhouette, pulled in by `inset` px on every side: `inset: 0` is
 * the outer shape, `inset: BORDER_W` is the fill, and the band between the two
 * reads as the border.
 *
 * The zigzag edges inset horizontally, so the border measures exactly BORDER_W
 * across the flats and a little less across the diagonals. At this tooth size
 * that difference doesn't read.
 */
function chevronClip(inset: number) {
  const rightIn = `calc(100% - ${CHEVRON_DEPTH + inset}px)`;
  const rightOut = `calc(100% - ${inset}px)`;
  const leftIn = `${inset}px`;
  const leftOut = `${CHEVRON_DEPTH + inset}px`;

  // Top and bottom are flat, so they inset straight down and up. Every vertex
  // between them keeps its exact share of the height, which is what holds the
  // two edges' teeth in phase with each other and with the neighbouring card.
  const y = (step: number) => {
    if (step === 0) return `${inset}px`;
    if (step === CHEVRON_STEPS) return `calc(100% - ${inset}px)`;
    return `calc(100% / ${CHEVRON_STEPS} * ${step})`;
  };

  const points = [`${leftIn} ${y(0)}`];
  for (let step = 0; step < CHEVRON_STEPS; step++) {
    points.push(`${step % 2 === 0 ? rightIn : rightOut} ${y(step)}`);
  }
  points.push(
    `${rightIn} ${y(CHEVRON_STEPS)}`,
    `${leftIn} ${y(CHEVRON_STEPS)}`,
  );
  for (let step = CHEVRON_STEPS - 1; step >= 1; step--) {
    points.push(`${step % 2 === 0 ? leftIn : leftOut} ${y(step)}`);
  }

  return `polygon(${points.join()})`;
}

const STAT_CLIP = chevronClip(0);
const STAT_CLIP_INNER = chevronClip(BORDER_W);

/**
 * Everything above the CTA steps back while the card is hovered, leaving the
 * one line that says what the click does as the only thing at full strength.
 * It waits out the lift on the arrow's delay and drops the moment the pointer
 * goes, the same way round, so the arrow and the copy read as a single move
 * rather than two effects that happen to overlap.
 */
const RECEDE_ON_HOVER =
  "transition-opacity delay-0 group-hover:opacity-70 group-hover:delay-[450ms] motion-reduce:transition-none";

/**
 * How strongly the section's wash reads on the card.
 *
 * The blobs are drawn for a near-white section base and land here on a 400-level
 * fill, so at full strength they wash it out rather than tint it. This is the
 * texture's share of the card, the way `opacity-15` was the dot grid's.
 */
const BLOB_OPACITY = 0.45;

interface Props {
  title: string;
  description: string;
  /** The section's unique "go read it" line, paired with an arrow icon. */
  cta: string;
  /** Drawn above the copy, filled, in {@link textColor}. What makes the card. */
  icon: ComponentType<{ className?: string; weight?: "fill" }>;
  /**
   * One literal Tailwind color class (e.g. `"text-rose-950"`), applied to the
   * whole text block so the icon — which draws in `currentColor` — and every
   * line of copy pick up the same accent. Kept literal, not built from a hue
   * prop: Tailwind's scanner only generates classes it can see spelled out in
   * source, and `bg`/`darkBg` below follow the same rule.
   */
  textColor: string;
  bg: string;
  darkBg: string;
  /**
   * The blobs of the section {@link href} points at — the same array that
   * section hands `SectionBackground`, so the card cannot drift from the place
   * it is a door to.
   */
  blobs: BlobDef[];
  href: string;
  /**
   * One literal Tailwind `z-*` class (e.g. `"z-30"`), descending left to
   * right. The edges tile exactly, so this decides nothing at rest — it is
   * for the hover lift, which travels further than CHEVRON_DEPTH and so has
   * to cover the card on its left. Kept as a class rather than an inline
   * `zIndex` number so `hover:z-50` below, which has to outrank that
   * left-hand card's *higher* resting z, wins on cascade order instead of
   * losing to inline-style specificity.
   */
  zIndexClass: string;
}

export default function StatCard({
  title,
  description,
  cta,
  icon: Icon,
  textColor,
  bg,
  darkBg,
  blobs,
  href,
  zIndexClass,
}: Props) {
  return (
    <div
      className={`relative inline-block w-65 sm:w-85 ${zIndexClass} hover:z-50`}
      style={{ marginRight: `-${CHEVRON_DEPTH}px` }}
    >
      {/* Sits at the card's resting slot so lifting it on hover reveals a
          block instead of a gap — a stand-in for `shadow-block-*`, which
          `clip-path` would clip away before it ever pokes out past the
          chevron's own edge. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-mauve-800"
        style={{ clipPath: STAT_CLIP }}
      />
      <Link
        href={href}
        className={`${darkBg} group relative block h-full w-full transition-[translate,filter] hover:-translate-x-3 hover:-translate-y-3`}
        style={{ clipPath: STAT_CLIP }}
      >
        <div
          className={`${bg} absolute inset-0`}
          style={{ clipPath: STAT_CLIP_INNER }}
        />
        {/* The wash from the section this card opens, so the two read as one
            place. Clipped to the fill rather than the outer shape, the same way
            the dot grid it replaced was, so it stops at the border instead of
            tinting it.

            One element for the whole set rather than SectionBackground's layer
            each: nothing here has a parallax rate to keep them apart, and this
            strip renders its children six times. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath: STAT_CLIP_INNER,
            backgroundImage: blobsBackgroundImage(blobs),
            opacity: BLOB_OPACITY,
          }}
        />
        <div
          className={`relative z-10 flex flex-col items-center gap-1.5 px-5 py-6 text-center sm:gap-2.5 sm:px-7 sm:py-7 ${textColor}`}
        >
          <Icon
            className={`size-8 sm:size-10 ${RECEDE_ON_HOVER}`}
            weight="fill"
          />
          <p
            className={`font-display flex flex-col items-center gap-0.5 sm:gap-1 ${RECEDE_ON_HOVER}`}
          >
            <span className="text-2xl font-extrabold sm:text-4xl">{title}</span>
            <span className="text-xs font-bold uppercase italic opacity-80 sm:text-sm">
              &ldquo;{description}&rdquo;
            </span>
          </p>
          <p className="flex items-center gap-1.5 font-bold sm:text-lg">
            {cta}
            <CtaArrow />
          </p>
        </div>
      </Link>
    </div>
  );
}

/**
 * The CTA arrow: the shaft *is* the element, and the head hangs off its end.
 *
 * The shaft's width is what animates, so the flex row above genuinely gets
 * wider and, being centred, pushes the label out to the left as the arrow
 * reaches right. A transform would paint longer without occupying more space
 * and the line would never move — and it cannot grow one axis of an arrowhead
 * without shearing it either, which is why the head stays a fixed glyph.
 *
 * The head is positioned rather than laid out beside the shaft. Set side by
 * side, the shaft stops at the head's *box*, and a head that narrows to a
 * point leaves the distance from that box edge to the tip reading as a gap in
 * the arrow. Overlaying the two instead — the box's right edge on the shaft's
 * end, the tip drawn on that edge — makes them one shape at any head size,
 * with no offset to keep in sync.
 *
 * The head is Phosphor's own `ArrowRight` with its shaft cut out of the path,
 * so it belongs to the same set as the icons above it — and at `fill` weight,
 * matching the card's other icons, which is also what makes it sizeable. The
 * bold head is drawn as two arms of a fixed thickness, so matching those arms
 * to the shaft pins the head's height to seven times it: 17.5px against a
 * 2.5px line, taller than the text beside it. A solid head has no arm to
 * match, so its size is free and set by what looks right next to the label.
 *
 * Phosphor's glyph is one filled path whose bar runs out to the round cap at
 * the far end and back; removing that run and closing the outline straight up
 * the back at x=136 leaves the head alone, on its original coordinates. The
 * window onto it is the viewBox, ending at x=224 — the tip of the rounded
 * point — which puts the tip on the box's right edge and therefore exactly on
 * the shaft's end, with the head's back edge sitting over the shaft in the
 * same colour so the meeting point is invisible.
 */
function CtaArrow() {
  return (
    <span
      aria-hidden
      className="relative inline-block h-[2.5px] w-2.5 shrink-0 rounded-full bg-current transition-[width] delay-0 group-hover:w-5 group-hover:delay-[450ms] motion-reduce:transition-none sm:w-3 sm:group-hover:w-6"
    >
      <svg
        viewBox="136 48 88 160"
        fill="currentColor"
        className="absolute top-1/2 right-0 h-[11px] w-auto -translate-y-1/2"
      >
        <path d="M221.66,133.66l-72,72A8,8,0,0,1,136,200V56A8,8,0,0,1,149.66,50.34l72,72A8,8,0,0,1,221.66,133.66Z" />
      </svg>
    </span>
  );
}
