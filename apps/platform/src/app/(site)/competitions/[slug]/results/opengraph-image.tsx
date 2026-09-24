import { ACCENT, PageCard } from "@devdogsuga/open-graph";
import { contentType, ogResponse, size } from "~/lib/ogImage";
import { getCompetitionBySlug } from "~/server/loaders/competitions";
import { getEntrants } from "~/server/loaders/teams";

/**
 * A competition's results card.
 *
 * The only competition route that is not behind a session, and so the only one
 * with a card at all — the two under `teams/` redirect an anonymous visitor and
 * carry `robots: { index: false }`.
 *
 * Fetches `getEntrants` the same way the page itself does, so a link shared
 * once a winner has merged shows the winner's name rather than the generic
 * "who entered, and who won." -- `getEntrants`'s own `cache()` wrapper is
 * what keeps this a second read rather than a second query.
 */
export const alt = "DevDogs competition results";
export { contentType, size };

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return ogResponse(
      PageCard({
        ...size,
        title: "Competition not found",
        description: "No DevDogs competition matches this link.",
        eyebrow: "Competitions",
        accent: ACCENT.amber400,
      }),
    );
  }

  const entrants = await getEntrants(slug);
  const winner = entrants.find((entrant) => entrant.won);

  return ogResponse(
    PageCard({
      ...size,
      title: `${competition.title} results`,
      description: winner
        ? `${winner.teamName} won.`
        : "Who entered, and who won.",
      eyebrow: "Results",
      accent: ACCENT.amber400,
      footer: `devdogsuga.org/competitions/${slug}/results`,
    }),
  );
}
