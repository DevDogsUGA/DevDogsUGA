import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import BallotForm, { type BallotOptionView } from "~/components/BallotForm";
import PageShell from "~/components/PageShell";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { castBallot } from "~/server/actions/elections";
import { requireSession } from "~/server/auth/require";
import { presentedOrder, seedFrom } from "~/server/elections/ballotOrder";
import {
  getBallotOptions,
  getElectionBySlug,
  getEligibility,
  getMyBallot,
} from "~/server/loaders/elections";

/**
 * A ballot, and one that is shuffled per voter. Indexing it would publish a
 * presented order that is only true for whoever the crawler was, on a page
 * nobody can open without a session anyway.
 *
 * Static rather than a `generateMetadata` reading the election's name: naming
 * the election in a tab title would cost a query on a page that already makes
 * four, and buys nothing a `noindex` route can use.
 */
export const metadata: Metadata = {
  title: "Ballot | DevDogs",
  robots: { index: false },
};

/**
 * /vote/[slug], one ballot.
 *
 * The presented order is computed HERE, on the server, from a seed derived from
 * the election and the voter. Shuffling in the browser would reshuffle on every
 * render and on every reload, moving options under somebody halfway through
 * ordering them, and it would make "I put us second" unverifiable against what
 * they actually submitted.
 */
export default async function BallotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Voting windows are wall-clock. Nothing on this page may be prerendered.
  await connection();

  const { slug } = await params;
  const userId = await requireSession();

  const election = await getElectionBySlug(slug);
  if (!election) notFound();

  const eligibility = await getEligibility(election.id, userId);
  const options = await getBallotOptions(election.competitionId);
  const existing = await getMyBallot(election.id, userId);

  const ordered = presentedOrder(
    options,
    eligibility.teamId,
    seedFrom(election.id, userId),
  );

  const byId = new Map(options.map((o) => [o.teamId, o]));

  return (
    <PageShell
      accent="blue"
      title={election.title}
      description={
        <>
          Rank every entry, best first. Closes{" "}
          <time dateTime={election.closesAt.toISOString()}>
            {formatEventDateTime(election.closesAt)} (
            {formatRelative(election.closesAt)})
          </time>
          .
        </>
      }
    >
      <ConsoleCard.Root id="how-voting-works">
        <ConsoleCard.Header title="How voting works" />
        <ConsoleCard.Content>
          {/* Both sentences are one thought, so they are one child. A second
              direct child would put a divider through the middle of it. */}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-mauve-300">
              {election.electorate === "officers"
                ? "This is the officer ballot. It is one ballot, and it carries the weight of an entire category."
                : "One ballot per team, cast by the lead."}
            </p>
            <p className="text-sm text-mauve-400">
              The list below started in an order chosen at random for you —
              every voter sees a different one, so leaving it alone says nothing
              about what you think.
            </p>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {existing.length > 0 ? (
        <CastBallot existing={existing} byId={byId} />
      ) : eligibility.canVote ? (
        <BallotForm
          electionId={election.id}
          options={ordered.map((option): BallotOptionView => ({
            teamId: option.teamId,
            teamName: option.teamName,
            submissionUrl: option.submissionUrl,
            isOwnTeam: option.teamId === eligibility.teamId,
          }))}
          castBallot={castBallot}
        />
      ) : (
        <Callout tone="info">
          {BLOCK_MESSAGES[eligibility.reason ?? "not_eligible"]}
        </Callout>
      )}

      <Link
        href="/vote"
        className="self-start text-sm text-mauve-400 underline transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
      >
        Back to open elections
      </Link>
    </PageShell>
  );
}

const BLOCK_MESSAGES: Record<string, string> = {
  not_open: "Voting is not open for this election.",
  not_eligible: "This ballot is not yours to cast.",
  already_voted: "A ballot has already been cast.",
  no_team: "You are not on a team in this competition.",
  not_the_lead:
    "Your team lead casts this ballot. You can see what they submitted once it is in.",
};

/**
 * What was submitted.
 *
 * Shown to the voter afterwards rather than only confirming receipt: a ranking
 * is the kind of thing people second-guess, and "did I actually put them
 * third?" has no other answer once the form is gone.
 */
function CastBallot({
  existing,
  byId,
}: {
  existing: { teamId: string; rank: number }[];
  byId: Map<string, { teamName: string }>;
}) {
  return (
    <ConsoleCard.Root id="your-ballot">
      <ConsoleCard.Header title="Your ballot" />
      <ConsoleCard.Content>
        {/* The ranking and the caveat about it are one child: a divider
            between them would read as two unrelated sections. */}
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-1 text-sm">
            {existing.map((entry) => (
              <li key={entry.teamId} className="flex gap-3">
                <span className="w-6 shrink-0 text-right text-mauve-400 tabular-nums">
                  {entry.rank}
                </span>
                <span className="text-white">
                  {byId.get(entry.teamId)?.teamName ?? "Unknown team"}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-mauve-400">
            A ballot cannot be changed once cast.
          </p>
        </div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
  );
}
