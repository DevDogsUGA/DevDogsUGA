import type { Metadata } from "next";
import Link from "next/link";
import Badge from "~/ui/badge";
import PageShell from "~/components/PageShell";
import { formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { getOfficerAttendanceMeetings } from "~/server/attendance/getOfficerMeeting";
import { requirePermission } from "~/server/auth/require";

export const metadata: Metadata = {
  title: "Attendance Displays | DevDogs",
  robots: { index: false },
};

export default async function AttendanceDisplaysPage() {
  await requirePermission(canUserManageAttendance);
  const meetings = await getOfficerAttendanceMeetings();
  const now = new Date();

  return (
    <PageShell
      accent="cyan"
      title="Attendance displays"
      description="Open the live QR and rotating numeric code for any meeting. Displays remain available for past and future meetings."
    >
      <div className="overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 shadow-lg shadow-black/30">
        {meetings.length === 0 ? (
          <p className="p-6 text-sm text-mauve-300">No meetings found.</p>
        ) : (
          <ul className="divide-y divide-mauve-800">
            {meetings.map((meeting) => {
              const ongoing = meeting.startsAt <= now && meeting.endsAt >= now;
              return (
                <li key={meeting.id}>
                  <Link
                    href={`/console/attendance/${meeting.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
                  >
                    <span>
                      <span className="font-semibold text-white">
                        {meetingTitle(meeting)}
                      </span>
                      <span className="mt-1 block text-sm text-mauve-400">
                        {formatEventSpan(meeting.startsAt, meeting.endsAt)}
                      </span>
                    </span>
                    {meeting.cancelledAt ? (
                      <Badge variant="default">Canceled</Badge>
                    ) : ongoing ? (
                      <Badge variant="default">Happening now</Badge>
                    ) : (
                      <span className="text-sm font-medium text-cyan-300">
                        Open display →
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
