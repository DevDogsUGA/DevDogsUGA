import { rules, requireAccess, loadCaller } from "~/server/auth/access";
import type { Metadata } from "next";
import Link from "next/link";
import OpenDisplayLink from "~/classic/components/AttendanceDisplay/OpenDisplayLink";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import PageShell from "~/classic/components/PageShell";
import ReflectionSettingsCard from "~/classic/components/ReflectionSettingsCard";
import { formatAttendanceCount } from "~/lib/attendanceCount";
import { formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { getAttendanceCounts } from "~/server/attendance/counts";
import { getOfficerAttendanceMeetings } from "~/server/attendance/getOfficerMeeting";
import { getReflectionSettings } from "~/server/reflections/settings";
import Badge from "~/classic/ui/badge";

export const metadata: Metadata = {
  title: "Meetings | Console | DevDogs",
  robots: { index: false },
};

export default async function AttendanceDisplaysPage() {
  // Any officer may open the list; the attendance tools, the counts and the
  // reflection settings on it still need `canManageAttendance`.
  const userId = (await requireAccess(rules.useGraphics)).userId;
  const [meetings, canManage] = await Promise.all([
    getOfficerAttendanceMeetings(),
    loadCaller().then(
      (caller) =>
        caller !== null &&
        caller.userId === userId &&
        rules.manageAttendance(caller),
    ),
  ]);
  const [counts, reflectionSettings] = canManage
    ? await Promise.all([getAttendanceCounts(), getReflectionSettings()])
    : [undefined, undefined];
  const now = new Date();

  return (
    <ConsoleFrame>
      <PageShell
        accent="cyan"
        title="Attendance displays"
        description="Open a meeting to see who attended and add or remove people, or open the live QR and rotating numeric code for it. Meetings stay available when they are past or in the future."
      >
        {reflectionSettings && (
          <ReflectionSettingsCard settings={reflectionSettings} />
        )}
        <p className="text-sm text-mauve-400">
          Opening a display launches a separate window, sized for dragging to a
          projector, instead of navigating away from this list.
        </p>
        <div className="overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 shadow-lg shadow-black/30">
          {meetings.length === 0 ? (
            <p className="p-6 text-sm text-mauve-300">No meetings found.</p>
          ) : (
            <ul className="divide-y divide-mauve-800">
              {meetings.map((meeting) => {
                const ongoing =
                  meeting.startsAt <= now && meeting.endsAt >= now;
                const canceled = meeting.cancelledAt !== null;
                const count = counts?.get(meeting.id);
                const details = (
                  <>
                    <span className="font-semibold text-white">
                      {meetingTitle(meeting)}
                    </span>
                    <span className="mt-1 block text-sm text-mauve-400">
                      {formatEventSpan(meeting.startsAt, meeting.endsAt)}
                      {meeting.startsAt <= now && !canceled && counts
                        ? ` · ${formatAttendanceCount(count ?? { total: 0, officers: 0 })}`
                        : ""}
                    </span>
                  </>
                );
                return (
                  <li
                    key={meeting.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    {canManage ? (
                      <Link
                        href={`/dashboard/meetings/${meeting.id}`}
                        className="min-w-48 flex-1 transition hover:text-cyan-300 focus-visible:outline-none"
                      >
                        {details}
                      </Link>
                    ) : (
                      <span className="min-w-48 flex-1">{details}</span>
                    )}
                    <span className="flex items-center gap-4">
                      {canceled ? (
                        <Badge variant="default">Canceled</Badge>
                      ) : ongoing ? (
                        <Badge variant="default">Happening now</Badge>
                      ) : null}
                      {canManage && !canceled && (
                        <OpenDisplayLink
                          href={`/dashboard/meetings/${meeting.id}`}
                          className="text-sm font-medium text-cyan-300 transition hover:text-white focus-visible:outline-none"
                        >
                          Open display →
                          <span className="sr-only">
                            {" "}
                            for {meetingTitle(meeting)} (opens the projector in
                            a new window)
                          </span>
                        </OpenDisplayLink>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PageShell>
    </ConsoleFrame>
  );
}
