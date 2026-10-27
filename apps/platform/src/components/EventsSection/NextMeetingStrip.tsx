import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarPlusIcon,
  ClockIcon,
  MapPinIcon,
} from "@phosphor-icons/react/ssr";
import { INVOLVEMENT_NETWORK_EVENTS_URL } from "~/config/nav";
import { EVENT_TZ, clubDateKey, formatEventTime } from "~/lib/eventTime";
import { categoryOf, type EventCategory } from "~/lib/eventKind";
import { meetingTitle } from "~/lib/meetingTitle";
import { type MeetingInRange } from "~/server/loaders/meetings";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { DateTile } from "~/ui/date-tile";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";
import { locationLine } from "./FindUs/buildings";

/**
 * The homepage's meetings, in the kit's event row.
 *
 * `NextMeetingStrip` is the lead card that overlaps the hero's foot: the soonest
 * meeting that has not ended, with the one thing a visitor needs to know about
 * coming (nothing to sign up for; check-in is by the projector's QR and code).
 * `MeetingRow` is the plain row the Events section lists under it. Both take
 * the meeting as data and never read the clock: `now` arrives from the caller,
 * and every zone-aware string goes through `Intl` with an explicit `timeZone`.
 */

/** What each category's chip says. Milestones are Demo Days on this schedule. */
const CATEGORY_LABEL: Record<EventCategory, string> = {
  build: "Build",
  workshop: "Workshop",
  social: "Social",
  info: "Info",
  study: "Study",
  milestone: "Demo Day",
};

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
});
const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  day: "numeric",
});
const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  month: "short",
});
const HOUR_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  hour12: false,
});
const CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** "6 PM" or "5:30 PM", split so a shared meridiem can be dropped from the first half. */
function clock(at: Date): { time: string; meridiem: string } {
  const parts = CLOCK_FMT.formatToParts(at);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const minute = get("minute");
  return {
    time: minute === "00" ? get("hour") : `${get("hour")}:${minute}`,
    meridiem: get("dayPeriod"),
  };
}

/** "6–8 PM", or "9 AM–3 PM" across noon. */
export function timeRange(startsAt: Date, endsAt: Date): string {
  const from = clock(startsAt);
  const to = clock(endsAt);
  return from.meridiem === to.meridiem
    ? `${from.time}–${to.time} ${to.meridiem}`
    : `${from.time} ${from.meridiem}–${to.time} ${to.meridiem}`;
}

function parts(meeting: MeetingInRange) {
  const kind = categoryOf(meeting);
  return {
    kind,
    title: meetingTitle(meeting, meeting.workshops),
    when: timeRange(meeting.startsAt, meeting.endsAt),
    where: locationLine(meeting.building, meeting.location) ?? "Location TBA",
    tile: {
      weekday: WEEKDAY_FMT.format(meeting.startsAt),
      day: DAY_FMT.format(meeting.startsAt),
      month: MONTH_FMT.format(meeting.startsAt),
    },
  };
}

function Meta({ when, where }: { when: string; where: string }) {
  return (
    <div className="meta">
      <span>
        <ClockIcon weight="bold" />
        {when}
      </span>
      <span>
        <MapPinIcon weight="bold" />
        {where}
      </span>
    </div>
  );
}

/** One upcoming meeting as a list row under the Events heading. */
export function MeetingRow({ meeting }: { meeting: MeetingInRange }) {
  const { kind, title, when, where, tile } = parts(meeting);
  return (
    <div className="event" data-kind={kind}>
      <DateTile kind={kind} {...tile} />
      <div>
        <div className="row home-eyebrow-row">
          <Chip kind={kind}>{CATEGORY_LABEL[kind]}</Chip>
        </div>
        <h3 className="title home-event-title">
          <Link href={`/events/${meeting.slug}`}>{title}</Link>
        </h3>
        <Meta when={when} where={where} />
      </div>
      <LinkButton
        href={`/events/${meeting.slug}`}
        variant="secondary"
        size="sm"
      >
        Details
      </LinkButton>
    </div>
  );
}

interface Props {
  /** The soonest meeting that has not ended, or null between semesters. */
  meeting: MeetingInRange | null;
  /** "Now", resolved by the caller. Never read in here. */
  now: Date;
}

/** Says when the meeting is, relative to the club's day: tonight, today, or just next. */
function eyebrowFor(meeting: MeetingInRange, now: Date): string {
  if (now >= meeting.startsAt && now < meeting.endsAt) return "Happening now";
  if (clubDateKey(meeting.startsAt) !== clubDateKey(now)) return "Next meeting";
  return Number(HOUR_FMT.format(meeting.startsAt)) >= 17 ? "Tonight" : "Today";
}

export default function NextMeetingStrip({ meeting, now }: Props) {
  // Months at a time, every summer: a state of the club, not of the query.
  if (meeting === null) return <NothingScheduled />;

  const { kind, title, when, where, tile } = parts(meeting);
  // Check-in opens five minutes before the start.
  const checkIn = formatEventTime(
    new Date(meeting.startsAt.getTime() - 5 * 60_000),
  );
  const over = now >= meeting.endsAt;

  return (
    <div className="wrap home-next">
      <Card kind={kind} glow>
        <div className="event">
          <DateTile kind={kind} {...tile} />
          <div>
            <div className="row home-eyebrow-row">
              <Chip kind={kind}>{CATEGORY_LABEL[kind]}</Chip>
              <span className="eyebrow k">{eyebrowFor(meeting, now)}</span>
            </div>
            <h3 className="title home-event-title">
              <Link href={`/events/${meeting.slug}`}>{title}</Link>
            </h3>
            <Meta when={when} where={where} />
            {over ? null : (
              <p className="home-note">
                You don&rsquo;t need to sign up. Scan the projector QR, then
                type the six-digit code; check-in opens at {checkIn}.
              </p>
            )}
          </div>
          <div className="home-actions">
            <LinkButton
              href={`/events/${meeting.slug}/calendar.ics`}
              prefetch={false}
              variant="secondary"
            >
              <CalendarPlusIcon weight="bold" />
              Add to calendar
            </LinkButton>
            <TextLink asChild>
              <Link href={`/events/${meeting.slug}`}>
                Details <ArrowRightIcon weight="bold" />
              </Link>
            </TextLink>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Between semesters, in one card.
 *
 * Says when the schedule comes back rather than that there is nothing. "No
 * events" reads as something broken, and this is the ordinary state of the club
 * for months at a time.
 */
function NothingScheduled() {
  return (
    <div className="wrap home-next">
      <Card>
        <div
          className="row"
          style={{ justifyContent: "space-between", gap: 24 }}
        >
          <div>
            <span className="eyebrow">Next meeting</span>
            <h3 className="title" style={{ margin: "8px 0" }}>
              Nothing on the calendar yet
            </h3>
            <p className="home-note">
              The fall schedule lands in August. New dates hit the Involvement
              Network first.
            </p>
          </div>
          <div className="home-actions">
            <LinkButton
              href={INVOLVEMENT_NETWORK_EVENTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
            >
              Involvement Network <ArrowUpRightIcon weight="bold" />
            </LinkButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
