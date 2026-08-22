import type { Metadata } from "next";
import FindUsContent from "~/components/EventsSection/FindUs/FindUsContent";
import { FIND_US_BLURB } from "~/components/EventsSection/FindUs/copy";

/**
 * Its own metadata because this URL is meant to be handed around — pasted into
 * Discord, printed as a QR code — and an unfurl titled "DevDogs" says nothing
 * about where the meeting is.
 */
export const metadata: Metadata = {
  title: "Directions | DevDogs",
  description: FIND_US_BLURB,
};

/** The dialog's body; the segment's layout supplies the dialog around it. */
export default function DirectionsPage() {
  return <FindUsContent />;
}
