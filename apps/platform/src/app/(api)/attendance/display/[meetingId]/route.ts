import { NextResponse, type NextRequest } from "next/server";
import { env } from "~/env";
import {
  attendanceQrUrl,
  createManualCode,
  createQrChallenge,
} from "~/lib/attendanceChallenge";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  await requirePermission(canUserManageAttendance);
  const { meetingId } = await params;
  const meeting = await getOfficerAttendanceMeeting(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (
    meeting.cancelledAt &&
    request.nextUrl.searchParams.get("confirmCancelled") !== "true"
  ) {
    return NextResponse.json(
      { error: "Canceled meeting requires confirmation" },
      { status: 409 },
    );
  }

  const now = new Date();
  const challenge = await createQrChallenge(
    env.ATTENDANCE_TOKEN_SECRET,
    meetingId,
    now,
  );
  const code = await createManualCode(
    env.ATTENDANCE_TOKEN_SECRET,
    meetingId,
    now,
  );

  return NextResponse.json(
    {
      url: attendanceQrUrl(env.BASE_URL, challenge),
      code,
      bucket: challenge.bucket,
      expiresAt: (challenge.bucket + 1) * 30_000,
      attendanceCount: meeting.attendanceCount,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
