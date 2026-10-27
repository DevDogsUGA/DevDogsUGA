import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import {
  PENDING_ATTENDANCE_COOKIE,
  PENDING_INVITE_COOKIE,
  verifyPendingAttendanceClaim,
} from "~/lib/pendingAttendanceClaim";
import { claimAttendanceInvite } from "~/server/attendance/officerAttendance";
import { recordMemberAttendance } from "~/server/attendance/recordAttendance";
import { expectSession, expectUserWith } from "~/server/auth";
import { requestAuthorization } from "~/server/auth/providers/google";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  const inviteToken = cookieStore.get(PENDING_INVITE_COOKIE)?.value;
  if (inviteToken) await completeInvite(request, inviteToken);

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

/**
 * Spends an officer's invite (Q51) for whoever UGA SSO just signed in. The
 * invite is claimed only by its own address; any other account is told so and
 * the invite stays usable.
 */
async function completeInvite(
  request: NextRequest,
  token: string,
): Promise<never> {
  const cookieStore = await cookies();
  const userId =
    (await expectSession().catch(() => null)) ??
    (await requestAuthorization("/attendance/complete"));
  const user = await expectUserWith({}).catch(() => null);

  const result = await claimAttendanceInvite(
    token,
    userId,
    user?.email ?? null,
  );
  cookieStore.delete(PENDING_INVITE_COOKIE);

  if (result.status === "recorded" || result.status === "duplicate") {
    redirect(
      attendanceUrl(
        request,
        result.status,
        result.meetingId,
        result.recordedAt,
      ).toString(),
    );
  }
  const status =
    result.status === "invalid_meeting"
      ? "invalid_meeting"
      : `invite_${result.status}`;
  redirect(attendanceUrl(request, status).toString());
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
