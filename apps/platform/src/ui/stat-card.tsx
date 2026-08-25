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
 * The CTA arrow: the shaft *is* the element, and the head hangs off its end.
 *
 * The shaft's width is what animates, so the flex row above genuinely gets
 * wider and, being centred, pushes the label out to the left as the arrow
 * reaches right. A transform would paint longer without occupying more space
 * and the line would never move — and it cannot grow one axis of an arrowhead
 * without shearing it either, which is why the head stays a fixed glyph.
 *
 * The head is positioned rather than laid out beside the shaft, because a
 * chevron only has material at its apex along the centreline the shaft runs
 * down. Set side by side, the shaft stopped at the head's *box* and the ~5px
 * from there to the apex read as a gap in the arrow. Anchoring the box's right
 * edge to the shaft's end, with the apex drawn on that edge, is what makes the
 * two one stroke — no offset to keep in sync with the head's size.
 *
 * Its own size stays fixed at every breakpoint: the stroke weight is chosen to
 * land on the shaft's 2.5px at 14px tall — a 24-unit box drawn 14px tall scales
 * by 14/24, so the shaft's weight times 24/14 is the stroke that matches it.
 * Let the head resize at a breakpoint and the two weights drift apart, and the
 * join between them shows.
 */
function CtaArrow() {
  return (
    <span
      aria-hidden
      className="relative inline-block h-[2.5px] w-2.5 shrink-0 rounded-full bg-current transition-[width] group-hover:w-5 group-hover:delay-300 motion-reduce:transition-none sm:w-3 sm:group-hover:w-6"
    >
      {/* overflow-visible so the round join at the apex isn't shaved off by
          the viewBox edge it sits on. */}
      <svg
        viewBox="0 0 11 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={4.29}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute top-1/2 right-0 h-3.5 w-auto -translate-y-1/2 overflow-visible"
      >
        {/* Apex on the box's right edge — that is the join with the shaft. The
            arms are longer than the old ones: at this weight a shorter chevron
            closes up into a blob rather than reading as an arrowhead. */}
        <polyline points="2 5 11 12 2 19" />
      </svg>
    </span>
  );
}
