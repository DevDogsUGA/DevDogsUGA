"use server";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { attendance, checkInCodes, meetings } from "~/server/db/schema";
import { canUserEditAttendance } from "~/server/actions/permissions";
import { isUniqueViolation } from "~/server/teams/errors";

export type CheckInCode =
  | "code_not_found"
  | "check_in_closed"
  | "already_checked_in";

export class CheckInError extends Error {
  readonly code: CheckInCode;
  constructor(code: CheckInCode, message?: string) {
    super(message ?? code);
    this.name = "CheckInError";
    this.code = code;
  }
}

export interface CheckInResult {
  meetingId: string;
  workshopId: string | null;
}

/**
 * Redeems a check-in code.
 *
 * Takes only the code and derives everything else. A member never picks a room
 * from a list, which is what makes it impossible to claim the wrong one — and
 * concurrent workshops are the only reason codes are per workshop rather than
 * per meeting.
 *
 * Validates against `meetings.checkInClosesAt`, NOT `endsAt`: arriving late is
 * normal and the grace period is deliberate, but a window that stays open
 * until somebody remembers to close it is an attendance-integrity hole nobody
 * notices.
 */
export async function checkIn(code: string): Promise<CheckInResult> {
  const userId = await expectSession();
  const normalized = code.trim().toUpperCase();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        meetingId: checkInCodes.meetingId,
        workshopId: checkInCodes.workshopId,
        expiresAt: checkInCodes.expiresAt,
        checkInClosesAt: meetings.checkInClosesAt,
      })
      .from(checkInCodes)
      .innerJoin(meetings, eq(meetings.id, checkInCodes.meetingId))
      .where(eq(checkInCodes.code, normalized))
      .limit(1);

    if (!row) throw new CheckInError("code_not_found");

    const now = Date.now();
    // Two clocks, both of which must still be open: the code's own rotation
    // window, and the meeting's check-in window. The code expiring first is
    // the normal case during rotation; the meeting's is the hard bound.
    if (row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now) {
      throw new CheckInError("check_in_closed");
    }
    if (new Date(row.checkInClosesAt).getTime() <= now) {
      throw new CheckInError("check_in_closed");
    }

    try {
      await tx.insert(attendance).values({
        meetingId: row.meetingId,
        workshopId: row.workshopId,
        userId,
        method: "code",
      });
    } catch (error) {
      // unique ("meetingId", "userId") — a member attends a meeting once no
      // matter how many workshops it holds, so a second redemption is a
      // no-op worth reporting rather than an error worth failing on.
      if (isUniqueViolation(error, "attendance_meetingId_userId_key")) {
        throw new CheckInError("already_checked_in");
      }
      throw error;
    }

    return { meetingId: row.meetingId, workshopId: row.workshopId };
  });
}

/**
 * Officer roster edit: add or remove one member's attendance for a meeting.
 *
 * Allowed at any time, including after check-in has closed — correcting a
 * roster the following week is the whole point. Stars derive from these rows,
 * so an edit here is visible on the star grid immediately, which is the main
 * reason stars are a view rather than a table.
 */
export async function setAttendance(
  meetingId: string,
  workshopId: string | null,
  memberId: string,
  present: boolean,
): Promise<void> {
  const callerId = await expectSession();
  if (!(await canUserEditAttendance(callerId))) {
    throw new Error("Not authorized to edit attendance");
  }

  if (!present) {
    await db
      .delete(attendance)
      .where(
        and(
          eq(attendance.meetingId, meetingId),
          eq(attendance.userId, memberId),
        ),
      );
    return;
  }

  await db
    .insert(attendance)
    .values({
      meetingId,
      workshopId,
      userId: memberId,
      method: "officer",
      recordedBy: callerId,
    })
    // Re-marking somebody present who already is should correct the room, not
    // fail. The method and recorder are overwritten too, because the officer
    // edit is now the authority for this row.
    .onConflictDoUpdate({
      target: [attendance.meetingId, attendance.userId],
      set: {
        workshopId,
        method: "officer",
        recordedBy: callerId,
        recordedAt: sql`now()`,
      },
    });
}

/** The roster for a meeting, for the officer console. */
export async function getMeetingRoster(meetingId: string) {
  const callerId = await expectSession();
  if (!(await canUserEditAttendance(callerId))) {
    throw new Error("Not authorized to read attendance");
  }

  return db
    .select({
      userId: attendance.userId,
      workshopId: attendance.workshopId,
      method: attendance.method,
      recordedAt: attendance.recordedAt,
    })
    .from(attendance)
    .where(eq(attendance.meetingId, meetingId));
}

/** Live codes for a meeting, for the screen at the front of the room. */
export async function getLiveCheckInCodes(meetingId: string) {
  const callerId = await expectSession();
  if (!(await canUserEditAttendance(callerId))) {
    throw new Error("Not authorized to read check-in codes");
  }

  return db
    .select({
      code: checkInCodes.code,
      workshopId: checkInCodes.workshopId,
      expiresAt: checkInCodes.expiresAt,
    })
    .from(checkInCodes)
    .where(
      and(
        eq(checkInCodes.meetingId, meetingId),
        or(
          isNull(checkInCodes.expiresAt),
          sql`${checkInCodes.expiresAt} > now()`,
        ),
      ),
    );
}
