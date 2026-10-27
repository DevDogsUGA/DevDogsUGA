import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CommunityDirectory from "~/components/CommunityDirectory";
import PageHeader from "~/components/PageHeader";
import { isFiltered, parseDirectoryQuery } from "~/lib/directoryQuery";
import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";
import { publicProfilesEnabled } from "~/server/features";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getDirectoryFacets,
  getPublicHandlesByUserId,
  searchPublicProfiles,
} from "~/server/loaders/publicProfiles";

/**
 * CACHING. The directory is searchable by URL, so the page reads
 * `searchParams`, which makes it a dynamic render: vinext only caches HTML
 * for pages with a `revalidate` export that read nothing from the request, so
 * there is no `revalidate` export here (a stale cache of `?q=ada` would be
 * worse than none). What stays cached is the data that does not depend on the
 * query: the officers (`getCurrentOfficers`, hourly, tagged) and the filter
 * menus (`getDirectoryFacets`, hourly). The member query itself is two small
 * indexed reads over a few hundred rows and runs per request, so a changed
 * handle or visibility shows up immediately without any `revalidatePath`.
 */

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

export default async function Community({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A temporary redirect, so browsers do not remember the detour once the
  // directory is switched on.
  if (!publicProfilesEnabled()) redirect(INVOLVEMENT_NETWORK_ROSTER_URL);

  const query = parseDirectoryQuery(await searchParams);
  const [officers, directory, facets] = await Promise.all([
    getCurrentOfficers(),
    searchPublicProfiles({ ...query, excludeLeadership: !isFiltered(query) }),
    getDirectoryFacets(),
  ]);
  const officerHandles = await getPublicHandlesByUserId(
    officers.map((officer) => officer.slug),
  );

  return (
    <>
      <PageHeader
        head="brand"
        title="Community"
        description="Meet the members and leadership of DevDogs."
      />
      <CommunityDirectory
        officers={officers}
        officerHandles={officerHandles}
        directory={directory}
        query={query}
        facets={facets}
      />
    </>
  );
}
