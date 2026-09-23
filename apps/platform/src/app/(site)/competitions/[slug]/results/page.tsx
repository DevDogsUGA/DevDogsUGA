import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Badge from "~/ui/badge";
import { ConsoleCard } from "~/ui/card";
import PageShell from "~/components/PageShell";
import EmptyState from "~/components/participation/EmptyState";
import { getCompetitionBySlug } from "~/server/loaders/competitions";
import { getEntrants } from "~/server/loaders/teams";

/**
 * /competitions/[slug]/results, who entered and who won.
 *
 * All scoring is off-platform now (officer scores and live voting, run
 * outside the site). The only per-competition state the platform persists is
 * who won, and it is not a separate record at all -- `competitionEntries.
 * "mergedAt"` IS the answer, set the moment an officer merges the winning
 * pull request (see `server/github/pullRequest.ts`'s module doc). This page
 * collapses to that: the entrants, each PR they opened, and a winner if one
 * has merged.
 *
 * Nothing here reads the clock. Entrants and the winner change only when
 * somebody opens or merges a pull request, so there is no `connection()` and
 * the page is a plain uncached read inside the site layout's content
 * boundary.
 */

/**
 * One of two competition routes not behind `expectSession()` -- this one and
 * `/competitions/[slug]` itself -- so this is worth describing to anything but
 * a browser tab. The two under `teams/` redirect an anonymous visitor to
 * `/auth` and carry `robots: { index: false }` instead of this.
 *
 * `getCompetitionBySlug` is called here as well as in the page body; React's
 * `cache()` wrapper on the loader is what stops that being a second query
 * within the same request.
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
    title: `${competition.title} results | DevDogs`,
    description: `Who entered the DevDogs ${competition.title} competition, and who won it.`,
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

  const entrants = await getEntrants(slug);
  const winner = entrants.find((e) => e.won);

  return (
    <PageShell
      accent="amber"
      title={`${competition.title} — results`}
      description="Scoring happens off-platform. What's recorded here is who entered, and who won."
    >
      {entrants.length === 0 ? (
        <EmptyState
          title="Nobody has entered yet"
          body="Teams enter by opening a pull request from their branch, so there is nothing to show here until one does."
        />
      ) : (
        <ConsoleCard.Root id="entrants">
          <ConsoleCard.Header
            title="Entrants"
            description={
              winner
                ? `${winner.teamName} won.`
                : "No winner has been recorded yet."
            }
          />
          <ConsoleCard.Content>
            <ol className="flex flex-col gap-3">
              {entrants.map((entrant) => (
                <li
                  key={entrant.teamId}
                  className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="flex items-center gap-3">
                      <Link
                        href={`/teams/${entrant.teamSlug}`}
                        className="rounded-sm font-semibold text-white underline outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
                      >
                        {entrant.teamName}
                      </Link>
                      <span className="text-xs text-mauve-400">
                        {entrant.memberCount}{" "}
                        {entrant.memberCount === 1 ? "member" : "members"}
                      </span>
                    </span>
                    {entrant.won && <Badge variant="success">Winner</Badge>}
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mauve-400">
                    {entrant.entries.map((entry) => (
                      <li key={entry.prNumber}>
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-mauve-200"
                        >
                          PR #{entry.prNumber}
                        </a>
                        {entry.merged && " — merged"}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}
    </PageShell>
  );
}
