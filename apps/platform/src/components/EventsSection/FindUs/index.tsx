"use client";

import { MapTrifoldIcon } from "@phosphor-icons/react/ssr";
import { RouteDialogLink } from "~/ui/route-dialog";
import FindUsDialog from "./FindUsDialog";
import FindUsContent, { preloadCampusMap } from "./FindUsContent";
import type { BuildingKey } from "./campusMapMeta";

const TRIGGER_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/**
 * Every way of showing intent short of clicking: a pointer arriving, a
 * keyboard focus, a finger landing. Each starts the map chunk downloading so
 * it is normally already here when the dialog opens. Calling it twice is free.
 *
 * This stays here rather than moving into the shared route-dialog trigger:
 * warming a chunk only pays off because this dialog's map is 46 KB of generated
 * path data, and a dialog without such a chunk would be preloading nothing.
 */
const INTENT_HANDLERS = {
  onPointerEnter: preloadCampusMap,
  onFocus: preloadCampusMap,
  onTouchStart: preloadCampusMap,
};

/**
 * The homepage's trigger: a button that opens the dialog in place.
 *
 * `building` defaults to the DLW because the homepage's trigger is not about
 * any one meeting — it answers "where is this club", and the answer to that is
 * still the DLW.
 */
export default function FindUs({
  building = "DLW",
  room = "124",
}: {
  building?: BuildingKey;
  room?: string | null;
} = {}) {
  return (
    <FindUsDialog
      building={building}
      room={room}
      trigger={
        <button className={TRIGGER_CLS} {...INTENT_HANDLERS}>
          <MapTrifoldIcon /> Directions
        </button>
      }
    >
      <FindUsContent building={building} room={room} />
    </FindUsDialog>
  );
}

/**
 * The events page's trigger: the same dialog, reached through a URL.
 * `/events/directions` is a route under the events layout, which keeps the
 * calendar mounted behind it, so following this swaps only the leaf — no
 * remount of the page underneath, and the URL is shareable.
 *
 * {@link RouteDialogLink} carries the props that make that URL behave like a
 * dialog rather than a page — no scroll to the top, and the mark that lets
 * closing go back instead of pushing.
 */
export function FindUsLink({
  building = "DLW",
  room,
  className = TRIGGER_CLS,
}: {
  building?: BuildingKey;
  room?: string | null;
  /** The default is the light plates' bordered action; the console-dark
   *  events page passes its own dialect's button instead. */
  className?: string;
} = {}) {
  // The building rides in the URL rather than in a second route segment, so
  // one page keeps serving every building and the link stays pasteable. The
  // room goes too: without it the dialog would open on "the DLW" for a link
  // that was clicked from a meeting in DLW 148.
  const params = new URLSearchParams({ b: building });
  if (room !== null && room !== undefined) params.set("r", room);

  return (
    <RouteDialogLink
      href={`/events/directions?${params}`}
      className={className}
      {...INTENT_HANDLERS}
    >
      <MapTrifoldIcon /> Directions
    </RouteDialogLink>
  );
}
