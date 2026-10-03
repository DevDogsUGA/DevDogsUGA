import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CommunityDirectory from "~/components/CommunityDirectory";
import PageShell from "~/components/PageShell";
import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";
import { publicProfilesEnabled } from "~/server/features";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getPublicHandlesByUserId,
  listPublicProfiles,
} from "~/server/loaders/publicProfiles";

/**
 * Who is listed changes whenever a member edits their handle or visibility,
 * and `setHandle` calls `revalidatePath("/community")` for those, so the page
 * is normally fresh within a request of the change. The hour is the backstop
 * for what does not: a verification, a profile toggle, a moderation action or
 * a direct database edit. Nothing here reads the request, which is what lets
 * the HTML be cached at all.
 */
export const revalidate = 3600;

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
    listPublicProfiles(),
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
        members={members}
      />
    </PageShell>
  );
}
