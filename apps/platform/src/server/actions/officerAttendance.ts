"use server";

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
import { expectSession } from "~/server/auth";
import { sendTemplate } from "~/server/email/send";
import { canUserManageAttendance } from "./permissions";

/**
 * The console meeting page's writes (meeting detail). Every one re-checks
 * `canManageAttendance` itself: a server action is a public endpoint whatever
 * page renders its form.
 */

export type OfficerAttendanceState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  /** The address has an account: name it and ask for confirmation. */
  | { status: "confirm"; myId: string; name: string }
  /** No account: the next confirmation emails a claim link. */
  | { status: "invite"; myId: string; email: string };

const NOT_AUTHORIZED: OfficerAttendanceState = {
  status: "error",
  message: "Not authorized: canManageAttendance required.",
};

async function officer(): Promise<string | null> {
  const userId = await expectSession().catch(() => null);
  if (!userId) return null;
  return (await canUserManageAttendance(userId)) ? userId : null;
}

const meetingId = z.string().uuid();

function refresh(id: string) {
  revalidatePath(`/console/attendance/${id}`);
  revalidatePath("/console/attendance");
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Step one: what does this MyID resolve to? Writes nothing. */
export async function findAttendee(
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  if (!(await officer())) return NOT_AUTHORIZED;
  const parsed = parseMyId(field(formData, "myId"));
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const found = await findAccountByEmail(parsed.email);
  return found.status === "account"
    ? { status: "confirm", myId: parsed.myId, name: found.name }
    : { status: "invite", myId: parsed.myId, email: parsed.email };
}

/** Step two for an existing account: record them with method officer. */
export async function addAttendee(
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  const officerId = await officer();
  if (!officerId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const parsed = parseMyId(field(formData, "myId"));
  if (!meeting.success || !parsed.ok) {
    return { status: "error", message: "That request was not valid." };
  }
  const found = await findAccountByEmail(parsed.email);
  if (found.status !== "account") {
    return {
      status: "error",
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
      return { status: "done", message: `${found.name} is recorded.` };
    case "duplicate":
      return {
        status: "done",
        message: `${found.name} was already recorded.`,
      };
    case "invalid_meeting":
      return {
        status: "error",
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
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  const officerId = await officer();
  if (!officerId) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const parsed = parseMyId(field(formData, "myId"));
  if (!meeting.success || !parsed.ok) {
    return { status: "error", message: "That request was not valid." };
  }
  const result = await createAttendanceInvite(
    officerId,
    meeting.data,
    parsed.email,
  );
  if (result.status === "has_account") {
    return {
      status: "error",
      message: "That address now has an account; look it up again.",
    };
  }
  if (result.status === "invalid_meeting") {
    return {
      status: "error",
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
    ? { status: "done", message: `Invite sent to ${parsed.email}.` }
    : { status: "error", message: EMAIL_FAILED };
}

export async function resendInvite(
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  if (!(await officer())) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const invite = z.string().uuid().safeParse(field(formData, "inviteId"));
  if (!meeting.success || !invite.success) {
    return { status: "error", message: "That request was not valid." };
  }
  const result = await resendAttendanceInvite(meeting.data, invite.data);
  if (result.status === "not_found") {
    refresh(meeting.data);
    return { status: "error", message: "That invite is no longer pending." };
  }
  const sent = await emailInvite(
    meeting.data,
    result.ugaEmail,
    result.token,
    result.expiresAt,
  );
  refresh(meeting.data);
  return sent
    ? { status: "done", message: `Invite resent to ${result.ugaEmail}.` }
    : { status: "error", message: EMAIL_FAILED };
}

export async function cancelInvite(
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  if (!(await officer())) return NOT_AUTHORIZED;
  const meeting = meetingId.safeParse(field(formData, "meetingId"));
  const invite = z.string().uuid().safeParse(field(formData, "inviteId"));
  if (!meeting.success || !invite.success) {
    return { status: "error", message: "That request was not valid." };
  }
  const cancelled = await cancelAttendanceInvite(meeting.data, invite.data);
  refresh(meeting.data);
  return cancelled
    ? { status: "done", message: "Invite canceled; its link no longer works." }
    : { status: "error", message: "That invite is no longer pending." };
}

export async function removeAttendee(
  _previous: OfficerAttendanceState,
  formData: FormData,
): Promise<OfficerAttendanceState> {
  const officerId = await officer();
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
      status: "error",
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
      return { status: "done", message: "Removed from this meeting." };
    case "not_found":
      return { status: "error", message: "They are no longer on the list." };
    case "invalid_meeting":
      return {
        status: "error",
        message:
          "Attendance can only change once a meeting has started, and not for a canceled or removed one.",
      };
  }
}
