import { ACCENT } from "./brand.js";

/**
 * The Open Graph copy for every page that has a fixed one.
 *
 * Keyed by route, and the set of keys is not arbitrary: it is exactly the
 * static half of `apps/platform/src/app/sitemap.ts`. That file is already the
 * club's answer to "which URLs are public", worked out against auth guards and
 * `robots: { index: false }` — the console, the account page, the ballots and
 * the team rosters are all absent from it because none of them is a page a
 * stranger can open. Deriving this list from the same place is what makes
 * "every page except the access-gated ones" a rule rather than a list somebody
 * has to remember to update. `pages.test.ts` asserts the two stay equal.
 *
 * Pages whose copy depends on a database row — a meeting, a competition's
 * results, a docs page — are not here. They build their card from the record
 * in their own `opengraph-image.tsx`.
 */
export interface PageCardCopy {
  title: string;
  description: string;
  /** The chip. Omitted on the home card, which is not a section of anything. */
  eyebrow?: string;
  accent?: string;
}

export const PAGE_CARDS: Record<string, PageCardCopy> = {
  "/": {
    title: "Learn by doing.",
    description:
      "DevDogs is a club at UGA devoted to bettering our community through open-source software.",
    accent: ACCENT.cyan400,
  },
  "/events": {
    title: "Events",
    description: "Upcoming meetings, workshops, and events hosted by DevDogs.",
    eyebrow: "Events",
    accent: ACCENT.amber400,
  },
  "/events/directions": {
    title: "Finding us",
    description:
      "Where DevDogs meets on campus, how to get in, and what to do when you arrive.",
    eyebrow: "Events",
    accent: ACCENT.amber400,
  },
  "/docs": {
    title: "Docs",
    description: "Documentation for DevDogs projects.",
    eyebrow: "Docs",
    accent: ACCENT.emerald400,
  },
  "/partners": {
    title: "Partners",
    description: "Organizations and sponsors that partner with DevDogs.",
    eyebrow: "Partners",
    accent: ACCENT.cyan400,
  },
  "/legal/privacy": {
    title: "Privacy Policy",
    description: "How DevDogs collects, uses, and protects your data.",
    eyebrow: "Legal",
    accent: ACCENT.red400,
  },
};
