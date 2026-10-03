import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CompetitionArchive from "~/components/CompetitionArchive";
import PageShell from "~/components/PageShell";
import { publicProfilesEnabled } from "~/server/features";
import { getCompetitionArchive } from "~/server/loaders/competitionArchive";

/**
 * /community/competitions, the public archive of DevDogs competitions.
 *
 * Profile URLs begin with `@` (`/community/@ada`), so this static segment never
 * collides with `[handle]`; and `[handle]` answers 404 to a bare `competitions`
 * because `handleFromSegment` requires the `@`.
 *
 * Same cache posture as `/community`: nothing here reads the request, so the
 * HTML is cached and re-rendered at most hourly. A new winner or contributor
 * can wait that long; the results page, which people watch live, refreshes
 * every minute.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Competition archive | DevDogs",
  description:
    "Every DevDogs competition, who won it, and the members who built the entries.",
};

export default async function CompetitionArchivePage() {
  if (!publicProfilesEnabled()) notFound();
  const competitions = await getCompetitionArchive();

  return (
    <PageShell
      accent="emerald"
      title="Competition archive"
      description="Every DevDogs competition, who won it, and the members who built the entries."
    >
      <CompetitionArchive competitions={competitions} />
    </PageShell>
  );
}
