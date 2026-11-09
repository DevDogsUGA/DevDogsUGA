import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CommunityDirectory from "~/classic/components/CommunityDirectory";
import PageShell from "~/classic/components/PageShell";
import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";
import { publicProfilesEnabled } from "~/server/features";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getPublicHandlesByUserId,
  searchPublicProfiles,
} from "~/server/loaders/publicProfiles";

/**
 * The description is the one `config/nav.ts` already gives this link in the
 * navbar and the command palette, not a second sentence written here. A menu
 * row and a search result are the same promise about the same page, and two
 * copies of it drift.
 */
export const metadata: Metadata = {
  title: "Community | DevDogs",
  description: "Meet the members and leadership of DevDogs.",
};

export default async function Community() {
  // A temporary redirect, so browsers do not remember the detour once the
  // directory is switched on.
  if (!publicProfilesEnabled()) redirect(INVOLVEMENT_NETWORK_ROSTER_URL);

  const [officers, members] = await Promise.all([
    getCurrentOfficers(),
    searchPublicProfiles({
      q: "",
      leadership: false,
      major: null,
      year: null,
      page: 1,
      excludeLeadership: true,
    }),
  ]);
  const officerHandles = await getPublicHandlesByUserId(
    officers.map((officer) => officer.slug),
  );

  return (
    <PageShell
      accent="emerald"
      title="Community"
      description="Meet the members and leadership of DevDogs."
    >
      <CommunityDirectory
        officers={officers}
        officerHandles={officerHandles}
        members={members.members}
      />
    </PageShell>
  );
}
