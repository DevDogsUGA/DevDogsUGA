import type { Metadata } from "next";
import { redirect } from "next/navigation";
import UnderConstruction from "~/components/UnderConstruction";
import { INVOLVEMENT_NETWORK_ROSTER_URL } from "~/config/nav";

/**
 * The description is the one `config/nav.ts` already gives this link in the
 * navbar and the command palette, not a second sentence written here. A menu
 * row and a search result are the same promise about the same page, and two
 * copies of it drift.
 *
 * It describes the page this route will be, not the placeholder it renders
 * today. The unfurl for a URL somebody pastes now should say what they will
 * find when they open it, and a "coming soon" description would have to be
 * removed at exactly the moment nobody is thinking about metadata.
 */
export const metadata: Metadata = {
  title: "Community | DevDogs",
  description: "Meet the members and leadership of DevDogs.",
};

/**
 * The platform's community page is not built yet. Production sends visitors
 * to the Involvement Network roster with a temporary redirect so browsers do
 * not remember the detour after the local page launches.
 */
export default function Community() {
  if (process.env.DEPLOY_ENV === "production") {
    redirect(INVOLVEMENT_NETWORK_ROSTER_URL);
  }

  return <UnderConstruction />;
}
