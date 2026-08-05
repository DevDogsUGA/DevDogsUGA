import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { expectSession } from "~/server/auth";
import {
  getMemberPointsLeaderboard,
  type MemberPointsRow,
} from "~/server/loaders/points";

/**
 * /leaderboard/points — lifetime points, every member.
 *
 * No filtering is applied here. `memberPoints` is a `security_invoker` view, so
 * it already shows exactly the competitions the caller may see — adding a
 * predicate on top would be a second, weaker copy of a rule the database is
 * already enforcing, and the copy is the one that goes stale.
 *
 * Signing in is not required. A signed-out visitor sees the same public
 * standings sum that a member does; the session is read only to mark the
 * viewer's own row, so `expectSession` failing is an ordinary outcome here
 * rather than a redirect.
 */
export default async function PointsLeaderboardPage() {
  const viewerId = await expectSession().catch(() => null);
  const rows = await getMemberPointsLeaderboard();
  const ranked = withSharedRanks(rows);

  return (
    <ConsolePageShell
      accent="amber"
      title="Points"
      description="Lifetime points across every finalized competition. Each competition is worth up to 1000."
    >
      <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
        <p>
          A member earns their team&rsquo;s competition total — 600 for the
          requirements the team met plus up to 400 from the elections — for
          every competition they competed in.
        </p>
        <p className="mt-2 opacity-70">
          A competition counts only once it has been finalized. A competition
          still being judged contributes nothing to anybody&rsquo;s total yet,
          which is why a number here can go up without anyone doing anything
          new.
        </p>
      </section>

      {ranked.length === 0 ? (
        <EmptyState
          title="No points have been awarded yet"
          body={
            "Points appear when the first competition is finalized. Until " +
            "then there is nothing to rank — this is an empty board, not a " +
            "board full of zeroes."
          }
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {ranked.map(({ row, rank }) => {
            const isViewer = row.userId === viewerId;

            return (
              <li
                key={row.userId}
                className={`flex flex-wrap items-baseline justify-between gap-4 rounded-sm border-2 border-black p-3 ${
                  isViewer ? "bg-amber-50" : "bg-white"
                }`}
              >
                <span className="flex items-baseline gap-3">
                  <span className="w-8 text-right text-lg font-bold tabular-nums">
                    {rank}
                  </span>
                  <span className="font-semibold">
                    {/* `preferredName` is a left join and can be null for a
                        member who has scored but never filled in a profile.
                        Falling back to the id would publish it, so the row
                        stays anonymous instead. */}
                    {row.preferredName ?? "A member"}
                    {isViewer && (
                      <span className="ml-2 text-xs font-normal opacity-70">
                        you
                      </span>
                    )}
                  </span>
                </span>

                <span className="flex items-baseline gap-4 text-sm">
                  <span className="opacity-70">
                    {row.competitionsScored}{" "}
                    {row.competitionsScored === 1
                      ? "competition"
                      : "competitions"}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {row.lifetimePoints}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </ConsolePageShell>
  );
}

/**
 * Rank the rows, letting equal totals share a rank.
 *
 * The opposite call from the competition standings page, and deliberately so.
 * There, an order was decided by a tiebreak chain and must be shown as decided.
 * Here nothing has adjudicated anything: two members on 1,730 points are tied,
 * full stop, and numbering them 4 and 5 by whatever order the query happened to
 * return would invent a distinction the platform has no basis for and cannot
 * keep stable between two loads of the same page.
 *
 * Ranks are competition-style (1, 2, 2, 4) rather than dense: with a shared
 * second place, the next member really is behind two people.
 */
function withSharedRanks(
  rows: MemberPointsRow[],
): { row: MemberPointsRow; rank: number }[] {
  let rank = 0;
  let previousPoints: number | null = null;

  return rows.map((row, index) => {
    if (row.lifetimePoints !== previousPoints) {
      rank = index + 1;
      previousPoints = row.lifetimePoints;
    }

    return { row, rank };
  });
}
