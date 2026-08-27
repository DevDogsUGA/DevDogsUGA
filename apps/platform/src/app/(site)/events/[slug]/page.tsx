import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  ArrowUpRightIcon,
  ClipboardTextIcon,
  MapPinIcon,
} from "@phosphor-icons/react/ssr";
import {
  ACTION_CLS,
  CHIP_CLS,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import {
  isMappedBuilding,
  locationLine,
} from "~/components/EventsSection/FindUs/buildings";
import FindUs from "~/components/EventsSection/FindUs";
import {
  formatEventSpan,
  formatEventTime,
  formatRelative,
} from "~/lib/eventTime";
import JsonLd, { eventLd } from "~/lib/structuredData";
import {
  attendanceFormIsLive,
  getMeetingBySlug,
  getMeetingWorkshops,
  getMeetingJudging,
  resolveMeetingSegments,
  type MeetingRangeJudging,
  type MeetingWorkshop,
} from "~/server/loaders/meetings";

/**
 * /events/[slug] — one meeting, as the body of the dialog its layout opens.
 *
 * Everything here is derived. There is no authored copy about what a given
 * night is: the segments come from `resolveMeetingSegments`, the agenda from
 * the workshops and judging attached to the meeting, and the only sentence an
 * officer can write is `summary`. That is deliberate — a page that authored
 * its own description of a meeting would go stale the moment the schedule
 * moved, and this URL exists to be pasted into Discord weeks in advance.
 */

/**
 * Its own metadata because this URL is made to be handed around — pasted into
 * Discord, put in an announcement — and an unfurl reading "Events | DevDogs"
 * tells nobody which night they are being invited to. Title carries the name,
 * description the two facts that decide whether somebody comes: when, and
 * where.
 */
export async function generateMetadata({
  params,
}: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);

  // A dead link still gets unfurled, so it gets an honest card rather than
  // whatever the parent layout's title happens to be.
  if (!meeting) {
    return {
      title: "Meeting not found | DevDogs",
      description: "No meeting on the DevDogs schedule matches this link.",
    };
  }

  const span = formatEventSpan(meeting.startsAt, meeting.endsAt);

  const where = locationLine(meeting.building, meeting.location);

  return {
    title: `${meeting.name} | DevDogs`,
    description: where ? `${span} — ${where}` : span,
  };
}

export default async function MeetingPage({
  params,
}: PageProps<"/events/[slug]">) {
  // Every line below is a comparison against now: whether the meeting is on,
  // how far off it is, whether there is a form to point at. `connection()`
  // opts the segment out of prerendering so those are answered for this
  // request rather than frozen at build time — the same reason the
  // competition teams page opens with it.
  await connection();

  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);
  // The layout renders the dialog frame either way and falls back in its
  // header; this interrupt swaps only the body for `not-found.tsx`, so the
  // miss stays inside the dialog with the calendar still behind it.
  if (!meeting) notFound();

  const [workshops, judged] = await Promise.all([
    getMeetingWorkshops(meeting.id),
    getMeetingJudging(meeting.id),
  ]);

  // `kindOverride` comes back separately from `segments` rather than replacing
  // them, and both are rendered: a social that also runs a workshop is a real
  // night, and showing only the override would quietly drop the workshop.
  const { segments, kindOverride } = resolveMeetingSegments({
    kind: meeting.kind,
    workshops,
    judgedCompetitions: judged,
  });

  // Read once and threaded through everything below, so the three questions
  // that depend on it — happening now, ended, is the form live — cannot
  // disagree because the clock ticked between them. Reading it in render is
  // only legal because of the `await connection()` above, which is what makes
  // this a request rather than a prerender.
  const now = new Date();
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  const ended = now >= meeting.endsAt;
  const where = locationLine(meeting.building, meeting.location);

  return (
    <>
      {/* The facts the dialog prints, in the vocabulary a crawler reads —
          which is what lets this URL show up as an event, with its date, rather
          than as one more page. `where` is the value already computed above
          rather than a second call, so the structured location and the visible
          one are the same string by construction. Nothing here is authored:
          every field comes off the meeting row, and `eventLd` omits the ones it
          cannot fill rather than guessing at them. */}
      <JsonLd
        data={eventLd({
          slug,
          name: meeting.name,
          startsAt: meeting.startsAt,
          endsAt: meeting.endsAt,
          summary: meeting.summary,
          where,
        })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {segments.map((segment) => {
          const badge = segmentBadge[segment];
          return (
            <span
              key={segment}
              className={`${badge.bg} ${badge.text} ${CHIP_CLS}`}
            >
              {badge.label}
            </span>
          );
        })}
        {/* Printed verbatim, in a neutral chip. `kind` is an Airtable
            single-select an officer can extend without touching this repo, so
            a value this side has never heard of has to render as itself. */}
        {kindOverride !== null && (
          <span
            className={`border-2 border-black bg-white text-black ${CHIP_CLS}`}
          >
            {kindOverride}
          </span>
        )}
      </div>

      {/* The span itself is in the dialog header, where it stays put while
          this scrolls; what belongs here is the bit that needs the clock. */}
      <p className="text-sm font-semibold text-black">
        {happeningNow ? (
          <>Happening now — until {formatEventTime(meeting.endsAt)}</>
        ) : ended ? (
          <>
            Ended{" "}
            <time dateTime={meeting.endsAt.toISOString()}>
              {formatRelative(meeting.endsAt, now)}
            </time>
          </>
        ) : (
          <>
            Starts{" "}
            <time dateTime={meeting.startsAt.toISOString()}>
              {formatRelative(meeting.startsAt, now)}
            </time>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 text-sm text-mauve-700">
          <MapPinIcon className="shrink-0 text-mauve-500" weight="fill" />
          {where ?? "Room to be announced"}
        </p>
        {/* The in-place trigger, not `FindUsLink`: following the link would
            navigate away from this meeting, and a cold-loaded directions
            dialog closes to /events, so a member who only wanted walking
            directions would lose the meeting they were reading. Nested
            dialogs stack, and closing the inner one leaves this one open. */}
        {isMappedBuilding(meeting.building) && (
          <FindUs building={meeting.building} room={meeting.location} />
        )}
      </div>

      {/* Plain text from Airtable, rendered as text. Never as markup: it is
          typed into a form field by an officer, not authored in this repo. */}
      {meeting.summary !== null && (
        <p className="text-sm/relaxed text-mauve-700">{meeting.summary}</p>
      )}

      <section className="flex flex-col gap-2">
        {/* h3, not h2: the dialog's own title is the h2 here — Radix renders
            `DialogTitle` as one and uses it for the accessible name — so a
            section inside the body has to sit a level below it rather than
            beside it, or a screen reader reads the agenda as a sibling of the
            meeting rather than part of it. */}
        <h3 className="font-display text-xs font-extrabold tracking-wide text-mauve-500 uppercase">
          Agenda
        </h3>
        {judged.length === 0 && workshops.length === 0 ? (
          <p className="rounded-sm border-2 border-black bg-white p-3 text-sm text-mauve-700">
            Nothing is scheduled for this night yet — come build whatever you
            are working on.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* Judging first, and only judging carries a time: `judgingStartsAt`
                is authored, and two competitions judged the same night really do
                start at 18:00 and 18:40. A workshop has no start of its own —
                the only honest time for one is the meeting's span, which the
                header already shows — so these rows print no time rather than
                inventing one. */}
            {judged.map((competition) => (
              <JudgingRow
                key={competition.competitionId}
                judging={competition}
              />
            ))}
            {workshops.map((workshop) => (
              <WorkshopRow key={workshop.workshopId} workshop={workshop} />
            ))}
          </ul>
        )}
      </section>

      {(meeting.rsvpUrl !== null ||
        (meeting.attendanceFormUrl !== null &&
          attendanceFormIsLive(meeting, now))) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {meeting.rsvpUrl !== null && (
              <a
                href={meeting.rsvpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION_CLS}
              >
                RSVP <ArrowUpRightIcon />
              </a>
            )}
            {/* `attendanceFormIsLive` answers "is there a link, and is the
                meeting on" — NOT "is attendance open", which this process
                cannot know since the Airtable form's own open and close is the
                only gate. So the button is a pointer and the line below it
                refuses to promise anything. The null check is separate because
                the predicate does not narrow the type. */}
            {meeting.attendanceFormUrl !== null &&
              attendanceFormIsLive(meeting, now) && (
                <a
                  href={meeting.attendanceFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ACTION_CLS}
                >
                  <ClipboardTextIcon /> Check in <ArrowUpRightIcon />
                </a>
              )}
          </div>
          {meeting.attendanceFormUrl !== null &&
            attendanceFormIsLive(meeting, now) && (
              <p className="text-xs text-mauve-500">
                Officers open and close the check-in form themselves, so it may
                not be taking responses yet.
              </p>
            )}
        </div>
      )}

      {ended && (
        <p className="border-t-2 border-mauve-200 pt-3 text-sm text-mauve-600">
          {meeting.attendanceCount === 0
            ? "No check-ins were recorded for this meeting."
            : `${meeting.attendanceCount} ${meeting.attendanceCount === 1 ? "member" : "members"} checked in.`}
        </p>
      )}
    </>
  );
}

const ROW_CLS =
  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border-2 border-black bg-white p-3";

function JudgingRow({ judging }: { judging: MeetingRangeJudging }) {
  const badge = segmentBadge.judging;

  return (
    <li className={ROW_CLS}>
      <time
        dateTime={judging.judgingStartsAt.toISOString()}
        className="font-display text-sm font-extrabold text-black tabular-nums"
      >
        {formatEventTime(judging.judgingStartsAt)}
      </time>
      <Link
        href={`/competitions/${judging.competitionSlug}/teams`}
        className="text-sm font-semibold text-black underline"
      >
        {judging.projectName}
      </Link>
      <span className={`${badge.bg} ${badge.text} ${CHIP_CLS} ml-auto`}>
        {badge.label}
      </span>
    </li>
  );
}

function WorkshopRow({ workshop }: { workshop: MeetingWorkshop }) {
  // A workshop with no competition is a *supplementary* session: complete on
  // its own, worth exactly one star, and a perfectly ordinary thing for a
  // Wednesday. So it gets its own chip and its own sentence rather than an
  // empty slot where a competition link would have gone — the absence is the
  // fact, not a gap in the data.
  const badge =
    workshop.competitionSlug === null
      ? segmentBadge.workshop
      : segmentBadge.kickoff;

  return (
    <li className={ROW_CLS}>
      <span className="flex flex-col">
        {workshop.competitionSlug === null ? (
          <span className="text-sm font-semibold text-black">
            {workshop.projectName}
          </span>
        ) : (
          <Link
            href={`/competitions/${workshop.competitionSlug}/teams`}
            className="text-sm font-semibold text-black underline"
          >
            {workshop.projectName}
          </Link>
        )}
        <span className="text-xs text-mauve-500">
          {workshop.competitionSlug === null
            ? "Supplementary session"
            : workshop.teamCount === 1
              ? "1 team so far"
              : `${workshop.teamCount} teams so far`}
        </span>
      </span>
      <span className={`${badge.bg} ${badge.text} ${CHIP_CLS} ml-auto`}>
        {badge.label}
      </span>
    </li>
  );
}
