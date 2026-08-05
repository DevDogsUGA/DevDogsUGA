import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import BallotForm, { type BallotOptionView } from "~/components/BallotForm";
import ConsolePageShell from "~/components/ConsolePageShell";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { castBallot } from "~/server/actions/elections";
import { expectSession } from "~/server/auth";
import {
  presentedOrder,
  seedFrom,
} from "~/server/elections/ballotOrder";
import {
  getBallotOptions,
  getElectionBySlug,
  getEligibility,
  getMyBallot,
} from "~/server/loaders/elections";

/**
 * /vote/[slug] — one ballot.
 *
 * The presented order is computed HERE, on the server, from a seed derived
 * from the election and the voter. Shuffling in the browser would reshuffle on
 * every render and on every reload, moving options under somebody halfway
 * through ordering them — and it would make "I put us second" unverifiable
 * against what they actually submitted.
 */
export default async function BallotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Voting windows are wall-clock. Nothing on this page may be prerendered.
  await connection();

  const { slug } = await params;
  const userId = await expectSession().catch(() => redirect("/auth"));

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
    <ConsolePageShell
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
      <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
        <p>
          {election.electorate === "officers"
            ? "This is the officer ballot. It is one ballot, and it carries the weight of an entire category."
            : "One ballot per team, cast by the lead."}
        </p>
        <p className="mt-2 opacity-70">
          The list below started in an order chosen at random for you — every
          voter sees a different one, so leaving it alone says nothing about
          what you think.
        </p>
      </section>

      {existing.length > 0 ? (
        <CastBallot existing={existing} byId={byId} />
      ) : eligibility.canVote ? (
        <BallotForm
          electionId={election.id}
          options={ordered.map(
            (option): BallotOptionView => ({
              teamId: option.teamId,
              teamName: option.teamName,
              submissionUrl: option.submissionUrl,
              isOwnTeam: option.teamId === eligibility.teamId,
            }),
          )}
          castBallot={castBallot}
        />
      ) : (
        <p className="rounded-sm border-2 border-black bg-white p-6 text-sm">
          {BLOCK_MESSAGES[eligibility.reason ?? "not_eligible"]}
        </p>
      )}

      <Link href="/vote" className="text-sm underline">
        Back to open elections
      </Link>
    </ConsolePageShell>
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
    <section className="rounded-sm border-2 border-black bg-white p-4">
      <h2 className="mb-3 font-semibold">Your ballot</h2>
      <ol className="flex flex-col gap-1 text-sm">
        {existing.map((entry) => (
          <li key={entry.teamId} className="flex gap-3">
            <span className="w-6 text-right tabular-nums opacity-70">
              {entry.rank}
            </span>
            <span>{byId.get(entry.teamId)?.teamName ?? "Unknown team"}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs opacity-70">
        A ballot cannot be changed once cast.
      </p>
    </section>
  );
}
