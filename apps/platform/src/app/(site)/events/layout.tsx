import EventsSection from "~/components/EventsSection";
import UnderConstruction from "~/components/UnderConstruction";

/**
 * The calendar lives in the layout rather than in `page.tsx` so that it stays
 * mounted underneath every route in this segment: `/events` renders it with an
 * empty `children`, and `/events/directions` renders it with the directions
 * dialog as `children`. Moving between the two is a soft navigation that swaps
 * only the leaf, so the dialog opens over a calendar that never re-renders —
 * and the dialog's URL survives being shared or refreshed, which is what an
 * intercepting route would have given up on a cold load.
 */
export default function EventsLayout({ children }: LayoutProps<"/events">) {
  // Build-time, not request-time, like the homepage: whatever DEPLOY_ENV holds
  // during `next build` decides which branch ships.
  if (process.env.DEPLOY_ENV === "production") return <UnderConstruction />;

  return (
    <>
      <EventsBody />
      {children}
    </>
  );
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
