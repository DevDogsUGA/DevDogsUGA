import type { ReactNode } from "react";
import { MapPinIcon } from "@phosphor-icons/react/ssr";
import { DialogDescription, DialogTitle } from "~/classic/ui/dialog";
import RouteDialog from "~/classic/ui/route-dialog";

/**
 * The dialog frame is the segment's *layout*, with the content as its page, so
 * that `loading.tsx`, which Next wraps around the page inside this, puts its
 * skeleton within an already-open dialog rather than replacing the dialog
 * wholesale. That split is also what prefetching fetches: under this app's
 * cookie-reading site layout every route is dynamic, and a dynamic route is
 * prefetched down to its first loading boundary, which is this frame.
 *
 * The header comes from here rather than from inside the shared frame because
 * the frame belongs to whatever route is using it. It is generic ("Directions")
 * because a layout cannot read the link's `?v=`/`?b=`/`?r=`; the page prints
 * the place it names at the top of its body. `closeTo` is `/events`
 * because that is the layout holding the calendar behind the dialog, so a
 * cold-loaded dialog closes onto the calendar instead of an empty tab.
 */
export default function DirectionsModalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RouteDialog header={<DirectionsHeader />} closeTo="/events" tone="dark">
      {children}
    </RouteDialog>
  );
}

function DirectionsHeader() {
  return (
    <div className="flex flex-col gap-2">
      <DialogTitle className="font-display flex items-center gap-2 text-2xl leading-none font-extrabold text-white">
        <MapPinIcon className="text-mauve-400" weight="fill" />
        Directions
      </DialogTitle>
      <DialogDescription className="text-sm text-mauve-400">
        Where this meeting is.
      </DialogDescription>
    </div>
  );
}
