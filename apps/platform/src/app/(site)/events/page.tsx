import type { Metadata } from "next";

/**
 * The schedule's own `cacheLife` (`./layout.tsx`) revalidates every five
 * minutes, so the page's HTML does too.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Events | DevDogs",
  description: "Upcoming meetings, workshops, and events hosted by DevDogs.",
};

export default function EventsPage() {
  return null;
}
