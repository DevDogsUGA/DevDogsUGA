import type { Metadata } from "next";
import FindUsContent from "~/classic/components/EventsSection/FindUs/FindUsContent";
import { placeBlurb } from "~/components/EventsSection/FindUs/place";
import { directionsTarget } from "~/components/EventsSection/FindUs/placeLookup";

/**
 * Its own metadata because this URL gets handed around, pasted into Discord or
 * printed as a QR code, and an unfurl titled "DevDogs" says nothing about where
 * the meeting is.
 *
 * The description is built from the usual venue rather than the request's own `?v=`/`?b=`,
 * because this export cannot see the search params and the club's usual room is
 * the right answer for a bare link. A crawler that follows `?b=Driftmier` gets
 * a slightly generous unfurl. A member who clicks it gets the right map, which
 * is the half that matters.
 */
export const metadata: Metadata = {
  title: "Directions | DevDogs",
  description: `Where DevDogs meets. ${placeBlurb(directionsTarget(undefined, undefined, undefined))}`,
};

/**
 * The dialog's body; the segment's layout supplies the dialog around it.
 *
 * The place rides in the query string (`v` a venue id, `b` a map building, `r`
 * a room) rather than a route segment, so one page serves every venue and the
 * link a meeting hands out stays pasteable. See `directionsTarget` for how a
 * partial link resolves; an unrecognised one says so and is never the DLW.
 */
export default async function DirectionsPage({
  searchParams,
}: PageProps<"/events/directions">) {
  const { v, b, r } = await searchParams;
  const place = directionsTarget(v, b, r);

  return <FindUsContent place={place} heading />;
}
