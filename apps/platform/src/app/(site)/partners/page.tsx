import type { Metadata } from "next";
import UnderConstruction from "~/classic/components/UnderConstruction";

/**
 * Static copy; changes only with a deploy.
 */
export const revalidate = false;

/**
 * Title and description follow the same rule as `/community`: the description
 * is the navbar entry's, from `config/nav.ts`, and it describes the finished
 * page rather than the placeholder standing in for it.
 */
export const metadata: Metadata = {
  title: "Partners | DevDogs",
  description: "Organizations and sponsors that partner with DevDogs.",
};

/**
 * `/partners`: the under-construction placeholder, which is what production
 * showed before the Cosmic redesign (Sloan, 2026-11-09). The short pitch with
 * "Get in Touch" was committed on Oct 10 but never reached production.
 */
export default function Partners() {
  return <UnderConstruction />;
}
