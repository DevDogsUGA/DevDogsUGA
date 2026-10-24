"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { MapTrifoldIcon } from "@phosphor-icons/react/ssr";
import FindUsDrawer from "./FindUsDrawer";
import FindUsContent, { preloadCampusMap } from "./FindUsContent";
import type { Place } from "./place";

/**
 * Every way of showing intent short of clicking. A pointer arriving, a keyboard
 * focus, a finger landing. Each starts the map chunk downloading so it is
 * normally already here when the drawer opens. Calling it twice is free.
 */
const INTENT_HANDLERS = {
  onPointerEnter: preloadCampusMap,
  onFocus: preloadCampusMap,
  onTouchStart: preloadCampusMap,
};

/** A button that opens the directions drawer in place. */
export default function FindUs({ place }: { place: Place }) {
  return (
    <FindUsDrawer
      place={place}
      trigger={
        <button type="button" className="btn secondary" {...INTENT_HANDLERS}>
          <MapTrifoldIcon weight="bold" aria-hidden />{" "}
          {place.state === "known" && place.venue.kind === "virtual"
            ? "Join details"
            : "Directions"}
        </button>
      }
    >
      <FindUsContent place={place} />
    </FindUsDrawer>
  );
}

/**
 * The drawer reached through a URL: `/events/directions` renders the events
 * page and this, open. Closing it goes to `/events`, which is the page already
 * behind it, so the reader sees the drawer slide away rather than a navigation.
 */
export function DirectionsRoute({
  place,
  children,
}: {
  place: Place;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <FindUsDrawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace("/events", { scroll: false });
      }}
      place={place}
    >
      {children}
    </FindUsDrawer>
  );
}
