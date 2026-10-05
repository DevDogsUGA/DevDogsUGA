import { SITE } from "@devdogsuga/newsletter";
import { EVENT_SEGMENT_VISUALS } from "@devdogsuga/brand/event";
import {
  BUILDING_ADDRESS,
  BUILDING_FULL_NAME,
  directionsTarget,
  isMappedBuilding,
  locationLine,
  mapUrls,
} from "~/components/EventsSection/FindUs/buildings";
import { findUsBlurb } from "~/components/EventsSection/FindUs/copy";
import { cancellationNotice } from "~/components/EventsSection/meetingView";
import { formatEventDate, formatRelative } from "~/lib/eventTime";
import { meetingTitle, workshopLabel } from "~/lib/meetingTitle";
import {
  getFurthestMeetingStart,
  getMeetingBySlug,
  getMeetingsInRange,
  getMeetingWorkshops,
  getPastMeetings,
  resolveMeetingSegments,
} from "~/server/loaders/meetings";
import type { Block, Card, Field } from "../blocks";
import { NOT_FOUND, page, PUBLIC, terminal } from "../define";
import { meetingItem, ROOM_TBA, timeSpan } from "../meetings";
import { meetingChip, type Chip } from "../theme";

/**
 * /events, /events/:slug and /events/directions, read through the same
 * loaders and helpers as the pages: `getMeetingsInRange` for the schedule,
 * `meetingTitle` for names, `cancellationNotice` for called-off nights, and
 * `directionsTarget` for what a directions link means.
 */

const RECENT_COUNT = 3;

function startOfDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

export const eventsSchedule = terminal(PUBLIC, async () => {
  const now = new Date();
  const furthest = await getFurthestMeetingStart();
  // Forward as far as the schedule goes, the same reach `/events` gives its
  // calendar. Cancelled nights stay in, struck through, as they do there.
  const to = new Date((furthest ?? now).getTime() + 86_400_000);
  const [ahead, past] = await Promise.all([
    getMeetingsInRange(startOfDay(now), to),
    getPastMeetings(RECENT_COUNT),
  ]);
  const upcoming = ahead.filter((meeting) => meeting.endsAt >= now);

  return page({
    banner: "EVENTS",
    accent: "violet",
    aside: ["Mondays & Wednesdays"],
    status: `${upcoming.length} upcoming`,
    command: "events --upcoming",
    body: [
      {
        type: "text",
        text: "DevDogs meets regularly on Mondays and Wednesdays: we host workshops, hackathons, and open build nights. Here's what's next.",
      },
      { type: "heading", text: "upcoming" },
      {
        type: "events",
        items: upcoming.map(meetingItem),
        empty:
          "Nothing on the schedule yet. Check back soon, or watch the Discord.",
      },
      { type: "heading", text: "recent" },
      {
        type: "events",
        items: past.map(meetingItem),
        empty: "No past meetings yet.",
      },
      { type: "heading", text: "find_us" },
      {
        type: "commands",
        items: [
          {
            path: "/events/directions",
            description: "Where we meet, with map links.",
          },
          { path: "/changelog", description: "The weekly newsletter." },
        ],
      },
      {
        type: "links",
        items: [
          { label: "subscribe (.ics)", url: `${SITE}/events/calendar.ics` },
        ],
      },
    ],
  });
});

/** The dialog's chips: derived segments first, then the authored kind. */
function segmentChips(
  kind: string | null,
  workshops: readonly unknown[],
): Chip[] {
  const { segments } = resolveMeetingSegments({ kind, workshops });
  const chips: Chip[] = segments.map((segment) => ({
    label: EVENT_SEGMENT_VISUALS[segment].label,
    color: EVENT_SEGMENT_VISUALS[segment].accent,
  }));
  if (kind !== null) chips.push(meetingChip(kind, false));
  return chips;
}

export const eventDetail = terminal(PUBLIC, async ({ params }) => {
  const slug = params.slug ?? "";
  const meeting = await getMeetingBySlug(slug);
  if (!meeting) return NOT_FOUND;
  const workshops = await getMeetingWorkshops(meeting.id);

  const now = new Date();
  const cancelled = meeting.cancelledAt !== null;
  const ended = now >= meeting.endsAt;
  const happeningNow = now >= meeting.startsAt && !ended;
  const where = locationLine(meeting.building, meeting.location);
  const chips = segmentChips(meeting.kind, workshops);
  const title = meetingTitle(meeting, workshops);

  const card: Card = {
    color:
      chips[0]?.color ?? meetingChip(meeting.kind, workshops.length > 0).color,
    chips,
    meta: formatEventDate(meeting.startsAt),
    title,
    facts: [timeSpan(meeting.startsAt, meeting.endsAt), where ?? ROOM_TBA],
    body: meeting.summary ?? undefined,
    // The RSVP is an instruction to come, so it comes off a night that's over
    // or called off, as the dialog's button does.
    action:
      meeting.rsvpUrl && !ended && !cancelled
        ? { kind: "cta", label: "RSVP", url: meeting.rsvpUrl }
        : undefined,
  };

  const body: Block[] = [];
  const notice = cancellationNotice(meeting);
  if (notice) {
    body.push({
      type: "notice",
      notice: {
        tone: "warn",
        title: notice,
        text: "This night is still listed so anyone holding it in their calendar knows. What was planned is below.",
      },
    });
  }
  body.push({ type: "card", card });

  if (workshops.length > 0) {
    body.push(
      { type: "heading", text: "agenda" },
      {
        type: "entries",
        items: workshops.map((workshop) => ({
          label: workshopLabel(workshop),
          meta:
            workshop.project && workshop.title ? workshop.project : undefined,
          text: workshop.description ?? undefined,
        })),
        empty: "",
      },
    );
  }

  if (isMappedBuilding(meeting.building)) {
    const query = new URLSearchParams({ b: meeting.building });
    if (meeting.location) query.set("r", meeting.location);
    body.push(
      { type: "heading", text: "where" },
      {
        type: "fields",
        rows: [
          { label: "building", value: BUILDING_FULL_NAME[meeting.building] },
          ...(meeting.location
            ? [{ label: "room", value: meeting.location }]
            : []),
          { label: "address", value: BUILDING_ADDRESS[meeting.building] },
        ],
      },
      {
        type: "commands",
        items: [
          {
            path: `/events/directions?${query.toString()}`,
            description: "Map links for getting there.",
          },
        ],
      },
    );
  }

  body.push({
    type: "links",
    items: [
      {
        label: "add to calendar",
        url: `${SITE}/events/${encodeURIComponent(slug)}/calendar.ics`,
      },
    ],
  });

  return page({
    banner: "EVENTS",
    accent: "violet",
    aside: [title.length <= 28 ? title : formatEventDate(meeting.startsAt)],
    status: cancelled
      ? "cancelled"
      : happeningNow
        ? "happening now"
        : ended
          ? "ended"
          : formatRelative(meeting.startsAt, now),
    command: `events --show ${slug}`,
    body,
  });
});

export const directions = terminal(PUBLIC, ({ search }) => {
  const { building, room } = directionsTarget(search.get("b"), search.get("r"));
  const maps = mapUrls(building);
  const rows: Field[] = [
    { label: "building", value: BUILDING_FULL_NAME[building] },
    ...(room ? [{ label: "room", value: room }] : []),
    { label: "address", value: BUILDING_ADDRESS[building] },
  ];
  return page({
    banner: "DIRECTIONS",
    accent: "violet",
    aside: [locationLine(building, room) ?? BUILDING_FULL_NAME[building]],
    command: `directions --to "${building}"`,
    body: [
      { type: "text", text: findUsBlurb(building, room) },
      { type: "fields", rows },
      { type: "heading", text: "maps" },
      {
        type: "links",
        items: [
          { label: "Google Maps", url: maps.google },
          { label: "Apple Maps", url: maps.apple },
        ],
      },
    ],
  });
});
