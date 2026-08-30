/**
 * Lifetime points on a profile, with the number that makes them readable.
 *
 * Both figures, never just the total. A points total means little without the
 * count of competitions behind it: 1,700 is an excellent two-competition record
 * and a poor five-competition one. The count is also the only thing separating
 * the two ways to hold zero, a member who has never competed and a member whose
 * competitions have not been finalized yet. `getMemberPoints` returns zero for
 * both on purpose, so the distinction has to be made here or not at all.
 *
 * Takes the loader's shape as props rather than a user id, matching
 * `StarTotalsRow`: a profile page already knows whose profile it is and reads
 * everything for that member in one place.
 */
import type { MemberPointsTotals } from "~/server/loaders/points";

export default function PointsSummary({
  lifetimePoints,
  competitionsScored,
}: MemberPointsTotals) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <dl className="flex gap-6">
        <div className="flex flex-col">
          <dt className="text-xs tracking-wide text-mauve-400 uppercase">
            Lifetime points
          </dt>
          <dd className="text-2xl font-bold tabular-nums">{lifetimePoints}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs tracking-wide text-mauve-400 uppercase">
            Competitions scored
          </dt>
          <dd className="text-2xl font-bold tabular-nums">
            {competitionsScored}
          </dd>
        </div>
      </dl>

      <p className="mt-3 max-w-prose text-xs text-mauve-400">
        {competitionsScored === 0
          ? "No competition has been finalized for this member yet. Points are awarded in one pass when a competition is scored, so a competition still being judged shows nothing here."
          : `Each competition is worth up to 1000 — 600 for the requirements the team met, up to 400 from the elections. That is a ceiling of ${(
              competitionsScored * 1000
            ).toLocaleString("en-US")} across ${competitionsScored} ${
              competitionsScored === 1 ? "competition" : "competitions"
            }.`}
      </p>
    </div>
  );
}
