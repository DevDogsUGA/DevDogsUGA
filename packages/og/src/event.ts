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
 * It is exported as `@devdogsuga/og/event` rather than from the package index,
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

/** One visual identity per authored kind, shared by calendar and event art. */
export const EVENT_KIND_VISUALS = {
  "Build Session": {
    accent: "#00a6f4",
    bg: "bg-sky-400",
    dot: "bg-sky-500",
    chipDark: "border-sky-400/30 bg-sky-500/10 text-sky-300",
    dotDark: "bg-sky-400",
  },
  "Study Session": {
    accent: "#ffb900",
    bg: "bg-amber-400",
    dot: "bg-amber-500",
    chipDark: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    dotDark: "bg-amber-400",
  },
  "Interest Meeting": {
    accent: "#a684ff",
    bg: "bg-violet-400",
    dot: "bg-violet-500",
    chipDark: "border-violet-400/30 bg-violet-500/10 text-violet-300",
    dotDark: "bg-violet-400",
  },
  Social: {
    accent: "#ff637e",
    bg: "bg-rose-400",
    dot: "bg-rose-500",
    chipDark: "border-rose-400/30 bg-rose-500/10 text-rose-300",
    dotDark: "bg-rose-400",
  },
} as const;

/**
 * Structural agenda badges, shared by the calendar and per-item event art.
 *
 * A competition is a mirrored GitHub issue with an asynchronous lifecycle --
 * nothing about a MEETING's structure says "this kicks off" or "this judges"
 * (see `apps/platform/src/lib/meetingSegments.ts`), so `workshop` and `open`
 * are the only two segments.
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
  open: {
    accent: "#ffb900",
    bg: "bg-amber-400",
    dot: "bg-amber-400",
    chipDark: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    dotDark: "bg-amber-400",
    label: "Unscheduled",
  },
} as const;

export function eventKindVisual(kind?: string) {
  return kind && kind in EVENT_KIND_VISUALS
    ? EVENT_KIND_VISUALS[kind as keyof typeof EVENT_KIND_VISUALS]
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
  /** The kind of night this is, for the chip: "Workshop", "Hack Night". */
  kind?: string;
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
  kind: string | null;
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
    kind: meeting.kind ?? undefined,
    agenda: cancelled ? undefined : agenda,
    cancelled: cancelled
      ? { reason: meeting.cancellationReason ?? undefined }
      : undefined,
    path: `/events/${meeting.slug}`,
  };
}
