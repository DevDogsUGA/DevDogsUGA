"use server";

import { and, eq, sql } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { attendance } from "~/server/db/schema";
import { canUserEditAttendance } from "~/server/actions/permissions";

/**
 * Attendance, as an officer edits it.
 *
 * The member-facing half of this file was `checkIn(code)` and it is gone. The
 * Airtable form supersedes the rotating codes: a member picking a workshop from
 * a linked-record field is the same disambiguation the codes existed to
 * provide, without anybody reading a screen and typing.
 *
 * What remains is the correction path, which no capture method removes the need
 * for. Somebody's phone died, somebody arrived late, somebody's MyID was
 * refused. See `server/airtable/attendance.ts` for the import.
 */

/**
 * Officer roster edit: add or remove one member's attendance for a meeting.
 *
 * Allowed at any time, including after check-in has closed. Correcting a
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
