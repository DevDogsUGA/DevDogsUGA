import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import Badge from "~/ui/badge";
import PageShell from "~/components/PageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { requireSession } from "~/server/auth/require";
import { getEligibility, getOpenElections } from "~/server/loaders/elections";

/**
 * Behind `expectSession()`, and the list is filtered by what the viewer is
 * eligible to vote in, so there is no anonymous version of this page for a
 * crawler to hold.
 */
export const metadata: Metadata = {
  title: "Vote | DevDogs",
  robots: { index: false },
};

/**
 * /vote: everything open right now.
 *
 * Eligibility is resolved here rather than on the ballot page so the list can
 * say why a ballot is not the viewer's to cast. "Your team lead casts this
 * one" on the list beats clicking through to find a disabled form.
 */
export default async function VotePage() {
  // Voting windows are wall-clock, so nothing here can be prerendered. An
  // election that closed a minute ago must not still be listed as open.
  await connection();

  const userId = await requireSession();
  const open = await getOpenElections();

  const withEligibility = await Promise.all(
    open.map(async (election) => ({
      election,
      eligibility: await getEligibility(election.id, userId),
    })),
  );

  return (
    <PageShell
      accent="blue"
      title="Vote"
      description="Rank the competing implementations. Every ballot ranks every entry."
    >
      {withEligibility.length === 0 ? (
        <EmptyState
          title="Nothing open to vote on"
          body="Nothing is open for voting right now. Elections open once judging begins for a competition."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {withEligibility.map(({ election, eligibility }) => (
            <li
              key={election.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
            >
              <span className="flex flex-col">
                <span className="font-semibold text-white">
                  {election.title}
                </span>
                <span className="text-xs text-mauve-400">
                  {election.electorate === "officers"
                    ? "Officer ballot"
                    : "One ballot per team"}
                  {" · closes "}
                  <time dateTime={election.closesAt.toISOString()}>
                    {formatEventDateTime(election.closesAt)} (
                    {formatRelative(election.closesAt)})
                  </time>
                </span>
              </span>

              {eligibility.canVote ? (
                <Link
                  href={`/vote/${election.slug}`}
                  className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
                >
                  Cast ballot
                </Link>
              ) : (
                // Not castable is a standing status, not prose. A chip reads
                // as one at the same glance as the button it stands in for.
                <Badge variant="default">
                  {BLOCK_LABELS[eligibility.reason ?? "not_eligible"]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

const BLOCK_LABELS: Record<string, string> = {
  not_open: "Closed",
  not_eligible: "Not your ballot",
  already_voted: "Ballot cast",
  no_team: "You are not on a team in this competition",
  not_the_lead: "Your team lead casts this one",
};
