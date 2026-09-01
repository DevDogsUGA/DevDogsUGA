import { EventCard } from "@devdogsuga/og";
import { meetingCardDetail, meetingLocation } from "@devdogsuga/og/event";
import { isCancelled } from "~/components/EventsSection/meetingView";
import { meetingTitle, workshopLabel } from "~/lib/meetingTitle";
import { contentType, ogResponse, size } from "~/lib/ogImage";
import {
  getMeetingBySlug,
  getMeetingWorkshops,
} from "~/server/loaders/meetings";

/**
 * One meeting's link card: the night, in full.
 *
 * This URL exists to be handed around — pasted into Discord weeks ahead,
 * printed as a QR code — so the card carries everything that decides whether
 * somebody comes: what it is, when, where, and what is on. That is more than
 * the page's `generateMetadata` can say in a description, which is the whole
 * reason this file exists.
 *
 * The fields are built by `meetingCardDetail`, shared with
 * `pnpm devtools images`, which renders the same card to disk for the GDG on
 * Campus platform. Sharing it is not tidiness: "what time is the meeting" is
 * the one question this image exists to answer, and two implementations is two
 * answers. The app keeps the parts that are its own — which of `nameOverride`,
 * `kind` or the workshops names a night — and hands them in.
 *
 * A cancelled night keeps its URL rather than 404ing, because the link is
 * already out there and people walk over anyway. `meetingCardDetail` drops the
 * hour and the room: they are instructions to go somewhere, and the
 * cancellation withdraws them. Same rule as the page's metadata.
 */
export const alt = "A DevDogs meeting";
export { contentType, size };

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);

  // A dead link still gets unfurled. An honest card beats the club-wide
  // fallback claiming a meeting that is not on the schedule.
  if (!meeting) {
    return ogResponse(
      EventCard({
        ...size,
        title: "Meeting not found",
        date: "No meeting on the DevDogs schedule matches this link.",
        time: "",
      }),
    );
  }

  // The agenda is only worth a query when it will be drawn, and a cancelled
  // night draws none of it.
  const workshops = isCancelled(meeting)
    ? []
    : await getMeetingWorkshops(meeting.id);

  return ogResponse(
    EventCard({
      ...size,
      ...meetingCardDetail({
        meeting,
        title: meetingTitle(meeting, workshops),
        agenda: workshops.map(workshopLabel),
        location: meetingLocation(meeting.building, meeting.location),
      }),
    }),
  );
}
