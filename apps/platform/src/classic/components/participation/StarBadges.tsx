type StarTotals = { meetingStars: number };

/** Lifetime participation volume shown above the member passport. */
export function StarTotalsRow({ totals }: { totals: StarTotals }) {
  return (
    <dl className="flex gap-6">
      <div className="flex flex-col">
        <dt className="text-xs tracking-wide text-mauve-400 uppercase">
          Meetings
        </dt>
        <dd className="flex items-baseline gap-1.5 text-2xl font-bold text-white tabular-nums">
          <span aria-hidden className="text-amber-300">
            ★
          </span>
          {totals.meetingStars}
        </dd>
      </div>
    </dl>
  );
}
