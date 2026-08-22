"use client";

import Link from "next/link";
import { MapTrifoldIcon } from "@phosphor-icons/react/ssr";
import FindUsDialog from "./FindUsDialog";
import FindUsContent, { preloadCampusMap } from "./FindUsContent";

const TRIGGER_CLS =
  "hover:shadow-block-md transition-lift flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5";

/**
 * Every way of showing intent short of clicking: a pointer arriving, a
 * keyboard focus, a finger landing. Each starts the map chunk downloading so
 * it is normally already here when the dialog opens. Calling it twice is free.
 */
const INTENT_HANDLERS = {
  onPointerEnter: preloadCampusMap,
  onFocus: preloadCampusMap,
  onTouchStart: preloadCampusMap,
};

/** The homepage's trigger: a button that opens the dialog in place. */
export default function FindUs() {
  return (
    <FindUsDialog
      trigger={
        <button className={TRIGGER_CLS} {...INTENT_HANDLERS}>
          <MapTrifoldIcon /> Directions
        </button>
      }
    >
      <FindUsContent />
    </FindUsDialog>
  );
}

/**
 * The events page's trigger: the same dialog, reached through a URL. Under
 * `/events` the link is intercepted into the page's `@modal` slot, so it opens
 * as the dialog over the calendar — but `/events/directions` is also a real
 * page, which is what a shared or refreshed link lands on. `scroll={false}`
 * because opening a dialog should not scroll the page behind it to the top.
 */
export function FindUsLink() {
  return (
    <Link
      href="/events/directions"
      scroll={false}
      className={TRIGGER_CLS}
      {...INTENT_HANDLERS}
    >
      <MapTrifoldIcon /> Directions
    </Link>
  );
}
