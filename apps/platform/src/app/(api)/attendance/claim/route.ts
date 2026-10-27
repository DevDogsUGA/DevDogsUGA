import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env } from "~/env";
import { verifyManualCode, verifyQrChallenge } from "~/lib/attendanceChallenge";
import { looksLikeInviteToken } from "~/lib/attendanceInvite";
import {
  createPendingAttendanceClaim,
  PENDING_ATTENDANCE_COOKIE,
  PENDING_ATTENDANCE_MAX_AGE,
  PENDING_INVITE_COOKIE,
  PENDING_INVITE_MAX_AGE,
} from "~/lib/pendingAttendanceClaim";
import { isClaimableInvite } from "~/server/attendance/officerAttendance";
import { allowAttendanceAttempt } from "~/server/attendance/rateLimit";
import { expectSession } from "~/server/auth";
import { requestAuthorization } from "~/server/auth/providers/google";

export async function GET(request: NextRequest) {
  const invite = request.nextUrl.searchParams.get("invite");
  if (invite !== null) await startInviteClaim(request, invite);

  const meetingId = request.nextUrl.searchParams.get("meeting") ?? "";
  const bucket = Number(request.nextUrl.searchParams.get("bucket"));
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const permitted = await consumeAttempt(request);
  const valid =
    permitted &&
    (await verifyQrChallenge(env.ATTENDANCE_TOKEN_SECRET, {
      meetingId,
      bucket,
      token,
    }));

  if (!valid)
    redirect(
      attendanceUrl(request, permitted ? "invalid" : "rate_limited").toString(),
    );
  await continueClaim(meetingId, "qr");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const meetingValue = form.get("meeting");
  const codeValue = form.get("code");
  const meetingId = typeof meetingValue === "string" ? meetingValue : "";
  const code =
    typeof codeValue === "string" ? codeValue.replace(/\s/g, "") : "";
  const permitted = await consumeAttempt(request);
  const valid =
    permitted &&
    (await verifyManualCode(env.ATTENDANCE_TOKEN_SECRET, meetingId, code));

  if (!valid)
    redirect(
      attendanceUrl(request, permitted ? "invalid" : "rate_limited").toString(),
    );
  await continueClaim(meetingId, "manual_code");
}

async function consumeAttempt(request: NextRequest): Promise<boolean> {
  const userId = await expectSession().catch(() => null);
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? forwarded ?? "unknown";
  return allowAttendanceAttempt(userId ? `user:${userId}` : `ip:${ip}`);
}

async function continueClaim(
  meetingId: string,
  method: "qr" | "manual_code",
): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(
    PENDING_ATTENDANCE_COOKIE,
    await createPendingAttendanceClaim(
      env.ATTENDANCE_TOKEN_SECRET,
      meetingId,
      method,
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: env.DEPLOY_ENV !== "development",
      maxAge: PENDING_ATTENDANCE_MAX_AGE,
      path: "/attendance",
    },
  );

  const userId = await expectSession().catch(() => null);
  if (!userId) await requestAuthorization("/attendance/complete");
  redirect("/attendance/complete");
}

/**
 * The link an officer's invite emails (Q51). Nothing is recorded here: the
 * token is parked in a cookie, the visitor signs in with UGA SSO, and
 * `/attendance/complete` claims it for the address they signed in with.
 */
async function startInviteClaim(
  request: NextRequest,
  token: string,
): Promise<never> {
  if (!(await consumeAttempt(request))) {
    redirect(attendanceUrl(request, "rate_limited").toString());
  }
  if (!looksLikeInviteToken(token) || !(await isClaimableInvite(token))) {
    redirect(attendanceUrl(request, "invite_invalid").toString());
  }

  const cookieStore = await cookies();
  cookieStore.set(PENDING_INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.DEPLOY_ENV !== "development",
    maxAge: PENDING_INVITE_MAX_AGE,
    path: "/attendance",
  });

  const userId = await expectSession().catch(() => null);
  if (!userId) await requestAuthorization("/attendance/complete");
  redirect("/attendance/complete");
}

function attendanceUrl(request: NextRequest, status: string): URL {
  const url = new URL("/attendance", request.url);
  url.searchParams.set("status", status);
  return url;
}
