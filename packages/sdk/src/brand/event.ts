/**
 * Turning a meeting row into the strings an event card draws.
 *
 * ## Why this is its own entry point
 *
 * Two callers need it and neither can reach the other's copy: the platform
 * renders event cards per request from `opengraph-image.tsx`, and
 * `devtools images` renders them to disk from a database query. The formatting
 * has to be shared, because "what time is the meeting" is the one question
 * these images exist to answer and two implementations is two answers.
 *
 * It is exported as `@devdogsuga/sdk/brand/event` rather than from the package index,
 * and that separation is load-bearing. The index pulls in the embedded fonts
 * and brand artwork — a few hundred kilobytes of base64. `EVENT_TZ` is imported
 * by `lib/meetingTitle.ts`, which is explicitly safe for a client component to
 * import, so routing it through the index would put the whole font payload one
 * careless bundler decision away from the browser. Nothing in this file imports
 * anything.
 */

/**
 * The club's timezone, and the ONLY definition of it.
 *
 * `apps/platform/src/lib/eventTime.ts` re-exports this rather than declaring
 * its own. Every formatter in the app already routes through that module for
 * the reason its own comments give: a caller that formats a meeting time
 * without the zone renders whatever the server happens to be set to, and gets
 * it wrong by an hour twice a year without anything failing.
 */
export const EVENT_TZ = "America/New_York";

/**
 * One visual identity per event category (the six of `MEETING_CATEGORIES` in
 * `@devdogsuga/events`), shared by calendar and event art. `info` is the Info
 * Session, `milestone` covers Kickoff, Cold Start and Demo Day.
 */
export const EVENT_CATEGORY_VISUALS = {
  build: {
    accent: "#00a6f4",
    bg: "bg-sky-400",
    dot: "bg-sky-500",
    chipDark: "border-sky-400/30 bg-sky-500/10 text-sky-300",
    dotDark: "bg-sky-400",
    label: "Build",
  },
  workshop: {
    accent: "#00d492",
    bg: "bg-emerald-400",
    dot: "bg-emerald-500",
    chipDark: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    dotDark: "bg-emerald-400",
    label: "Workshop",
  },
  social: {
    accent: "#ff637e",
    bg: "bg-rose-400",
    dot: "bg-rose-500",
    chipDark: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    dotDark: "bg-rose-400",
    label: "Social",
  },
  info: {
    accent: "#a684ff",
    bg: "bg-violet-400",
    dot: "bg-violet-500",
    chipDark: "border-violet-400/30 bg-violet-500/10 text-violet-300",
    dotDark: "bg-violet-400",
    label: "Info Session",
  },
  study: {
    accent: "#ffb900",
    bg: "bg-amber-400",
    dot: "bg-amber-500",
    chipDark: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    dotDark: "bg-amber-400",
    label: "Study",
  },
  milestone: {
    accent: "#7c86ff",
    bg: "bg-indigo-400",
    dot: "bg-indigo-500",
    chipDark: "border-indigo-400/30 bg-indigo-500/10 text-indigo-300",
    dotDark: "bg-indigo-400",
    label: "Milestone",
  },
} as const;

export type EventCategoryKey = keyof typeof EVENT_CATEGORY_VISUALS;

/**
 * The one structural agenda badge: a night with workshops on it. Nothing else
 * about a MEETING's structure says what it is (a competition is a mirrored
 * GitHub issue with an asynchronous lifecycle), and a night the structure
 * cannot describe is simply its category -- there is no "unscheduled" label.
 */
export const EVENT_SEGMENT_VISUALS = {
  workshop: {
    accent: "#00d492",
    bg: "bg-emerald-400",
    dot: "bg-emerald-500",
    chipDark: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    dotDark: "bg-emerald-400",
    label: "Workshop",
  },
} as const;

export function eventCategoryVisual(category?: string) {
  return category && category in EVENT_CATEGORY_VISUALS
    ? EVENT_CATEGORY_VISUALS[category as EventCategoryKey]
    : undefined;
}

/** "Sep 10, 2026" — the app's own date format, and this card's. */
export function formatEventDate(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-US", {
    timeZone: EVENT_TZ,
    dateStyle: "medium",
  });
}

/** "6:00 PM". */
export function formatEventTime(at: Date | string): string {
  return new Date(at).toLocaleTimeString("en-US", {
    timeZone: EVENT_TZ,
    timeStyle: "short",
  });
}

/** What an event card draws. Every field is already a finished string. */
export interface EventDetail {
  /** The meeting's name, as the page's own heading gives it. */
  title: string;
  /** "Sep 10, 2026". */
  date: string;
  /** "6:00 – 8:00 PM". */
  time: string;
  /** Building and room, already joined. Absent when there is no place. */
  location?: string;
  /** What the night is (`build`, `workshop`, `social`, `info`, `study`,
   * `milestone`): picks the card's hue and, absent a kicker, its eyebrow. */
  category?: EventCategoryKey;
  /** Cosmic (`devdogs`) or Paper (`gdgc`); `gdgc` co-brands the card. */
  brand?: "devdogs" | "gdgc";
  /** The series name over a topic-headline night's title ("Workshop Wednesday"). */
  kicker?: string;
  /** Overrides the meeting kind for a single agenda item's calendar badge. */
  badge?: { label: string; accent: string };
  /** What is on the agenda, most important first. */
  agenda?: string[];
  /**
   * Set when the meeting is called off. The card then says so before anything
   * else and drops the hour and the room, which are instructions to go
   * somewhere that no longer applies — the same rule the page's own metadata
   * follows.
   */
  cancelled?: { reason?: string };
  /** The path under the club domain, shown in the footer. */
  path?: string;
}

/**
 * Somewhere the campus map has no footprint for. The room text carries the
 * detail instead.
 *
 * One string literal, matching `OTHER_BUILDING` in the app's `buildings.ts`
 * and `MEETING_BUILDING_CHOICES` in `@devdogsuga/events`'s schema. Those
 * two already keep separate copies of this vocabulary, with a test holding
 * them together, for the same dependency-direction reason that applies here.
 */
const OTHER_BUILDING = "Other";

/**
 * Where a meeting is, in prose.
 *
 * Deliberately NOT the app's `locationLine`, which maps a building to the short
 * label the campus map prints over its pin — "SLC" for the Science Learning
 * Center. That abbreviation is right set at display scale over a building the
 * reader is already looking at, and wrong on a card that may be read by
 * somebody who has never been on campus, which is exactly who sees these on
 * the GDG platform. Full name, then the room.
 */
export function meetingLocation(
  building: string | null,
  room: string | null,
): string | undefined {
  const named =
    building === null || building === OTHER_BUILDING ? null : building;

  return [named, room].filter((part) => part).join(" ") || undefined;
}

/** A meeting, in the few fields a card needs. Both callers select these. */
export interface CardableMeeting {
  slug: string;
  startsAt: Date;
  endsAt: Date;
  building: string | null;
  location: string | null;
  category: string;
  brand?: "devdogs" | "gdgc";
  kicker?: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface MeetingCardInput {
  meeting: CardableMeeting;
  /** Already resolved by the caller, which owns the naming rules. */
  title: string;
  /** Already labelled. Empty for a cancelled night, which draws none. */
  agenda?: string[];
  /** Building and room, already joined by the caller's own mapping. */
  location?: string | null;
}

/**
 * Assembles the card's fields.
 *
 * `title` and `location` arrive resolved because the rules behind them are the
 * app's, not this package's: which of `nameOverride`, `kind` or the workshops
 * names a night, and which buildings have a short label worth printing. What
 * belongs here is the part both callers must agree on exactly — the dates, and
 * what a cancellation withdraws.
 */
export function meetingCardDetail({
  meeting,
  title,
  agenda,
  location,
}: MeetingCardInput): EventDetail {
  const cancelled = meeting.cancelledAt !== null;

  return {
    title,
    date: formatEventDate(meeting.startsAt),
    time: `${formatEventTime(meeting.startsAt)} – ${formatEventTime(meeting.endsAt)}`,
    location: location ?? undefined,
    category: eventCategoryVisual(meeting.category)
      ? (meeting.category as EventCategoryKey)
      : undefined,
    brand: meeting.brand,
    kicker: meeting.kicker ?? undefined,
    agenda: cancelled ? undefined : agenda,
    cancelled: cancelled
      ? { reason: meeting.cancellationReason ?? undefined }
      : undefined,
    path: `/events/${meeting.slug}`,
  };
}

/**
 * One workshop on a night, as its own card: the night's date, hour, room and
 * brand under the workshop's name, badged "Workshop" and with no agenda (it IS
 * the agenda item).
 *
 * Shared by `backstage graphics` and the console's graphics page so a workshop
 * poster means the same thing in both.
 */
export function workshopCardDetail(
  night: EventDetail,
  label: string,
): EventDetail {
  const visual = EVENT_SEGMENT_VISUALS.workshop;

  return {
    ...night,
    title: label,
    agenda: undefined,
    badge: { label: visual.label, accent: visual.accent },
  };
}
