"use server";

import { authorize, rules } from "~/server/auth/access";

import { failure, type ActionResult } from "~/lib/actionResult";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "~/env";
import { parseMyId } from "~/lib/attendanceInvite";
import { formatEventLongDate, formatEventSpan } from "~/lib/eventTime";
import { meetingTitle } from "~/lib/meetingTitle";
import { getOfficerAttendanceMeeting } from "~/server/attendance/getOfficerMeeting";
import {
  addOfficerAttendance,
  cancelAttendanceInvite,
  createAttendanceInvite,
  findAccountByEmail,
  MAX_REMOVAL_REASON,
  removeAttendance,
  resendAttendanceInvite,
} from "~/server/attendance/officerAttendance";

import { sendTemplate } from "~/server/email/send";

/**
 * The console meeting page's writes (meeting detail). Every one re-checks
 * `canManageAttendance` itself: a server action is a public endpoint whatever
 * page renders its form.
 */

/** The lookup decision stays inline; later Commands perform the chosen step. */
export type AttendeeLookup =
  | { status: "confirm"; myId: string; name: string }
  | { status: "invite"; myId: string; email: string };

const NOT_AUTHORIZED = failure("Not authorized: canManageAttendance required.");

const meetingId = z.string().uuid();

function refresh(id: string) {
  revalidatePath(`/dashboard/meetings/${id}`);
  revalidatePath("/dashboard/meetings");
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Step one: what does this MyID resolve to? Writes nothing. */
export async function findAttendee(
  formData: FormData,
): Promise<ActionResult<AttendeeLookup>> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  if (!access.caller.userId) return NOT_AUTHORIZED;
  const parsed = parseMyId(field(formData, "myId"));
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const found = await findAccountByEmail(parsed.email);
  return found.status === "account"
    ? {
        ok: true,
        data: { status: "confirm", myId: parsed.myId, name: found.name },
      }
    : {
        ok: true,
        data: { status: "invite", myId: parsed.myId, email: parsed.email },
      };
}

/** Step two for an existing account: record them with method officer. */
export async function addAttendee(formData: FormData): Promise<ActionResult> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  const officerId = access.caller.userId;
  if (!officerId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const parsed = parseMyId(field(formData, "myId"));
  if (!meeting.success || !parsed.ok) {
    return { ok: false, message: "That request was not valid." };
  }
  const found = await findAccountByEmail(parsed.email);
  if (found.status !== "account") {
    return {
      ok: false,
      message:
        "That address has no account yet; look it up again to invite it.",
    };
  }
  const result = await addOfficerAttendance(
    officerId,
    meeting.data,
    found.userId,
  );
  refresh(meeting.data);
  switch (result.status) {
    case "recorded":
      return { ok: true, message: `${found.name} is recorded.` };
    case "duplicate":
      return {
        ok: true,
        message: `${found.name} was already recorded.`,
      };
    case "invalid_meeting":
      return {
        ok: false,
        message:
          "Attendance can only change once a meeting has started, and not for a canceled or removed one.",
      };
  }
}

async function emailInvite(
  meetingIdValue: string,
  ugaEmail: string,
  token: string,
  expiresAt: Date,
): Promise<boolean> {
  const meeting = await getOfficerAttendanceMeeting(meetingIdValue);
  if (!meeting) return false;
  const claimUrl = new URL("/attendance/claim", env.BASE_URL);
  claimUrl.searchParams.set("invite", token);
  const sent = await sendTemplate(ugaEmail, "AttendanceInvite", {
    meetingTitle: meetingTitle(meeting),
    whenLine: formatEventSpan(meeting.startsAt, meeting.endsAt),
    claimUrl: claimUrl.toString(),
    expiresDate: formatEventLongDate(expiresAt),
  });
  if (!sent.ok) {
    console.error("attendance_invite_email_failed", { reason: sent.reason });
  }
  return sent.ok;
}

const EMAIL_FAILED =
  "The invite is saved but the email could not be sent. Use Resend to try again.";

/** Step two for an address with no account: create the invite and email it. */
export async function inviteAttendee(
  formData: FormData,
): Promise<ActionResult> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  const officerId = access.caller.userId;
  if (!officerId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const parsed = parseMyId(field(formData, "myId"));
  if (!meeting.success || !parsed.ok) {
    return { ok: false, message: "That request was not valid." };
  }
  const result = await createAttendanceInvite(
    officerId,
    meeting.data,
    parsed.email,
  );
  if (result.status === "has_account") {
    return {
      ok: false,
      message: "That address now has an account; look it up again.",
    };
  }
  if (result.status === "invalid_meeting") {
    return {
      ok: false,
      message:
        "Attendance can only change once a meeting has started, and not for a canceled or removed one.",
    };
  }
  const sent = await emailInvite(
    meeting.data,
    parsed.email,
    result.token,
    result.expiresAt,
  );
  refresh(meeting.data);
  return sent
    ? { ok: true, message: `Invite sent to ${parsed.email}.` }
    : { ok: false, message: EMAIL_FAILED };
}

export async function resendInvite(formData: FormData): Promise<ActionResult> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  if (!access.caller.userId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const invite = z.string().uuid().safeParse(field(formData, "inviteId"));
  if (!meeting.success || !invite.success) {
    return { ok: false, message: "That request was not valid." };
  }
  const result = await resendAttendanceInvite(meeting.data, invite.data);
  if (result.status === "not_found") {
    refresh(meeting.data);
    return { ok: false, message: "That invite is no longer pending." };
  }
  const sent = await emailInvite(
    meeting.data,
    result.ugaEmail,
    result.token,
    result.expiresAt,
  );
  refresh(meeting.data);
  return sent
    ? { ok: true, message: `Invite resent to ${result.ugaEmail}.` }
    : { ok: false, message: EMAIL_FAILED };
}

export async function cancelInvite(formData: FormData): Promise<ActionResult> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  if (!access.caller.userId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const invite = z.string().uuid().safeParse(field(formData, "inviteId"));
  if (!meeting.success || !invite.success) {
    return { ok: false, message: "That request was not valid." };
  }
  const cancelled = await cancelAttendanceInvite(meeting.data, invite.data);
  refresh(meeting.data);
  return cancelled
    ? { ok: true, message: "Invite canceled; its link no longer works." }
    : { ok: false, message: "That invite is no longer pending." };
}

export async function removeAttendee(
  formData: FormData,
): Promise<ActionResult> {
  const access = await authorize(rules.manageAttendance);
  if (!access.ok) {
    return NOT_AUTHORIZED;
  }

  const officerId = access.caller.userId;
  if (!officerId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const attendance = z
    .string()
    .uuid()
    .safeParse(field(formData, "attendanceId"));
  const reason = z
    .string()
    .max(MAX_REMOVAL_REASON)
    .safeParse(field(formData, "reason"));
  if (!meeting.success || !attendance.success || !reason.success) {
    return {
      ok: false,
      message: `That request was not valid (a reason can be up to ${MAX_REMOVAL_REASON} characters).`,
    };
  }
  const result = await removeAttendance(
    officerId,
    meeting.data,
    attendance.data,
    reason.data,
  );
  refresh(meeting.data);
  switch (result.status) {
    case "removed":
      return { ok: true, message: "Removed from this meeting." };
    case "not_found":
      return { ok: false, message: "They are no longer on the list." };
    case "invalid_meeting":
      return {
        ok: false,
        message:
          "Attendance can only change once a meeting has started, and not for a canceled or removed one.",
      };
  }
}
