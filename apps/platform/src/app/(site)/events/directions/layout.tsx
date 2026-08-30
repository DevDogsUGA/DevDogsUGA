import type { ReactNode } from "react";
import { FindUsHeader } from "~/components/EventsSection/FindUs/FindUsDialog";
import RouteDialog from "~/ui/route-dialog";

/**
 * The dialog frame is the segment's *layout*, with the content as its page, so
 * that `loading.tsx`, which Next wraps around the page inside this, puts its
 * skeleton within an already-open dialog rather than replacing the dialog
 * wholesale. That split is also what prefetching fetches: under this app's
 * cookie-reading site layout every route is dynamic, and a dynamic route is
 * prefetched down to its first loading boundary, which is this frame.
 *
 * The header comes from here rather than from inside the shared frame because
 * the frame belongs to whatever route is using it. `closeTo` is `/events`
 * because that is the layout holding the calendar behind the dialog, so a
 * cold-loaded dialog closes onto the calendar instead of an empty tab.
 */
export default function DirectionsModalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RouteDialog
      header={<FindUsHeader tone="dark" />}
      closeTo="/events"
      tone="dark"
    >
      {children}
    </RouteDialog>
  );
}
