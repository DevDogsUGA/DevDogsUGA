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
  ACTION_DARK_CLS,
  CANCELLED_LABEL,
  cancellationNotice,
  CHIP_DARK_CLS,
  meetingBadges,
  segmentBadge,
} from "~/components/EventsSection/meetingView";
import Callout from "~/ui/callout";
import { meetingTitle, workshopLabel } from "~/lib/meetingTitle";
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
 * /events/[slug], one meeting, as the body of the dialog its layout opens.
 *
 * The STRUCTURE here is derived and stays that way: the segments come from
 * `resolveMeetingSegments` and the agenda from the workshops and judging
 * attached to the meeting. Nothing restates in prose what the schedule already
 * knows, because that copy goes stale the moment the schedule moves and this
 * URL exists to be pasted into Discord weeks in advance.
 *
 * Three authored fields are allowed through, separated from the rule above by
 * what they are ABOUT. `summary` and `nameOverride` describe the night, so
 * they are timing-shaped and held to one or two sentences an officer rewrites
 * when the night changes. `workshops.description` describes what a session
 * TEACHES, which does not move when the calendar does: a Supabase workshop
 * covers the same ground whichever Monday it lands on. It earns its place
 * because "this is self-contained and assumes no prior work" is the most
 * useful thing a prospective member can read here, and no derived structure
 * can say it.
 */

/**
 * Per-meeting metadata, because this URL is made to be handed around.
 *
 * Pasted into Discord or an announcement, an unfurl reading "Events | DevDogs"
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

  // ⚠️ The unfurl is the most-read thing this page produces, and it was the
  // last one still saying the meeting was on.
  //
  // A cancelled night keeps its URL rather than 404ing because the link is
  // already in Discord and people walk over anyway. That link renders as a card
  // carrying exactly these two fields, so the card sitting in the channel went
  // on advertising a 6:00 to 8:00 PM meeting in DLW 124 for a night the club
  // had called off.
  //
  // The room is dropped along with the hour: both are instructions to go
  // somewhere, and neither survives the cancellation.
  const notice = cancellationNotice(meeting);
  const description = notice ?? (where ? `${span} — ${where}` : span);

  return {
    // Derived rather than read: `nameOverride` is null for most nights, and
    // the naive version would put " | DevDogs" in the tab and in every link
    // preview. `generateMetadata` deliberately does not load the agenda for
    // this, so the title falls back through the kind to the date. One query is
    // not worth a richer tab.
    title: `${meetingTitle(meeting)} | DevDogs`,
    description,
  };
}

export default async function MeetingPage({
  params,
}: PageProps<"/events/[slug]">) {
  // Every line below is a comparison against now: whether the meeting is on,
  // how far off it is, whether there is a form to point at. `connection()`
  // opts the segment out of prerendering so those are answered for this
  // request rather than frozen at build time, the same reason the competition
  // teams page opens with it.
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

  // Both derived and authored are rendered: a social that also runs a workshop
  // is a real night, and showing only the kind would drop the workshop.
  // `segments` is empty for a night an officer named, so the composition has to
  // happen somewhere, and `meetingBadges` is that somewhere.
  const { segments } = resolveMeetingSegments({
    kind: meeting.kind,
    workshops,
    judgedCompetitions: judged,
  });
  const badges = meetingBadges({ kind: meeting.kind, segments });

  // Read once and threaded through everything below, so the three questions
  // that depend on it (happening now, ended, is the form live) cannot disagree
  // because the clock ticked between them. Reading it in render is only legal
  // because of the `await connection()` above, which makes this a request
  // rather than a prerender.
  const now = new Date();
  const happeningNow = now >= meeting.startsAt && now < meeting.endsAt;
  const ended = now >= meeting.endsAt;
  // A cancelled night is still a night with a page, a room and an agenda. Only
  // the clock-shaped claims and the two actions come off it below.
  const cancelled = meeting.cancelledAt !== null;
  const where = locationLine(meeting.building, meeting.location);

  return (
    <>
      {/* The facts the dialog prints, in the vocabulary a crawler reads, so
          this URL shows up as an event with its date rather than one more page.
          `where` is the value computed above rather than a second call, so the
          structured location and the visible one are the same string by
          construction. Nothing here is authored: every field comes off the
          meeting row, and `eventLd` omits the ones it cannot fill. */}
      <JsonLd
        data={eventLd({
          slug,
          // Google's Event rich-result guidelines want a name and most nights
          // have no authored one, so this derives rather than reading the
          // column. It is the same string the tab and the dialog title use,
          // computed once so the three cannot drift.
          name: meetingTitle(meeting, workshops),
          startsAt: meeting.startsAt,
          endsAt: meeting.endsAt,
          summary: meeting.summary,
          where,
          cancelledAt: meeting.cancelledAt,
        })}
      />
      {/* Derived chips then the officer's kind, which prints itself in the
          neutral pill when it has no hue of its own. See `kindBadge`. */}
      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <span
            key={badge.label}
            className={`${badge.chipDark} ${CHIP_DARK_CLS}`}
          >
            {badge.label}
          </span>
        ))}
      </div>

      {/* A cancelled night keeps this URL rather than 404ing, for the same
          reason the schedule keeps its row: the link is already in Discord and
          in people's calendars, and a vanished page tells a member nothing.
          They walk over anyway. So the notice comes first and the agenda below
          stays rendered: what was going to happen is still what somebody
          clicked to find out.

          `cancellationReason` is null even on a cancelled night, because the
          fact and the explanation arrive in separate keystrokes. The word
          carries the meaning alone and the reason extends it when there is
          one. */}
      {cancelled && (
        // `Callout tone="critical"`, not a hand-rolled block. The classes here
        // were `border-rose-400/30 bg-rose-400/10 text-rose-200`, character for
        // character `TONE_CLASSES.critical`, with a bolded first line, which is
        // what `title` is. Callout exists because these had been nine separate
        // inline blocks each picking its own radius and padding. This was the
        // tenth, and already disagreed with it on both.
        <Callout tone="critical" title={CANCELLED_LABEL}>
          {meeting.cancellationReason}
        </Callout>
      )}

      {/* The span itself is in the dialog header, where it stays put while
          this scrolls; what belongs here is the bit that needs the clock.
          Suppressed entirely for a cancelled night: "starts in two days" is the
          wrong half of that sentence, and the notice above has already said the
          useful one. */}
      {!cancelled && (
        <p className="text-sm font-semibold text-white">
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
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 text-sm text-mauve-300">
          <MapPinIcon className="shrink-0 text-mauve-400" weight="fill" />
          {where ?? "Room to be announced"}
        </p>
        {/* The in-place trigger, not `FindUsLink`: following the link would
            navigate away from this meeting, and a cold-loaded directions dialog
            closes to /events, so a member who only wanted walking directions
            would lose the meeting they were reading. Nested dialogs stack, and
            closing the inner one leaves this one open. As the `aside` of this
            dialog's pair, on a wide screen it opens beside the meeting instead
            of over it. */}
        {isMappedBuilding(meeting.building) && (
          <FindUs
            building={meeting.building}
            room={meeting.location}
            tone="dark"
            pair="aside"
          />
        )}
      </div>

      {/* Plain text from Airtable, rendered as text. Never as markup: it is
          typed into a form field by an officer, not authored in this repo. */}
      {meeting.summary !== null && (
        <p className="text-sm/relaxed text-mauve-300">{meeting.summary}</p>
      )}

      <section className="flex flex-col gap-2">
        {/* h3, not h2. The dialog's own title is the h2 here, since Radix
            renders `DialogTitle` as one and uses it for the accessible name, so
            a section inside the body has to sit a level below it rather than
            beside it, or a screen reader reads the agenda as a sibling of the
            meeting rather than part of it. */}
        <h3 className="font-display text-xs font-extrabold tracking-wide text-mauve-400 uppercase">
          Agenda
        </h3>
        {judged.length === 0 && workshops.length === 0 ? (
          <p className="rounded-lg border border-dashed border-mauve-700 bg-white/5 p-3 text-sm text-mauve-300">
            Nothing on the agenda yet — come build whatever you&rsquo;re working
            on.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* Judging first, and only judging carries a time: `judgingStartsAt`
                is authored, and two competitions judged the same night really do
                start at 18:00 and 18:40. A workshop has no start of its own. The
                only honest time for one is the meeting's span, which the header
                already shows, so these rows print no time rather than inventing
                one. */}
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

      {/* Neither action survives a cancellation. An RSVP button on a night that
          is not happening collects replies to nothing, and a check-in link
          would write attendance against it, the row a member would then have to
          argue their way out of. */}
      {!cancelled &&
        (meeting.rsvpUrl !== null ||
          (meeting.attendanceFormUrl !== null &&
            attendanceFormIsLive(meeting, now))) && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {meeting.rsvpUrl !== null && (
                <a
                  href={meeting.rsvpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ACTION_DARK_CLS}
                >
                  RSVP <ArrowUpRightIcon />
                </a>
              )}
              {/* `attendanceFormIsLive` answers "is there a link, and is the
                meeting on". NOT "is attendance open", which this process cannot
                know since the Airtable form's own open and close is the only
                gate. So the button is a pointer and the line below it refuses to
                promise anything. The null check is separate because the
                predicate does not narrow the type. */}
              {meeting.attendanceFormUrl !== null &&
                attendanceFormIsLive(meeting, now) && (
                  <a
                    href={meeting.attendanceFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ACTION_DARK_CLS}
                  >
                    <ClipboardTextIcon /> Check in <ArrowUpRightIcon />
                  </a>
                )}
            </div>
            {meeting.attendanceFormUrl !== null &&
              attendanceFormIsLive(meeting, now) && (
                <p className="text-xs text-mauve-400">
                  Officers open and close the check-in form themselves, so it
                  may not be taking responses yet.
                </p>
              )}
          </div>
        )}

      {/* ⚠️ `!cancelled`, and it is not a tidiness gate.
          `attendanceCount === 0` is GUARANTEED for a cancelled night, since
          nobody checks in to a meeting that did not happen, so this rendered
          "No check-ins were recorded for this meeting." under the red Cancelled
          notice, permanently, for every cancelled night in the archive: a
          sentence that is always false and reads as an accusation that nobody
          turned up. */}
      {ended && !cancelled && (
        <p className="border-t border-mauve-800 pt-3 text-sm text-mauve-400">
          {meeting.attendanceCount === 0
            ? "No check-ins were recorded for this meeting."
            : `${meeting.attendanceCount} ${meeting.attendanceCount === 1 ? "member" : "members"} checked in.`}
        </p>
      )}
    </>
  );
}

const ROW_CLS =
  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/5 p-3";

function JudgingRow({ judging }: { judging: MeetingRangeJudging }) {
  const badge = segmentBadge.judging;

  return (
    <li className={ROW_CLS}>
      <time
        dateTime={judging.judgingStartsAt.toISOString()}
        className="font-display text-sm font-extrabold text-white tabular-nums"
      >
        {formatEventTime(judging.judgingStartsAt)}
      </time>
      <Link
        href={`/competitions/${judging.competitionSlug}/teams`}
        className="text-sm font-semibold text-white underline decoration-2 underline-offset-2 hover:no-underline"
      >
        {/* Without a project there is no name to print, and the night still
            judges something, so the link keeps its target and wears the plain
            noun rather than opening an empty anchor. */}
        {workshopLabel(judging)}
      </Link>
      <span className={`${badge.chipDark} ${CHIP_DARK_CLS} ml-auto`}>
        {badge.label}
      </span>
    </li>
  );
}

function WorkshopRow({ workshop }: { workshop: MeetingWorkshop }) {
  // A workshop with no competition is a *supplementary* session: complete on
  // its own, worth exactly one star, and an ordinary thing for a Wednesday. So
  // it gets its own chip and its own sentence rather than an empty slot where a
  // competition link would have gone. The absence is the fact, not a gap in the
  // data.
  const badge =
    workshop.competitionSlug === null
      ? segmentBadge.workshop
      : segmentBadge.kickoff;

  return (
    <li className={ROW_CLS}>
      <span className="flex flex-col">
        {/* `workshopLabel`, not `projectName`. Officers name these sessions by
            topic ("Supabase", "Career Fair Readiness") and the schema named them
            by project, so the page printed "Platform" where the published
            schedule said "Next.js". A session with no project has only the
            title, and one authored before the column existed has only the
            project, so the fallback runs both ways. */}
        {workshop.competitionSlug === null ? (
          <span className="text-sm font-semibold text-white">
            {workshopLabel(workshop)}
          </span>
        ) : (
          <Link
            href={`/competitions/${workshop.competitionSlug}/teams`}
            className="text-sm font-semibold text-white underline decoration-2 underline-offset-2 hover:no-underline"
          >
            {workshopLabel(workshop)}
          </Link>
        )}
        <span className="text-xs text-mauve-400">
          {workshop.competitionSlug === null
            ? "Supplementary session"
            : workshop.teamCount === 1
              ? "1 team so far"
              : `${workshop.teamCount} teams so far`}
        </span>
      </span>
      <span className={`${badge.chipDark} ${CHIP_DARK_CLS} ml-auto`}>
        {badge.label}
      </span>
      {/* `basis-full` rather than a child of the flex-col above: `ROW_CLS` is
          `flex flex-wrap items-center`, so this wraps onto its own line and
          leaves the badge's `ml-auto` alignment intact. Putting it inside that
          column would force `items-start` on a class `JudgingRow` shares. */}
      {workshop.description !== null && (
        <span className="basis-full text-xs/relaxed text-mauve-600">
          {workshop.description}
        </span>
      )}
    </li>
  );
}
