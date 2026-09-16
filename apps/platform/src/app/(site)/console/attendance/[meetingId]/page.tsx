import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AttendanceDisplay from "~/components/AttendanceDisplay";
import PageShell from "~/components/PageShell";
import { formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import { requirePermission } from "~/server/auth/require";

export const metadata: Metadata = {
  title: "Attendance Display | DevDogs",
  robots: { index: false },
};

export default async function OfficerAttendancePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  await requirePermission(canUserManageAttendance);
  const { meetingId } = await params;
  const meeting = await getOfficerAttendanceMeeting(meetingId);
  if (!meeting) notFound();
  const title = meetingTitle(meeting);

  return (
    <PageShell
      accent="cyan"
      title="Attendance display"
      description={`${title} · ${formatEventSpan(meeting.startsAt, meeting.endsAt)}`}
    >
      <AttendanceDisplay
        meetingId={meeting.id}
        title={title}
        canceled={meeting.cancelledAt !== null}
      />
    </PageShell>
  );
}
