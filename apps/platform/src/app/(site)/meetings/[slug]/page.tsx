import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { formatEventSpan } from "~/lib/eventTime";
import {
  attendanceFormIsLive,
  getMeetingBySlug,
  getMeetingWorkshops,
} from "~/server/loaders/meetings";

/**
 * /meetings/[slug] — one meeting: when and where, what ran in it, and the link
 * to the attendance form while it is open.
 *
 * Wholly public, and it no longer resolves a session at all. It used to,
 * because the old check-in box turned a code shown on screen into an
 * attendance row and needed to know who was typing. That box went away with
 * `20260806000001_platform_drop_check_in_codes.sql` — attendance is captured in
 * an Airtable form now and mirrored back — leaving an `expectSession()` whose
 * result nothing read, one extra session lookup per request for a feature that
 * no longer exists.
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

  const sessions = await getMeetingWorkshops(meeting.id);

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
        <AttendancePanel
          live={attendanceFormIsLive(meeting, now)}
          startsAt={meeting.startsAt}
          endsAt={meeting.endsAt}
          formUrl={meeting.attendanceFormUrl}
          now={now}
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
 * The link to this week's form, or the reason there is not one.
 *
 * The platform no longer knows whether attendance is open — the form's own
 * window is the only gate and this process cannot read it — so every state here
 * is worded as a pointer rather than a promise. Claiming "attendance is open"
 * next to a closed form would be worse than saying nothing.
 *
 * The URL is officer-pasted rather than discovered, because it cannot be
 * discovered: the Meta API returns views as `{id, name, type}` and a form's
 * public share token is not among them.
 */
function AttendancePanel({
  live,
  startsAt,
  endsAt,
  formUrl,
  now,
}: {
  live: boolean;
  startsAt: Date;
  endsAt: Date;
  formUrl: string | null;
  now: Date;
}) {
  if (live && formUrl !== null) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <a
          href={formUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start rounded-sm border-2 border-black bg-black px-4 py-2 font-semibold text-white"
        >
          Open the attendance form
        </a>
        <p className="opacity-70">
          Enter your UGA MyID — the part before @uga.edu — and pick the workshop
          you sat in. It appears on your profile within about fifteen minutes.
        </p>
      </div>
    );
  }

  if (now < startsAt) {
    return (
      <p className="text-sm opacity-70">
        Attendance is collected on a form during the meeting. The link appears
        here once officers have set this week&rsquo;s up.
      </p>
    );
  }

  if (now >= endsAt) {
    return (
      <p className="text-sm opacity-70">
        This meeting has ended. If you were here and are not on the roster, an
        officer can still add you.
      </p>
    );
  }

  // In progress, but no link — the officer has not pasted one yet.
  return (
    <p className="text-sm opacity-70">
      Attendance is collected on a form in the room. Ask an officer for the link
      if it is not on the screen.
    </p>
  );
}
