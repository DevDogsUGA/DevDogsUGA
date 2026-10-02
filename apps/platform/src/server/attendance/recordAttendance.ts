import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { attendance, auditEvents } from "~/server/db/schema";

export type MemberCheckInMethod = "qr" | "manual_code";

export type RecordAttendanceResult =
  | { status: "recorded" | "duplicate"; attendanceId: string; recordedAt: Date }
  | { status: "invalid_meeting" };

/**
 * Apply one validated member check-in atomically.
 *
 * The challenge's clock is deliberately absent here: once a rotating code has
 * been validated, meeting time does not decide whether attendance counts.
 *
 * Every meeting records attendance, including ones that don't count for
 * credit (build sessions): `countsForCredit` decides stars, streaks and EL
 * eligibility, each of which filters on it where it reads attendance
 * (`memberStars`, the streak loader, reflections), not whether a member was
 * in the room -- and the check-in survey follows that record.
 */
export async function recordMemberAttendance(
  meetingId: string,
  userId: string,
  method: MemberCheckInMethod,
): Promise<RecordAttendanceResult> {
  return db.transaction(async (tx) => {
    const meetingRows = await tx.execute<{
      id: string;
      cancelledAt: Date | null;
    }>(
      sql`select "id", "cancelledAt"
          from platform.meetings
          where "id" = ${meetingId}::uuid and "deletedAt" is null
          for share`,
    );
    const meeting = meetingRows[0];
    if (meeting?.cancelledAt !== null) {
      return { status: "invalid_meeting" };
    }

    const [created] = await tx
      .insert(attendance)
      .values({ meetingId, userId, method })
      .onConflictDoNothing({
        target: [attendance.meetingId, attendance.userId],
      })
      .returning({
        id: attendance.id,
        recordedAt: attendance.recordedAt,
      });

    if (created) {
      await tx.insert(auditEvents).values({
        actorType: "user",
        actorUserId: userId,
        source: method,
        action: "attendance.recorded",
        targetType: "attendance",
        targetId: created.id,
        correlationId: created.id,
        metadata: { meetingId, method },
      });
      return {
        status: "recorded",
        attendanceId: created.id,
        recordedAt: created.recordedAt,
      };
    }

    const [existing] = await tx
      .select({
        id: attendance.id,
        recordedAt: attendance.recordedAt,
      })
      .from(attendance)
      .where(
        and(eq(attendance.meetingId, meetingId), eq(attendance.userId, userId)),
      )
      .limit(1);

    // The unique conflict guarantees a row. Keep a defensive fallback in case
    // a future command deletes one inside the same transaction boundary.
    if (!existing) return { status: "invalid_meeting" };
    return {
      status: "duplicate",
      attendanceId: existing.id,
      recordedAt: existing.recordedAt,
    };
  });
}
