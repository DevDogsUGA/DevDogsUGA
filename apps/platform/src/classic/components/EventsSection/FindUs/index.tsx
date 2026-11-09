"use client";

import { useState } from "react";
import { MapTrifoldIcon } from "@phosphor-icons/react/ssr";
import type { DialogTone } from "~/classic/ui/dialog-shell";
import type { Place } from "~/components/EventsSection/FindUs/place";
import { ACTION_DARK_CLS } from "../meetingView";
import FindUsDialog from "./FindUsDialog";
import FindUsContent, { preloadCampusMap } from "./FindUsContent";

/**
 * While the dialog it opens is open, the trigger steps out of sight. The
 * meeting dialog beside (or beneath) the map has no second thing to offer.
 * `invisible` rather than `hidden`, so the button keeps its place in the row
 * and is back and focusable the instant the dialog reports closed, which is
 * before Radix returns focus to it.
 */
const HIDE_WHILE_OPEN = "data-[state=open]:invisible";

/**
 * Every way of showing intent short of clicking. A pointer arriving, a keyboard
 * focus, a finger landing. Each starts the map chunk downloading so it is
 * normally already here when the dialog opens. Calling it twice is free.
 */
const INTENT_HANDLERS = {
  onPointerEnter: preloadCampusMap,
  onFocus: preloadCampusMap,
  onTouchStart: preloadCampusMap,
};

/**
 * A button that opens the dialog in place.
 *
 * The meeting dialog renders it `tone="dark"` and as the `aside` of a pair, so
 * on a wide screen the map opens beside the meeting rather than on top of it.
 * That is why `open` is held here rather than left to Radix. An aside has to be
 * able to say when it is open.
 */
export default function FindUs({
  place,
  tone = "dark",
  pair,
}: {
  place: Place;
  tone?: DialogTone;
  pair?: "aside";
}) {
  const [open, setOpen] = useState(false);
  const online = place.state === "known" && place.venue.kind === "virtual";
  return (
    <FindUsDialog
      open={open}
      onOpenChange={setOpen}
      place={place}
      tone={tone}
      pair={pair}
      trigger={
        <button
          type="button"
          className={`${ACTION_DARK_CLS} ${HIDE_WHILE_OPEN}`}
          {...INTENT_HANDLERS}
        >
          <MapTrifoldIcon /> {online ? "Join details" : "Directions"}
        </button>
      }
    >
      <FindUsContent place={place} />
    </FindUsDialog>
  );
}
