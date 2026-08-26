import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventDate } from "~/lib/eventTime";
import {
  getElectionResults,
  getPointsElections,
  getTiebreakDisclosures,
  type ElectionResultRow,
} from "~/server/loaders/elections";
import { getCompetitionBySlug } from "~/server/loaders/meetings";
import { getStandings, type StandingRow } from "~/server/loaders/points";

/**
 * /competitions/[slug]/results — what the tally decided, and how.
 *
 * The page is built around one refusal: it never shows a team a single number.
 * A competition total collapses two blocks that measure different things — 600
 * for requirements a team met on its own, 400 for how other people ranked it —
 * and the collapsed version cannot distinguish "did half the work" from "did
 * all of it and lost the vote". Both are on screen for every team, always.
 *
 * Nothing here reads the clock: standings, election results and disclosures are
 * all written by the tally and do not change with time, so there is no
 * `connection()` and the page is a plain uncached read inside the site layout's
 * content boundary.
 */

/**
 * The only competition route that is not behind `expectSession()`, so the only
 * one worth describing to anything but a browser tab — the two under `teams/`
 * redirect an anonymous visitor to `/auth` and carry `robots: { index: false }`
 * instead of this.
 *
 * `getCompetitionBySlug` is called here as well as in the page body; React's
 * `cache()` wrapper on the loader is what stops that being a second query
 * within the same request.
 *
 * A competition has no name of its own — it is called after its project — which
 * is why the title is built rather than stored, and why the miss branch cannot
 * name anything: an unknown slug has no project behind it to name.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return {
      title: "Competition not found | DevDogs",
      description: "No DevDogs competition matches this link.",
    };
  }

  return {
    title: `${competition.name} results | DevDogs`,
    // The scoring split is the description rather than a placing, because the
    // page refuses to reduce a team to one number and an unfurl that led with
    // a winner would undo that in the one place nobody proofreads.
    description: `Final standings for the DevDogs ${competition.name} competition, scored out of 1000 — 600 for requirements met and 400 from the member elections.`,
  };
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const competition = await getCompetitionBySlug(slug);
  if (!competition) notFound();

  const standings = await getStandings(slug);
  const disclosures = await getTiebreakDisclosures(competition.id);
  const pointsElections = await getPointsElections(competition.id);
  const electionResults = await Promise.all(
    pointsElections.map(async (election) => ({
      election,
      results: await getElectionResults(election.id),
    })),
  );

  // Team names come from the standings rather than from a second query: the
  // disclosure table stores ids only, and every team in a disclosure is by
  // definition a team that placed, so the join has nothing to miss.
  const teamNames = new Map(standings.map((row) => [row.teamId, row.teamName]));

  return (
    <ConsolePageShell
      accent="amber"
      title={`${competition.name} — results`}
      description={`Judged ${formatEventDate(competition.judgingStartsAt ?? competition.openedOn)}. Scored out of 1000: 600 for requirements met, 400 from the elections.`}
    >
      <ScoringExplainer />

      {standings.length === 0 ? (
        <EmptyState
          title="This competition has not been scored yet"
          body={
            "Standings are written in one pass when the tally runs, so until " +
            "then there are no rows to show — not rows of zeroes. Nothing " +
            "here says anything about what any team earned; the tally has " +
            "simply not run, or is blocked waiting on the officers' " +
            "requirement counts or tiebreak ballot."
          }
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {standings.map((row) => (
            <StandingCard
              key={row.teamId}
              row={row}
              competitionSlug={competition.slug}
            />
          ))}
        </ol>
      )}

      {disclosures.length > 0 && (
        <TiebreakDisclosures
          pairs={disclosures}
          teamNames={teamNames}
          hasCopeland={standings.some((r) => r.resolvedBy === "copeland")}
        />
      )}

      {electionResults.map(({ election, results }) => (
        <ElectionCard
          key={election.id}
          title={election.title}
          electorate={election.electorate}
          results={results}
        />
      ))}
    </ConsolePageShell>
  );
}

/**
 * One team's row.
 *
 * Rendered in the order `getStandings` returned, which is by `placement` and
 * never by points — a tiebreak can leave two teams on identical totals in a
 * deliberate order, and re-sorting here by `totalPoints` would silently re-tie
 * on screen the exact pair the whole tiebreak chain ran to separate.
 */
function StandingCard({
  row,
  competitionSlug,
}: {
  row: StandingRow;
  competitionSlug: string;
}) {
  return (
    <li className="rounded-sm border-2 border-black bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums">
            #{row.placement}
          </span>
          <Link
            href={`/competitions/${competitionSlug}/teams/${row.teamSlug}`}
            className="font-semibold underline"
          >
            {row.teamName}
          </Link>
          <span className="text-xs opacity-70">
            {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
          </span>
        </span>

        <span className="text-lg font-bold tabular-nums">
          {row.totalPoints}
          <span className="text-sm font-normal opacity-70"> / 1000</span>
        </span>
      </div>

      {/* The split, always both halves. The captions carry the inputs rather
          than only the outputs, because "550 / 600" alone is not checkable and
          "11 of 12 requirements" is — and the standings row stores those counts
          precisely so the arithmetic can be reproduced from what was published
          rather than from a team's current, possibly-corrected grade. */}
      <dl className="mt-4 grid gap-3 @sm:grid-cols-2">
        <Block
          label="Requirements"
          points={row.requirementPoints}
          outOf={600}
          caption={
            row.requirementCount === 0
              ? "This competition had no requirements, so the elections were worth the full 1000."
              : `${row.requirementsMet} of ${row.requirementCount} met — objective, and entirely in this team's hands.`
          }
        />
        <Block
          label="Elections"
          points={row.electionPoints}
          outOf={400}
          caption="Comparative: earned only against the other entries, by how voters ranked this one."
        />
      </dl>

      {row.resolvedBy !== null && row.resolvedBy !== "points" && (
        <p className="mt-3 rounded-sm border-2 border-black bg-amber-50 p-2 text-xs">
          {RESOLVED_BY_COPY[row.resolvedBy] ??
            "A tiebreak decided this placement."}
        </p>
      )}
    </li>
  );
}

/**
 * `resolvedBy` names the step that decided the placement, and only one of the
 * three values means "nothing was needed". A team that was separated from
 * another by a mechanism rather than by its score is owed that fact in the
 * terms of the mechanism — "we lost head-to-head" and "the officers put them
 * above us" are different things to be told.
 */
const RESOLVED_BY_COPY: Record<string, string> = {
  copeland:
    "Tied on points. This placement was decided head-to-head, by counting how " +
    "many ballots across every points election ranked this team above the team " +
    "it was tied with.",
  "officer-tiebreak":
    "Tied on points and head-to-head. This placement was decided by the " +
    "officers' tiebreak ranking — see the disclosure below for the comparison " +
    "that was used.",
};

function Block({
  label,
  points,
  outOf,
  caption,
}: {
  label: string;
  points: number;
  outOf: number;
  caption: string;
}) {
  // Clamped because a renormalized block (a competition with no elections, or
  // none by design) is scored out of 1000 and would otherwise overrun the bar
  // it is drawn in.
  const filled = Math.min(100, Math.round((points / outOf) * 100));

  return (
    <div>
      <dt className="text-xs tracking-wide uppercase opacity-60">{label}</dt>
      <dd>
        <span className="text-xl font-bold tabular-nums">
          {points}
          <span className="text-sm font-normal opacity-70"> / {outOf}</span>
        </span>
        <span
          aria-hidden
          className="mt-1 block h-1.5 w-full rounded-full bg-black/10"
        >
          <span
            className="block h-full rounded-full bg-black"
            style={{ width: `${filled}%` }}
          />
        </span>
        <span className="mt-1 block max-w-prose text-xs opacity-70">
          {caption}
        </span>
      </dd>
    </div>
  );
}

function ScoringExplainer() {
  return (
    <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
      <p>
        A competition is scored out of 1000. Six hundred come from requirements
        met, which is objective and self-determined — do the work and the points
        are yours no matter what anyone else built. Four hundred come from the
        elections, which are comparative and can only be earned at another
        team&rsquo;s expense.
      </p>
      <p className="mt-2 opacity-70">
        Both halves are shown for every team on purpose. The bulk of a score
        sits in a team&rsquo;s own hands, and a single total would hide a team
        that met every requirement and finished behind on the vote.
      </p>
    </section>
  );
}

/**
 * The comparisons the officers' ranking was actually used for.
 *
 * This is a read of the disclosure table the tally wrote, never a filtered read
 * of the ballot: the officers' ranking covers every team and is never published
 * as an ordering, so the only defensible source is the set of pairs the tally
 * deliberately recorded. Each pair is one relation and nothing else — not where
 * either team sits in the officers' order, and nothing about teams that were
 * never tied.
 */
function TiebreakDisclosures({
  pairs,
  teamNames,
  hasCopeland,
}: {
  pairs: { higherTeamId: string; lowerTeamId: string }[];
  teamNames: Map<string, string>;
  hasCopeland: boolean;
}) {
  return (
    <section
      className="rounded-sm border-2 border-black bg-white p-4"
      aria-labelledby="tiebreaks"
    >
      <h2 id="tiebreaks" className="font-semibold">
        Tiebreaks
      </h2>
      <p className="mt-1 max-w-prose text-sm opacity-70">
        Teams that tied on points, and on the head-to-head count that is tried
        next, were separated by the officers&rsquo; tiebreak ranking. Only the
        comparisons that decided a placement are published — the ranking itself
        is not.
      </p>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {pairs.map((pair) => (
          <li key={`${pair.higherTeamId}-${pair.lowerTeamId}`}>
            Officers ranked{" "}
            <strong>{teamNames.get(pair.higherTeamId) ?? "a team"}</strong>{" "}
            above{" "}
            <strong>{teamNames.get(pair.lowerTeamId) ?? "another team"}</strong>
            .
          </li>
        ))}
      </ul>

      {hasCopeland && (
        <p className="mt-3 text-xs opacity-70">
          Other placements on this page were tied on points and settled
          head-to-head, before the officers&rsquo; ranking was reached. Those
          are marked on the team rather than listed here, because they were
          decided by the ballots already cast rather than by a comparison held
          back for the purpose.
        </p>
      )}
    </section>
  );
}

/**
 * One election's result.
 *
 * `scaled` is the Borda score over the largest score the election could have
 * produced — not over the field — so it is shown as a share of the ceiling. Two
 * teams a point apart read as a point apart here, which is the honest rendering
 * of a close vote and the reason min-max scaling was rejected upstream.
 */
function ElectionCard({
  title,
  electorate,
  results,
}: {
  title: string;
  electorate: "teams" | "officers";
  results: ElectionResultRow[];
}) {
  if (results.length === 0) return null;

  return (
    <section className="rounded-sm border-2 border-black bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs opacity-70">
        {electorate === "officers"
          ? "Officer ballot"
          : "One ballot per competing team"}
      </p>

      <ol className="mt-3 flex flex-col gap-1 text-sm">
        {results.map((result) => (
          <li key={result.teamId} className="flex items-baseline gap-3">
            <span className="w-6 text-right tabular-nums opacity-70">
              {result.placement}
            </span>
            <span className="flex-1">{result.teamName}</span>
            <span className="tabular-nums">
              {formatScaled(result.scaled)}
              <span className="opacity-70">
                {" "}
                of the ceiling · Borda {result.bordaScore}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 max-w-prose text-xs opacity-70">
        Teams share a placement when they tie exactly — a tie here needs no
        resolution, because placement in an election awards nothing on its own.
        Points come from the share above.
      </p>
    </section>
  );
}

/**
 * `scaled` arrives as a numeric string (Postgres `numeric(10,9)`), which is
 * deliberate on the driver's side: parsing it to a float in the query layer
 * would round a value the tally stores to nine places. One decimal place is
 * what a reader can use.
 */
function formatScaled(scaled: string): string {
  return `${(Number(scaled) * 100).toFixed(1)}%`;
}
