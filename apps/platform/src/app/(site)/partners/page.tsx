import type { Metadata } from "next";
import UnderConstruction from "~/components/UnderConstruction";

/**
 * Title and description follow the same rule as `/community`: the description
 * is the navbar entry's, from `config/nav.ts`, and it describes the finished
 * page rather than the placeholder standing in for it.
 */
export const metadata: Metadata = {
  title: "Partners | DevDogs",
  description: "Organizations and sponsors that partner with DevDogs.",
};

/** `"use cache"` moved onto the component. See `/community` for why. */
export default async function Partners() {
  "use cache";

  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return <UnderConstruction />;
}
