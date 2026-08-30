import type { Metadata } from "next";
import FindUsContent from "~/components/EventsSection/FindUs/FindUsContent";
import { findUsBlurb } from "~/components/EventsSection/FindUs/copy";
import {
  isMappedBuilding,
  USUAL_ROOM,
} from "~/components/EventsSection/FindUs/buildings";

/**
 * Its own metadata because this URL gets handed around, pasted into Discord or
 * printed as a QR code, and an unfurl titled "DevDogs" says nothing about where
 * the meeting is.
 *
 * The description is built from the DLW rather than the request's own `?b=`,
 * because this export cannot see the search params and the club's usual room is
 * the right answer for a bare link. A crawler that follows `?b=Driftmier` gets
 * a slightly generous unfurl. A member who clicks it gets the right map, which
 * is the half that matters.
 */
export const metadata: Metadata = {
  title: "Directions | DevDogs",
  description: findUsBlurb("DLW", "124"),
};

/**
 * The dialog's body; the segment's layout supplies the dialog around it.
 *
 * The building rides in the query string rather than a route segment, so one
 * page serves all ten and the link a meeting hands out stays pasteable.
 * Anything unrecognised falls back to the DLW instead of erroring: this URL
 * gets shared by hand, and a truncated paste should still show somebody a map.
 */
export default async function DirectionsPage({
  searchParams,
}: PageProps<"/events/directions">) {
  const { b, r } = await searchParams;
  const building = typeof b === "string" && isMappedBuilding(b) ? b : "DLW";
  // A bare /events/directions is the club's standing answer to "where are
  // you", not any one meeting's, so it resolves to the usual room rather than
  // to the DLW with no room, which would drop the floor plan this link mostly
  // exists to reach. A link naming some other building means somewhere else,
  // and gets no room.
  const room =
    typeof r === "string" && r !== ""
      ? r
      : building === "DLW"
        ? USUAL_ROOM
        : null;

  return <FindUsContent building={building} room={room} tone="dark" />;
}
