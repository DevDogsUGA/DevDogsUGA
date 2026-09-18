import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import {
  PENDING_ATTENDANCE_COOKIE,
  verifyPendingAttendanceClaim,
} from "~/lib/pendingAttendanceClaim";
import { recordMemberAttendance } from "~/server/attendance/recordAttendance";
import { expectSession } from "~/server/auth";
import { requestAuthorization } from "~/server/auth/providers/google";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(PENDING_ATTENDANCE_COOKIE)?.value;
  if (!encoded) redirect(attendanceUrl(request, "invalid").toString());

  const claim = await verifyPendingAttendanceClaim(
    env.ATTENDANCE_TOKEN_SECRET,
    encoded,
  );
  if (!claim) {
    cookieStore.delete(PENDING_ATTENDANCE_COOKIE);
    redirect(attendanceUrl(request, "invalid").toString());
  }

  const userId =
    (await expectSession().catch(() => null)) ??
    (await requestAuthorization("/attendance/complete"));

  const result = await recordMemberAttendance(
    claim.meetingId,
    userId,
    claim.method,
  );
  cookieStore.delete(PENDING_ATTENDANCE_COOKIE);
  redirect(
    attendanceUrl(
      request,
      result.status,
      claim.meetingId,
      "recordedAt" in result ? result.recordedAt : undefined,
    ).toString(),
  );
}

function attendanceUrl(
  request: NextRequest,
  status: string,
  meetingId?: string,
  recordedAt?: Date,
): URL {
  const url = new URL("/attendance", request.url);
  url.searchParams.set("status", status);
  if (meetingId) url.searchParams.set("meeting", meetingId);
  if (recordedAt) url.searchParams.set("recordedAt", recordedAt.toISOString());
  return url;
}
