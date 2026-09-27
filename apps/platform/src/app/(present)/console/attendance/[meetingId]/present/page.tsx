import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AttendanceDisplay from "~/components/AttendanceDisplay";
import { toTitleCardMeeting } from "~/components/AttendanceDisplay/TitleCard";
import { meetingTitle } from "~/lib/meetingTitle";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import { requirePermission } from "~/server/auth/require";

export const metadata: Metadata = {
  title: "Attendance Display | DevDogs",
  robots: { index: false },
};

/**
 * The same display as `/console/attendance/[meetingId]`, full-viewport and
 * chrome-free -- what `OpenDisplayLink`'s popup actually opens, so the
 * window it lands in *is* the opening slide rather than a card inside the
 * console page. A distinct path (not a query param on the officer page)
 * because `(present)`'s layout has no site chrome to render underneath, and
 * `(site)`'s layout can't be turned off per-page -- see both layouts' doc
 * comments.
 *
 * Reachable directly (bookmarked, typed, opened via ctrl/middle-click on the
 * console list, which points at the plain officer URL and lets a browser's
 * own new-tab handling take over) as well as through the popup: same
 * `requirePermission` gate as the officer page, so there is no unauthenticated
 * path to a meeting's live code.
 */
export default async function PresentAttendancePage({
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
    <AttendanceDisplay
      meetingId={meeting.id}
      title={title}
      canceled={meeting.cancelledAt !== null}
      meeting={toTitleCardMeeting(meeting, title)}
      present
    />
  );
}
