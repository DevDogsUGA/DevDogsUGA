import Link from "next/link";
import { notFound } from "next/navigation";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import PageShell from "~/components/PageShell";
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
export default async function ResultsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // The competition is the one read that has to land alone: it decides whether
  // there is a page at all, and it supplies the id the other three are keyed on.
  const competition = await getCompetitionBySlug(slug);
  if (!competition) notFound();

  // The other three depend on the competition and on nothing each other
  // returns, so they go out together rather than three round trips deep. The
  // election results below are a genuine second wave: their ids come from
  // `pointsElections` and cannot be asked for before it answers.
  const [standings, disclosures, pointsElections] = await Promise.all([
    getStandings(slug),
    getTiebreakDisclosures(competition.id),
    getPointsElections(competition.id),
  ]);

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
    <PageShell
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
        <ConsoleCard.Root id="standings">
          <ConsoleCard.Header title="Standings" />
          <ConsoleCard.Content>
            {/* The legend and the list are one child: a divider between a key
                and the thing it is a key for would read as two sections. */}
            <div className="flex flex-col gap-4">
              <SplitLegend />
              <ol className="flex flex-col gap-3">
                {standings.map((row) => (
                  <StandingCard
                    key={row.teamId}
                    row={row}
                    competitionSlug={competition.slug}
                  />
                ))}
              </ol>
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
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
    </PageShell>
  );
}

/**
 * What the two colours on every bar mean, said once.
 *
 * Once, and above the list, because the alternative is a swatch on both halves
 * of every row — two facts repeated as many times as there are teams, in the
 * one place on the page where the numbers should be doing the talking.
 */
function SplitLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mauve-400">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-4 rounded-full bg-emerald-400/70" />
        Requirements, out of 600
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-4 rounded-full bg-amber-400/70" />
        Elections, out of 400
      </span>
    </p>
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
    <li className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-white tabular-nums">
            #{row.placement}
          </span>
          <Link
            href={`/competitions/${competitionSlug}/teams/${row.teamSlug}`}
            className="rounded-sm font-semibold text-white underline outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          >
            {row.teamName}
          </Link>
          <span className="text-xs text-mauve-400">
            {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
          </span>
        </span>

        <span className="text-lg font-bold text-white tabular-nums">
          {row.totalPoints}
          <span className="text-sm font-normal text-mauve-400"> / 1000</span>
        </span>
      </div>

      {/* Both blocks on one track, drawn against 1000 rather than each against
          its own ceiling. Two bars each filled to their own maximum put a team
          that met every requirement level with one that swept the vote, which
          is precisely the equivalence the 600/400 split exists to deny. On a
          shared track the halves keep their real sizes, and nothing needs
          clamping: a renormalized block — a competition with no elections, so
          requirements are worth the full 1000 — is already measured against
          the same denominator, and the two widths cannot sum past the track.
          It is `aria-hidden` because it draws the numbers printed beneath it. */}
      <div
        aria-hidden
        className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full bg-emerald-400/70"
          style={{ width: widthOf(row.requirementPoints) }}
        />
        <div
          className="h-full bg-amber-400/70"
          style={{ width: widthOf(row.electionPoints) }}
        />
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
        <Callout tone="info" className="mt-4">
          {RESOLVED_BY_COPY[row.resolvedBy] ??
            "A tiebreak decided this placement."}
        </Callout>
      )}
    </li>
  );
}

/**
 * A block's share of the whole 1000, as a CSS width.
 *
 * Divided by ten rather than run through `points / 1000 * 100`, which lands on
 * values like 38.300000000000004 and writes them into the markup. Not rounded
 * either: two segments rounded independently can sum past 100 and push the
 * elections half off the end of the track it shares with requirements.
 */
function widthOf(points: number): string {
  return `${points / 10}%`;
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
  return (
    <div>
      <dt className="text-xs tracking-wide text-mauve-500 uppercase">
        {label}
      </dt>
      <dd>
        <span className="text-xl font-bold text-white tabular-nums">
          {points}
          <span className="text-sm font-normal text-mauve-400"> / {outOf}</span>
        </span>
        <span className="mt-1 block max-w-prose text-xs text-mauve-400">
          {caption}
        </span>
      </dd>
    </div>
  );
}

function ScoringExplainer() {
  return (
    <ConsoleCard.Root id="scoring">
      <ConsoleCard.Header title="Scoring" />
      <ConsoleCard.Content>
        {/* One child: the second paragraph is the reason for the first, and a
            divider between them would announce a section break that is not
            there. */}
        <div className="flex flex-col gap-2 text-sm">
          <p className="max-w-prose text-mauve-300">
            A competition is scored out of 1000. Six hundred come from
            requirements met, which is objective and self-determined — do the
            work and the points are yours no matter what anyone else built. Four
            hundred come from the elections, which are comparative and can only
            be earned at another team&rsquo;s expense.
          </p>
          <p className="max-w-prose text-mauve-400">
            Both halves are shown for every team on purpose. The bulk of a score
            sits in a team&rsquo;s own hands, and a single total would hide a
            team that met every requirement and finished behind on the vote.
          </p>
        </div>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
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
    // The section keeps the accessible name it had. `ConsoleCard.Header` owns
    // the `h2` and gives it no id, so there is nothing for `aria-labelledby` to
    // point at; `aria-label` names the region with the same word instead.
    <ConsoleCard.Root id="tiebreaks" aria-label="Tiebreaks">
      <ConsoleCard.Header
        title="Tiebreaks"
        description="Teams that tied on points, and on the head-to-head count that is tried next, were separated by the officers’ tiebreak ranking. Only the comparisons that decided a placement are published — the ranking itself is not."
      />
      <ConsoleCard.Content>
        <ul className="flex flex-col gap-2 text-sm text-mauve-300">
          {pairs.map((pair) => (
            <li key={`${pair.higherTeamId}-${pair.lowerTeamId}`}>
              Officers ranked{" "}
              <strong className="font-semibold text-white">
                {teamNames.get(pair.higherTeamId) ?? "a team"}
              </strong>{" "}
              above{" "}
              <strong className="font-semibold text-white">
                {teamNames.get(pair.lowerTeamId) ?? "another team"}
              </strong>
              .
            </li>
          ))}
        </ul>

        {hasCopeland && (
          <p className="max-w-prose text-xs text-mauve-400">
            Other placements on this page were tied on points and settled
            head-to-head, before the officers&rsquo; ranking was reached. Those
            are marked on the team rather than listed here, because they were
            decided by the ballots already cast rather than by a comparison held
            back for the purpose.
          </p>
        )}
      </ConsoleCard.Content>
    </ConsoleCard.Root>
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
    <ConsoleCard.Root>
      <ConsoleCard.Header
        title={title}
        description={
          electorate === "officers"
            ? "Officer ballot"
            : "One ballot per competing team"
        }
      />
      <ConsoleCard.Content>
        <ol className="flex flex-col gap-2 text-sm">
          {results.map((result) => (
            <li key={result.teamId} className="flex items-baseline gap-3">
              <span className="w-6 shrink-0 text-right text-mauve-400 tabular-nums">
                {result.placement}
              </span>
              <span className="flex-1 text-white">{result.teamName}</span>
              <span className="text-mauve-300 tabular-nums">
                {formatScaled(result.scaled)}
                <span className="text-mauve-400">
                  {" "}
                  of the ceiling · Borda {result.bordaScore}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <p className="max-w-prose text-xs text-mauve-400">
          Teams share a placement when they tie exactly — a tie here needs no
          resolution, because placement in an election awards nothing on its
          own. Points come from the share above.
        </p>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
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
