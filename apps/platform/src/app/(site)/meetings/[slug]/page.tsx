import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import CheckInForm from "~/components/CheckInForm";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventDateTime, formatEventSpan } from "~/lib/eventTime";
import { checkIn } from "~/server/actions/attendance";
import type { CheckInOutcome } from "~/server/attendance/errors";
import { expectSession } from "~/server/auth";
import {
  checkInIsOpen,
  getMeetingBySlug,
  getMeetingWorkshops,
  type MeetingWorkshop,
} from "~/server/loaders/meetings";

/**
 * /meetings/[slug] — one meeting: when and where, what ran in it, and the box
 * that turns the code on the screen into an attendance row.
 *
 * The page itself is public. Only the check-in box needs to know who the
 * viewer is, so a session is resolved optionally rather than required — a
 * visitor reading the agenda of a meeting they have not signed up for is the
 * normal case, not an unauthorized one.
 */
export default async function MeetingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Every branch of the check-in panel below is a comparison against the
  // clock. Nothing on this page may be prerendered.
  await connection();

  const { slug } = await params;
  const meeting = await getMeetingBySlug(slug);
  if (!meeting) notFound();

  const [sessions, viewerId] = await Promise.all([
    getMeetingWorkshops(meeting.id),
    expectSession().catch(() => null),
  ]);

  const now = new Date();

  return (
    <ConsolePageShell
      accent="emerald"
      title={meeting.name}
      description={
        <>
          <time dateTime={meeting.startsAt.toISOString()}>
            {formatEventSpan(meeting.startsAt, meeting.endsAt)}
          </time>
          {meeting.location !== null && ` · ${meeting.location}`}
          {" · "}
          {meeting.attendanceCount === 1
            ? "1 member checked in"
            : `${meeting.attendanceCount} members checked in`}
        </>
      }
    >
      <section className="flex flex-col gap-3 rounded-sm border-2 border-black bg-white p-4">
        <h2 className="font-semibold">Check in</h2>
        <CheckInPanel
          open={checkInIsOpen(meeting, now)}
          startsAt={meeting.startsAt}
          checkInClosesAt={meeting.checkInClosesAt}
          now={now}
          signedIn={viewerId !== null}
          slug={meeting.slug}
          redeem={checkIn}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Workshops</h2>

        {sessions.length === 0 ? (
          <EmptyState
            title="No workshops on this one"
            body="Not every meeting runs a workshop — some are socials, talks, or work nights. Checking in still counts for attendance."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li
                key={session.workshopId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-black bg-white p-4"
              >
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`/meetings/${meeting.slug}/${session.projectSlug}`}
                    className="font-semibold"
                  >
                    {session.projectName}
                  </Link>
                  <span className="text-xs opacity-70">
                    {session.competitionSlug === null
                      ? // Stated rather than left blank: a workshop with no
                        // competition is a finished thing worth a star, and an
                        // empty line here would read as one that is missing
                        // something.
                        "Supplementary — one star for being here"
                      : session.teamCount === 1
                        ? "Competition · 1 team"
                        : `Competition · ${session.teamCount} teams`}
                  </span>
                </span>

                <Link
                  href={`/meetings/${meeting.slug}/${session.projectSlug}`}
                  className="text-sm underline"
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/meetings" className="text-sm underline">
        Back to all meetings
      </Link>
    </ConsolePageShell>
  );
}

/**
 * The four states of check-in, which are not the four states of the meeting.
 *
 * `checkInClosesAt` is its own column and deliberately lands before `endsAt`:
 * somebody who turns up at the end for the pizza should not earn what somebody
 * who sat through the workshop earned. So the closed message names the close
 * time rather than the end of the meeting, and the open test comes from
 * `checkInIsOpen` rather than from any comparison written here.
 */
function CheckInPanel({
  open,
  startsAt,
  checkInClosesAt,
  now,
  signedIn,
  slug,
  redeem,
}: {
  open: boolean;
  startsAt: Date;
  checkInClosesAt: Date;
  now: Date;
  signedIn: boolean;
  slug: string;
  redeem: (code: string) => Promise<CheckInOutcome>;
}) {
  if (!open) {
    return now < startsAt ? (
      <p className="text-sm opacity-70">
        Check-in opens when the meeting starts, and closes at{" "}
        <time dateTime={checkInClosesAt.toISOString()}>
          {formatEventDateTime(checkInClosesAt)}
        </time>
        . The code is on the screen at the front of the room.
      </p>
    ) : (
      <p className="text-sm opacity-70">
        Check-in closed at{" "}
        <time dateTime={checkInClosesAt.toISOString()}>
          {formatEventDateTime(checkInClosesAt)}
        </time>
        . If you were here, an officer can still add you to the roster.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <p className="text-sm">
        <Link
          href={`/auth?callbackPath=${encodeURIComponent(`/meetings/${slug}`)}`}
          className="underline"
        >
          Sign in
        </Link>{" "}
        to redeem the code on the screen. Attendance is tied to your account —
        it is what your stars are computed from.
      </p>
    );
  }

  return <CheckInForm redeem={checkIn} />;
}
