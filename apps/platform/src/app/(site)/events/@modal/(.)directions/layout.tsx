import type { ReactNode } from "react";
import RouteDialog from "~/components/EventsSection/FindUs/RouteDialog";

/**
 * The dialog frame is the segment's *layout*, with the content as its page,
 * so that `loading.tsx` — which Next wraps around the page, inside this — puts
 * its skeleton within an already-open dialog rather than replacing the dialog
 * wholesale. That split is also what prefetching fetches: under this app's
 * cookie-reading site layout every route is dynamic, and a dynamic route is
 * prefetched down to its first loading boundary, which is exactly this frame.
 */
export default function DirectionsModalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RouteDialog>{children}</RouteDialog>;
}
