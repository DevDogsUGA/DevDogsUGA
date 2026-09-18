import { connection } from "next/server";
import { meetingTitle } from "~/lib/meetingTitle";
import { getAttendanceMeetings } from "~/server/attendance/getMeetings";
import AttendanceBannerClient from "./AttendanceBannerClient";

/** An uncached island: scheduled time controls visibility, not code validity. */
export default async function AttendanceBanner() {
  await connection();
  const meeting = (await getAttendanceMeetings()).find((item) => item.ongoing);
  if (!meeting) return null;
  return (
    <AttendanceBannerClient
      meetingId={meeting.id}
      title={meetingTitle(meeting)}
    />
  );
}
