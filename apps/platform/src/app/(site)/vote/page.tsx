import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ConsolePageShell from "~/components/ConsolePageShell";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { expectSession } from "~/server/auth";
import { getEligibility, getOpenElections } from "~/server/loaders/elections";

/**
 * Behind `expectSession()`, and the list is filtered by what the viewer is
 * eligible to vote in — so there is no such thing as the anonymous version of
 * this page for a crawler to hold.
 */
export const metadata: Metadata = {
  title: "Vote | DevDogs",
  robots: { index: false },
};

/**
 * /vote — everything open right now.
 *
 * Eligibility is resolved here rather than on the ballot page so the list can
 * say why a ballot is not the viewer's to cast. "Your team lead casts this
 * one" on the list is a different experience from clicking through and finding
 * a disabled form.
 */
export default async function VotePage() {
  // Voting windows are wall-clock, so nothing here can be prerendered — an
  // election that closed a minute ago must not still be listed as open.
  await connection();

  const userId = await expectSession().catch(() => redirect("/auth"));
  const open = await getOpenElections();

  const withEligibility = await Promise.all(
    open.map(async (election) => ({
      election,
      eligibility: await getEligibility(election.id, userId),
    })),
  );

  return (
    <ConsolePageShell
      accent="blue"
      title="Vote"
      description="Rank the competing implementations. Every ballot ranks every entry."
    >
      {withEligibility.length === 0 ? (
        <p className="rounded-sm border-2 border-black bg-white p-6 text-sm">
          Nothing is open for voting right now. Elections open once judging
          begins for a competition.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {withEligibility.map(({ election, eligibility }) => (
            <li
              key={election.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-black bg-white p-4"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{election.title}</span>
                <span className="text-xs opacity-70">
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
                  className="rounded-sm border-2 border-black bg-black px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Cast ballot
                </Link>
              ) : (
                <span className="text-sm opacity-70">
                  {BLOCK_LABELS[eligibility.reason ?? "not_eligible"]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </ConsolePageShell>
  );
}

const BLOCK_LABELS: Record<string, string> = {
  not_open: "Closed",
  not_eligible: "Not your ballot",
  already_voted: "Ballot cast",
  no_team: "You are not on a team in this competition",
  not_the_lead: "Your team lead casts this one",
};
