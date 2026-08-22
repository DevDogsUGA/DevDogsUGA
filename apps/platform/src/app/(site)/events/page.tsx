import type { Metadata } from "next";
import EventsSection from "~/components/EventsSection";
import UnderConstruction from "~/components/UnderConstruction";

export const metadata: Metadata = {
  title: "Events | DevDogs",
  description: "Upcoming meetings, workshops, and events hosted by DevDogs.",
};

export default function EventsPage() {
  // Build-time, not request-time, like the homepage: whatever DEPLOY_ENV holds
  // during `next build` decides which branch ships.
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return <EventsBody />;
}

/**
 * Cached for the same reason the homepage's sections are: EventsSection reads
 * the clock for the calendar month, which is only legal inside a cache scope,
 * and nothing on the page is per-visitor.
 */
async function EventsBody() {
  "use cache";

  return (
    <div className="flex flex-col bg-black py-4 md:py-6">
      <EventsSection topEdge="flat" bottomEdge="flat" page />
    </div>
  );
}
