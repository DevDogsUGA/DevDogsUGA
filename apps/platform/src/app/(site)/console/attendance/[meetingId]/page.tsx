import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AttendanceDisplay from "~/components/AttendanceDisplay";
import { toTitleCardMeeting } from "~/components/AttendanceDisplay/TitleCard";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import { requirePermission } from "~/server/auth/require";
import { PageHeading } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Attendance display | Console | DevDogs",
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
    <ConsoleShell current="/console/attendance">
      <PageHeading
        crumbs={[
          { label: "Meetings", href: "/console/attendance" },
          { label: title },
        ]}
        title="Attendance display"
        description={`${title} · ${formatEventSpan(meeting.startsAt, meeting.endsAt)}`}
        actions={
          <Link
            className="btn secondary"
            href={`/console/attendance/${meeting.id}/graphics`}
          >
            Graphics
          </Link>
        }
      />
      <AttendanceDisplay
        meetingId={meeting.id}
        canceled={meeting.cancelledAt !== null}
        meeting={toTitleCardMeeting(meeting, title)}
      />
    </ConsoleShell>
  );
}
