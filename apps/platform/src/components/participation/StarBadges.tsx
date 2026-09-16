import type { StarTotals } from "~/server/loaders/stars";

/** Lifetime participation volume shown above the member passport. */
export function StarTotalsRow({ totals }: { totals: StarTotals }) {
  const entries: [string, number, string][] = [
    ["Meetings", totals.meetingStars, "★"],
    ["Competitions", totals.competitionStars, "★"],
    ["Wins", totals.wins, "♛"],
  ];

  return (
    <dl className="flex gap-6">
      {entries.map(([label, value, glyph]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-xs tracking-wide text-mauve-400 uppercase">
            {label}
          </dt>
          <dd className="flex items-baseline gap-1.5 text-2xl font-bold tabular-nums">
            <span aria-hidden className="text-amber-300">
              {glyph}
            </span>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
