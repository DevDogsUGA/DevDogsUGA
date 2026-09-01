import { ACCENT, PageCard } from "@devdogsuga/og";
import { contentType, ogResponse, size } from "~/lib/ogImage";
import { getCompetitionBySlug } from "~/server/loaders/meetings";

/**
 * A competition's results card.
 *
 * The only competition route that is not behind a session, and so the only one
 * with a card at all — the two under `teams/` redirect an anonymous visitor and
 * carry `robots: { index: false }`.
 *
 * The description is the scoring split rather than a placing, matching the
 * page's own metadata and for the same reason: the page refuses to reduce a
 * team to one number, and a card leading with a winner would undo that in the
 * one place nobody proofreads.
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

  return ogResponse(
    PageCard({
      ...size,
      title: `${competition.name} results`,
      description:
        "Final standings, scored out of 1000 — 600 for requirements met and 400 from the member elections.",
      eyebrow: "Results",
      accent: ACCENT.amber400,
      footer: `devdogsuga.org/competitions/${slug}/results`,
    }),
  );
}
