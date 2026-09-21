import type { Metadata } from "next";
import { connection } from "next/server";
import PageShell from "~/components/PageShell";
import StarGrid from "~/components/participation/StarGrid";
import { StarTotalsRow } from "~/components/participation/StarBadges";
import ReflectionCards from "~/components/ReflectionCards";
import { formatEventDateTime, formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { getAttendanceMeetings } from "~/server/attendance/getMeetings";
import { expectSession } from "~/server/auth";
import { getStarsForUser, totalStars } from "~/server/loaders/stars";
import { getStreakForUser } from "~/server/loaders/streak";
import { getReflectionActivities } from "~/server/reflections/load";

export const metadata: Metadata = {
  title: "Attendance | DevDogs",
  robots: { index: false },
};

const STATUS_COPY: Record<
  string,
  { title: string; body: string; good?: boolean }
> = {
  recorded: {
    title: "Attendance recorded",
    body: "You’re checked in. Your attendance and progress have been updated.",
    good: true,
  },
  duplicate: {
    title: "Already checked in",
    body: "Your original attendance record is still on file.",
    good: true,
  },
  not_counted: {
    title: "This meeting isn’t eligible",
    body: "That meeting doesn’t count toward your participation passport, so nothing was recorded. If that’s wrong, ask an officer to mark the meeting eligible.",
  },
  revoked: {
    title: "Attendance needs officer review",
    body: "This attendance record was previously corrected. Please contact an officer on Discord.",
  },
  invalid_meeting: {
    title: "Meeting unavailable",
    body: "That meeting was canceled, removed, or could not be found.",
  },
  invalid: {
    title: "Code expired or invalid",
    body: "Use the current code shown at the meeting and try again.",
  },
  rate_limited: {
    title: "Too many attempts",
    body: "Wait about a minute, then try the current code again.",
  },
  uga_required: {
    title: "Use your UGA Google account",
    body: "Attendance was not recorded. Sign in again with an @uga.edu account, then scan or enter the current code.",
  },
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const requestedMeeting =
    typeof params.meeting === "string" ? params.meeting : undefined;
  const recordedAtParam =
    typeof params.recordedAt === "string" ? params.recordedAt : undefined;
  const recordedAt = recordedAtParam ? new Date(recordedAtParam) : null;
  const receipt = status ? STATUS_COPY[status] : undefined;
  const [meetings, userId] = await Promise.all([
    getAttendanceMeetings(),
    expectSession().catch(() => null),
  ]);
  const [stars, reflectionData, streak] = userId
    ? await Promise.all([
        getStarsForUser(userId),
        getReflectionActivities(userId),
        getStreakForUser(userId),
      ])
    : [null, null, null];
  const selected = meetings.some((meeting) => meeting.id === requestedMeeting)
    ? requestedMeeting
    : meetings[0]?.id;

  return (
    <PageShell
      accent="cyan"
      title="Attendance"
      description="Enter the rotating code shown at a DevDogs meeting. New members can sign in with their UGA Google account without losing their check-in."
    >
      {receipt && (
        <section
          className={`rounded-xl border-2 px-5 py-4 ${
            receipt.good
              ? "border-cyan-500/60 bg-cyan-950/60"
              : "border-rose-500/60 bg-rose-950/40"
          }`}
          role="status"
        >
          <h2 className="font-semibold text-white">{receipt.title}</h2>
          <p className="mt-1 text-sm text-mauve-200">{receipt.body}</p>
          {recordedAt && !Number.isNaN(recordedAt.getTime()) && (
            <p className="mt-2 text-sm font-medium text-white">
              Recorded {formatEventDateTime(recordedAt)}
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-6 shadow-lg shadow-black/30">
        <h2 className="text-lg font-semibold text-white">Enter meeting code</h2>
        <p className="mt-1 text-sm text-mauve-400">
          Codes rotate every 30 seconds. If the wrong meeting is selected, you
          can change it below.
        </p>

        {meetings.length === 0 ? (
          <p className="mt-6 text-sm text-mauve-300">
            There are no meetings available for attendance yet.
          </p>
        ) : (
          <form
            action="/attendance/claim"
            method="post"
            className="mt-6 grid gap-5"
          >
            <label className="grid gap-2 text-sm font-medium text-white">
              Meeting
              <select
                name="meeting"
                defaultValue={selected}
                required
                className="rounded-md border border-mauve-700 bg-mauve-900 px-3 py-2.5 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              >
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.ongoing ? "Now · " : ""}
                    {meetingTitle(meeting)} ·{" "}
                    {formatEventSpan(meeting.startsAt, meeting.endsAt)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-white">
              Six-digit code
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                placeholder="000000"
                className="rounded-md border border-mauve-700 bg-mauve-900 px-4 py-3 font-mono text-2xl tracking-[0.35em] text-white outline-none placeholder:text-mauve-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              />
            </label>

            <button
              type="submit"
              className="justify-self-start rounded-sm border-2 border-cyan-400 bg-cyan-400 px-5 py-2 font-medium text-black transition outline-none hover:bg-cyan-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-950"
            >
              Check in
            </button>
          </form>
        )}
      </section>

      {stars && (
        <section className="rounded-xl border-2 border-mauve-800 bg-mauve-950 px-6 py-6 shadow-lg shadow-black/30">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Your participation passport
              </h2>
              <p className="mt-1 text-sm text-mauve-400">
                One star for each eligible meeting you attend and competition
                you complete.
              </p>
            </div>
            <StarTotalsRow totals={totalStars(stars)} />
          </div>
          {streak && (
            <div className="mb-6 grid gap-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4 sm:grid-cols-3">
              <StreakStat
                label="Current streak"
                value={`${streak.current} weeks`}
              />
              <StreakStat
                label="Longest streak"
                value={`${streak.longest} weeks`}
              />
              <StreakStat
                label="This week"
                value={
                  streak.thisWeekRequired === 0
                    ? "No eligible events"
                    : `${streak.thisWeekEarned}/${streak.thisWeekRequired} stars`
                }
              />
            </div>
          )}
          <StarGrid cells={stars} />
        </section>
      )}

      {reflectionData && (
        <ReflectionCards
          activities={reflectionData.activities}
          minimumWordCount={reflectionData.minimumWordCount}
        />
      )}
    </PageShell>
  );
}

function StreakStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-mauve-400 uppercase">{label}</p>
      <p className="mt-1 font-semibold text-amber-300">{value}</p>
    </div>
  );
}
