import type { Meeting } from "@devdogsuga/events";
import { EVENT_TZ } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { locationLine } from "~/components/EventsSection/FindUs/buildings";
import type { MeetingInRange, MeetingSummary } from "~/server/loaders/meetings";
import type { EventItem } from "./blocks";
import { meetingChip } from "./theme";

/**
 * Meetings as the terminal prints them, from either source: rows from the
 * platform's database, or the club config's `Meeting`s a Changelog issue
 * carries. Both end up as the same `EventItem`, through the same title,
 * location and cancellation helpers the site uses, so a night reads the same
 * on /events, in the email, and here.
 */

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
});
const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
  day: "numeric",
});
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** `"WED Oct 7"`, the date column of every event row. */
export function dayLabel(at: Date): string {
  return `${WEEKDAY.format(at).toUpperCase()} ${MONTH_DAY.format(at)}`;
}

/** `"6:00 – 7:30 PM"`, or `"11:00 AM – 1:00 PM"` across noon; the email's form. */
export function timeSpan(startsAt: Date, endsAt: Date): string {
  const [start, startMeridiem] = CLOCK.format(startsAt).split(" ");
  const [end, endMeridiem] = CLOCK.format(endsAt).split(" ");
  return startMeridiem === endMeridiem
    ? `${start} – ${end} ${endMeridiem}`
    : `${start} ${startMeridiem} – ${end} ${endMeridiem}`;
}

export const ROOM_TBA = "Room to be announced";

/** An event row for a meeting from the database. */
export function meetingItem(
  meeting: MeetingSummary | MeetingInRange,
): EventItem {
  const workshops = "workshops" in meeting ? meeting.workshops : [];
  const cancelled = meeting.cancelledAt !== null;
  return {
    date: dayLabel(meeting.startsAt),
    title: meetingTitle(meeting, workshops),
    chip: meetingChip(meeting.kind, meeting.workshopCount > 0),
    facts: [
      timeSpan(meeting.startsAt, meeting.endsAt),
      locationLine(meeting.building, meeting.location) ?? ROOM_TBA,
    ],
    cancelled,
    note: cancelled ? (meeting.cancellationReason ?? undefined) : undefined,
    path: `/events/${encodeURIComponent(meeting.slug)}`,
  };
}

/** An event row for a meeting from the club config (a Changelog issue's). */
export function configMeetingItem(meeting: Meeting): EventItem {
  const startsAt = new Date(meeting.startsAt);
  const cancelled = meeting.cancelledAt !== null;
  return {
    date: dayLabel(startsAt),
    title: meeting.title,
    // A config night with no kind is a workshop night, the email's reading.
    chip: meetingChip(meeting.kind, true),
    facts: [
      timeSpan(startsAt, new Date(meeting.endsAt)),
      locationLine(meeting.building, meeting.location) ?? ROOM_TBA,
    ],
    cancelled,
    note: cancelled ? (meeting.cancellationReason ?? undefined) : undefined,
    path: `/events/${encodeURIComponent(meeting.slug)}`,
  };
}
