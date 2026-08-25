import type { ComponentType } from "react";
import Link from "next/link";

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
        <div
          className={`relative z-10 flex flex-col items-center gap-1.5 px-5 py-6 text-center sm:gap-2.5 sm:px-7 sm:py-7 ${textColor}`}
        >
          <Icon className="size-8 sm:size-10" weight="fill" />
          <p className="font-display flex flex-col items-center gap-0.5 sm:gap-1">
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
 * The CTA arrow: a shaft that is an ordinary box and a head that stays an SVG.
 *
 * Split that way because the growth has to move the text. The shaft's *width*
 * is what animates, so the flex row above genuinely gets wider and, being
 * centred, pushes the label out to the left as the arrow reaches right. The
 * earlier version scaled the shaft with a transform, which paints longer
 * without occupying more space — the line never moved. A transform also cannot
 * grow one axis of an arrowhead without shearing it, which is why only the
 * shaft stretches and the head stays a fixed, undistorted glyph.
 *
 * The head keeps its own aspect ratio: give it a height and no width, and the
 * viewBox sizes it. Stroke weight is tuned so it lands on the shaft's 1.5px —
 * 2.6 units of a 24-unit box drawn 14px tall — which is why the head has no
 * responsive size of its own. The two would drift apart at the breakpoint and
 * the join would show.
 */
function CtaArrow() {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center">
      {/* Rounded on both ends; the head overlaps it by a pixel so the cap
          never reads as a seam. */}
      <span className="h-[1.5px] w-2.5 shrink-0 rounded-full bg-current transition-[width] group-hover:w-5 motion-reduce:transition-none sm:w-3 sm:group-hover:w-6" />
      <svg
        viewBox="0 0 11 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="-ml-px h-3.5 w-auto shrink-0"
      >
        <polyline points="2 5.5 9 12 2 18.5" />
      </svg>
    </span>
  );
}
