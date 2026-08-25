import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import range from "~/lib/range";

// Jagged right edge used by stat cards. Cards overlap by CHEVRON_DEPTH so
// each card's teeth appear on top of the next card's bg. copyZBase gives each
// MarqueeTrack copy its own stacking context so the left copy renders on top at
// every seam including the loop point.
const CHEVRON_DEPTH = 10;
const CHEVRON_COUNT = 6;
const BORDER_W = 8;

const STAT_CLIP = `polygon(0 0, ${Array.from(range(CHEVRON_COUNT))
  .flatMap((i) => [
    `calc(100% - ${CHEVRON_DEPTH}px) calc(100% / ${CHEVRON_COUNT * 2} * ${i * 2})`,
    `100% calc(100% / ${CHEVRON_COUNT * 2} * ${i * 2 + 1})`,
  ])
  .join()}, calc(100% - ${CHEVRON_DEPTH}px) 100%, 0 100%)`;

const STAT_CLIP_INNER = `polygon(0 0, calc(100% - ${CHEVRON_DEPTH + BORDER_W}px) 0%, ${Array.from(
  range(CHEVRON_DEPTH),
)
  .flatMap((i) => [
    `calc(100% - ${BORDER_W}px) calc(100% / ${CHEVRON_COUNT * 2} * ${i * 2 + 1})`,
    `calc(100% - ${CHEVRON_DEPTH + BORDER_W}px) calc(100% / ${CHEVRON_COUNT * 2} * ${i * 2 + 2})`,
  ])
  .join()}, 0 100%)`;

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
   * right so each card's teeth sit above the next card's flat edge. Kept as
   * a class rather than an inline `zIndex` number so `hover:z-50` below —
   * which needs to outrank a card to its *left* despite that card's higher
   * resting z — can win on cascade order instead of losing to inline-style
   * specificity.
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
        className="absolute inset-0 bg-mauve-200"
        style={{ clipPath: STAT_CLIP }}
      />
      <Link
        href={href}
        className={`${darkBg} relative block h-full w-full transition-[translate,filter] hover:-translate-x-3 hover:-translate-y-3`}
        style={{ clipPath: STAT_CLIP }}
      >
        <div
          className={`${bg} absolute inset-0`}
          style={{ clipPath: STAT_CLIP_INNER }}
        />
        <div
          className={`relative z-10 flex flex-col items-center gap-2 px-4 py-6 text-center sm:gap-3 sm:px-6 sm:py-8 ${textColor}`}
        >
          <Icon className="size-8 sm:size-10" weight="fill" />
          <p className="text-base font-semibold opacity-80 sm:text-lg">
            {description}
          </p>
          <p className="font-display text-2xl font-extrabold sm:text-4xl">
            {title}
          </p>
          <p className="flex items-center gap-1.5 text-sm font-bold sm:text-base">
            {cta}
            <ArrowRightIcon className="text-sm" />
          </p>
        </div>
      </Link>
    </div>
  );
}
