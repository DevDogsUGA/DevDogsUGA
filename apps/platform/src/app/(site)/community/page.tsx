import type { Metadata } from "next";
import UnderConstruction from "~/components/UnderConstruction";

/**
 * The description is the one `config/nav.ts` already gives this link in the
 * navbar and the command palette, rather than a second sentence written here:
 * a menu row and a search result are the same promise about the same page, and
 * two copies of it drift.
 *
 * It describes the page this route is going to be, not the placeholder it
 * renders today. That is the right way round — the unfurl for a URL somebody
 * pastes now should say what they will find when they open it, and a "coming
 * soon" description would have to be found and removed at exactly the moment
 * nobody is thinking about metadata.
 */
export const metadata: Metadata = {
  title: "Community | DevDogs",
  description: "Meet the members and leadership of DevDogs.",
};

/**
 * `"use cache"` sits on the component rather than at the top of the file, where
 * it used to be. At file level the directive claims every export, and `metadata`
 * above is a plain object rather than the async function the transform expects;
 * with one default export there is nothing else for the file-level form to
 * cache anyway, so this is the same caching with none of that question.
 */
export default async function Community() {
  "use cache";

  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return <UnderConstruction />;
}
