import Link from "next/link";
import range from "~/lib/range";

// Jagged right edge used by stat cards. Cards overlap by CHEVRON_DEPTH so
// each card's teeth appear on top of the next card's bg. copyZBase gives each
// ScrollMarquee copy its own stacking context so the left copy renders on top at
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
  num: string;
  label: string;
  bg: string;
  darkBg: string;
  href: string;
  zIndex: number;
}

export default function StatCard({
  num,
  label,
  bg,
  darkBg,
  href,
  zIndex,
}: Props) {
  return (
    <Link
      href={href}
      className={`${darkBg} relative inline-block w-65 transition hover:brightness-95 sm:w-85`}
      style={{
        clipPath: STAT_CLIP,
        marginRight: `-${CHEVRON_DEPTH}px`,
        zIndex,
      }}
    >
      <div
        className={`${bg} absolute inset-0`}
        style={{ clipPath: STAT_CLIP_INNER }}
      />
      <div className="relative z-10 py-6 text-center sm:py-8">
        <p className="font-display text-3xl font-extrabold sm:text-5xl">
          {num}
        </p>
        <p className="mt-1 text-sm font-semibold sm:text-base">{label}</p>
      </div>
    </Link>
  );
}
