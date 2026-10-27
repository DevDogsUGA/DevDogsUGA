import "./events.css";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  QrCodeIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import Scene from "~/components/Scene";
import {
  CANCELLED_LABEL,
  cancellationNotice,
  CATEGORY_LABEL,
  meetingCategory,
  timeRange,
} from "./meetingView";
import { meetingTitle, workshopLabel } from "~/lib/meetingTitle";
import { isMappedBuilding, locationLine, mapUrls } from "./FindUs/buildings";
import FindUs from "./FindUs";
import AddToCalendar from "./AddToCalendar";
import { calendarLinks } from "~/lib/calendarEvent";
import { env } from "~/env";
import { seriesKicker } from "~/server/config/seriesKicker";
import {
  clubDay,
  EVENT_TZ,
  formatEventLongDate,
  formatEventSpan,
  formatEventTime,
  formatRelative,
} from "~/lib/eventTime";
import JsonLd, { eventLd } from "~/lib/structuredData";
import type {
  MeetingSummary,
  MeetingWorkshop,
} from "~/server/loaders/meetings";
import Badge from "~/ui/badge";
import { Breadcrumbs } from "~/ui/breadcrumbs";
import Callout from "~/ui/callout";
import { Card } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { DefinitionList, DefinitionPair } from "~/ui/definition-list";
import LinkButton from "~/ui/link-button";
import { TextLink } from "~/ui/text-link";
import { Timeline, TimelineItem } from "~/ui/timeline";

/**
 * /events/[slug], one meeting, as a full page (`event-detail.html`).
 *
 * The STRUCTURE here is derived and stays that way: the agenda comes from the
 * workshops attached to the meeting. Nothing restates in prose what the
 * schedule already knows, because that copy goes stale the moment the schedule
 * moves and this URL exists to be pasted into Discord weeks in advance.
 *
 * Three authored fields are allowed through, separated from the rule above by
 * what they are ABOUT. `summary` and `nameOverride` describe the night, so
 * they are timing-shaped and held to one or two sentences an officer rewrites
 * when the night changes. `workshops.description` describes what a session
 * TEACHES, which does not move when the calendar does: a Supabase workshop
 * covers the same ground whichever Monday it lands on.
 *
 * No RSVP: the actions are Add to calendar, Directions and, while it is on,
 * Check in.
 */

const DAY_SHORT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: EVENT_TZ,
});
const MONTH_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: EVENT_TZ,
});

export default function MeetingDetail({
  slug,
  meeting,
  workshops,
  upcoming,
  now,
}: {
  slug: string;
  meeting: MeetingSummary;
  workshops: MeetingWorkshop[];
  /** The soonest meetings, for "Coming up"; this one is filtered out. */
  upcoming: MeetingSummary[];
  /** Read once by the caller so every state below agrees on the moment. */
  now: Date;
}) {
  const category = meetingCategory({ category: meeting.category });
  const title = meetingTitle(meeting, workshops);
  const kicker = seriesKicker(meeting.series, title);

  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  const ended = now >= meeting.endsAt;
  // A cancelled night is still a night with a page, a room and an agenda. Only
  // the clock-shaped claims and the actions come off it below.
  const cancelled = meeting.cancelledAt !== null;
  const notice = cancellationNotice(meeting);
  const where = locationLine(meeting.building, meeting.location);
  const baseUrl = env.BASE_URL.replace(/\/$/, "");
  const eventUrl = `${baseUrl}/events/${encodeURIComponent(slug)}`;
  const addToCalendar = calendarLinks({
    title,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    location: where,
    summary: meeting.summary,
    rsvpUrl: meeting.rsvpUrl,
    eventUrl,
  });
  const dayLabel = DAY_SHORT.format(meeting.startsAt);
  const when = timeRange(meeting.startsAt, meeting.endsAt);
  const sameDay =
    clubDay(now).year === clubDay(meeting.startsAt).year &&
    clubDay(now).month === clubDay(meeting.startsAt).month &&
    clubDay(now).day === clubDay(meeting.startsAt).day;
  const comingUp = upcoming
    .filter((next) => next.id !== meeting.id)
    .slice(0, 3);
  const host = new URL(eventUrl).host;

  return (
    <>
      {/* The facts the page prints, in the vocabulary a crawler reads, so this
          URL shows up as an event with its date rather than one more page.
          `where` is the value computed above rather than a second call, so the
          structured location and the visible one are the same string by
          construction. Nothing here is authored: every field comes off the
          meeting row, and `eventLd` omits the ones it cannot fill. */}
      <JsonLd
        data={eventLd({
          slug,
          name: title,
          startsAt: meeting.startsAt,
          endsAt: meeting.endsAt,
          summary: meeting.summary,
          where,
          cancelledAt: meeting.cancelledAt,
        })}
      />

      <section
        className="pagehead ev-head"
        data-kind={category}
        style={
          { "--head": `url(/cosmic/img/head-${category}.png)` } as CSSProperties
        }
      >
        <Scene name={`head-${category}`} />
        <div className="wrap ev-fill">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              {
                label: MONTH_LONG.format(meeting.startsAt),
                href: "/events",
              },
              { label: title },
            ]}
          />
          <div className="row ev-chips ev-head-chips">
            <Chip kind={category} outline={cancelled}>
              {CATEGORY_LABEL[category]}
            </Chip>
            {cancelled ? (
              <Badge variant="danger">
                <XCircleIcon weight="bold" aria-hidden />
                {CANCELLED_LABEL}
              </Badge>
            ) : happeningNow ? (
              <Badge variant="info">
                <ClockIcon weight="bold" aria-hidden />
                Happening now
              </Badge>
            ) : ended ? (
              <Badge>Ended</Badge>
            ) : sameDay ? (
              <Badge variant="info">
                <ClockIcon weight="bold" aria-hidden />
                Today
              </Badge>
            ) : null}
          </div>
          {kicker !== null && <p className="eyebrow">{kicker}</p>}
          <h1 className="display">{title}</h1>
          {/* A cancelled night keeps this URL rather than 404ing: the link is
              already in Discord and in people's calendars, and a vanished page
              tells a member nothing. So the notice comes first, ahead of the
              facts it voids, and they stay on the page struck through. The
              reason is null even on a cancelled night (the fact and the
              explanation arrive in separate keystrokes), so the word carries
              the meaning alone and the reason extends it when there is one. */}
          {notice !== null && <p className="ev-notice">{notice}</p>}
          <div className={cancelled ? "ev-facts struck" : "ev-facts"}>
            <span>
              <CalendarIcon weight="bold" aria-hidden />
              {formatEventLongDate(meeting.startsAt)}
            </span>
            <span>
              <ClockIcon weight="bold" aria-hidden />
              {when}
            </span>
            <span>
              <MapPinIcon weight="bold" aria-hidden />
              {where ?? "Room to be announced"}
            </span>
          </div>
          <p className="sr-only">
            {notice !== null
              ? `${notice}. Was ${formatEventSpan(meeting.startsAt, meeting.endsAt)}.`
              : formatEventSpan(meeting.startsAt, meeting.endsAt)}
          </p>
        </div>
      </section>

      <div className="wrap ev-fill" data-kind={category}>
        <div className="ev-detail">
          <aside className="ev-rail">
            {cancelled ? (
              <Card className="ev-action">
                <div className="eyebrow ev-bad">{CANCELLED_LABEL}</div>
                <div className="h2 ev-struck">{dayLabel}</div>
                <p className="small">
                  {meeting.cancellationReason ??
                    "This meeting is not happening."}
                </p>
                <LinkButton href="/events" variant="secondary">
                  See the schedule <ArrowRightIcon weight="bold" />
                </LinkButton>
              </Card>
            ) : happeningNow ? (
              <Card className="ev-action">
                <div className="eyebrow k">Happening now</div>
                <div className="h2">
                  Until {formatEventTime(meeting.endsAt)}
                </div>
                <p className="small muted">
                  {where ?? "Room to be announced"}
                  {meeting.attendanceCount > 0 &&
                    ` · ${meeting.attendanceCount} checked in so far`}
                </p>
                <span className="btn-shadow">
                  <LinkButton href="/attendance" variant="default">
                    <QrCodeIcon weight="bold" aria-hidden /> Check in
                  </LinkButton>
                </span>
              </Card>
            ) : ended ? (
              <Card className="ev-action">
                <div className="eyebrow">Ended · {dayLabel}</div>
                <div className="h2">
                  {meeting.attendanceCount === 0
                    ? "No check-ins recorded"
                    : `${meeting.attendanceCount} checked in`}
                </div>
                <p className="small muted">
                  Ended{" "}
                  <time dateTime={meeting.endsAt.toISOString()}>
                    {formatRelative(meeting.endsAt, now)}
                  </time>
                  .
                </p>
                <LinkButton href="/events" variant="secondary">
                  See the schedule <ArrowRightIcon weight="bold" />
                </LinkButton>
              </Card>
            ) : (
              <Card kind={category} glow className="ev-action" id="calendar">
                <div className="eyebrow k">
                  {dayLabel} · {when}
                </div>
                <div className="h2">
                  Starts{" "}
                  <time dateTime={meeting.startsAt.toISOString()}>
                    {formatRelative(meeting.startsAt, now)}
                  </time>
                </div>
                <AddToCalendar
                  googleUrl={addToCalendar.google}
                  outlookUrl={addToCalendar.outlook}
                  icsUrl={`/events/${encodeURIComponent(slug)}/calendar.ics`}
                />
                <a className="btn terminal sm ev-curl" href={eventUrl}>
                  <b>$</b> curl {host}/events/{slug}
                </a>
              </Card>
            )}

            <Card>
              <div className="card-head">
                <MapPinIcon weight="bold" aria-hidden className="ev-loc-icon" />
                <h2 className="card-title">Location</h2>
              </div>
              <DefinitionList className="ev-kv">
                <DefinitionPair
                  term="Room"
                  detail={where ?? "Room to be announced"}
                />
              </DefinitionList>
              {isMappedBuilding(meeting.building) && (
                <div className="ev-loc-actions">
                  <FindUs building={meeting.building} room={meeting.location} />
                  <TextLink asChild className="small">
                    <a
                      href={mapUrls(meeting.building).google}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in maps <ArrowUpRightIcon weight="bold" />
                    </a>
                  </TextLink>
                </div>
              )}
            </Card>
          </aside>

          <div className="ev-main">
            {meeting.summary !== null && (
              <section>
                <h2>About this event</h2>
                {/* Plain text authored in config, rendered as text. Never as
                    markup: it is typed by an officer, not authored as markup
                    in this repo. */}
                <p className="lead">{meeting.summary}</p>
              </section>
            )}

            {workshops.length > 0 && (
              <section>
                <h2>Agenda</h2>
                {/* A workshop has no start of its own. The only honest time
                    for one is the meeting's span, which the head already
                    shows, so these entries print no time rather than
                    inventing one. */}
                <Timeline>
                  {workshops.map((workshop) => (
                    <TimelineItem key={workshop.workshopId}>
                      <h3>{workshopLabel(workshop)}</h3>
                      {workshop.description !== null && (
                        <p>{workshop.description}</p>
                      )}
                    </TimelineItem>
                  ))}
                </Timeline>
              </section>
            )}

            {!ended && !cancelled && (
              <section id="checking-in">
                <h2>Checking in</h2>
                <Callout title="Scan the projector QR, then type the six-digit code.">
                  The QR opens the check-in page, and the code changes every 30
                  seconds. Check-in opens five minutes before the start. You
                  will be asked to sign in with UGA Google (@uga.edu); you
                  won&apos;t lose your check-in. No need to sign up beforehand.
                </Callout>
              </section>
            )}

            {comingUp.length > 0 && (
              <section>
                <h2>Coming up</h2>
                <div className="col ev-coming">
                  {comingUp.map((next) => (
                    <TextLink key={next.id} asChild>
                      <Link href={`/events/${next.slug}`}>
                        {DAY_SHORT.format(next.startsAt)} · {meetingTitle(next)}{" "}
                        <ArrowRightIcon weight="bold" />
                      </Link>
                    </TextLink>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
