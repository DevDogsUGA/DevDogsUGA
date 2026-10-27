import { and, eq, sql } from "drizzle-orm";
import {
  addressesMatch,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  isMeetingEditable,
} from "~/lib/attendanceInvite";
import { db } from "~/server/db";
import {
  attendance,
  attendanceInvites,
  auditEvents,
  meetings,
  profiles,
} from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";

/**
 * Everything an officer does to a meeting's attendance from the console
 * (meeting detail, Q8, Q9, Q51, Q52). Callers have already checked
 * `canManageAttendance`; nothing here trusts a client-supplied actor.
 *
 * Writes only reach a meeting that has started and is neither cancelled nor
 * deleted (Q52), checked inside the transaction under a share lock so a
 * cancellation cannot land between the check and the write.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_REMOVAL_REASON = 500;

async function editableMeeting(
  tx: Tx,
  meetingId: string,
  now: Date,
): Promise<boolean> {
  const [meeting] = await tx
    .select({
      startsAt: meetings.startsAt,
      cancelledAt: meetings.cancelledAt,
      deletedAt: meetings.deletedAt,
    })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .for("share");
  return meeting !== undefined && isMeetingEditable(meeting, now);
}

export type Attendee =
  | { status: "account"; userId: string; name: string; email: string }
  | { status: "none"; email: string };

/** The account behind a UGA address, if one exists. */
export async function findAccountByEmail(email: string): Promise<Attendee> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({
      userId: usersInAuth.id,
      name: profiles.preferredName,
      email: usersInAuth.email,
    })
    .from(usersInAuth)
    .leftJoin(profiles, eq(profiles.userId, usersInAuth.id))
    .where(sql`lower(${usersInAuth.email}) = ${normalized}`)
    .limit(1);
  if (!row) return { status: "none", email: normalized };
  return {
    status: "account",
    userId: row.userId,
    name: row.name ?? normalized.split("@")[0]!,
    email: normalized,
  };
}

export type RecordOfficerResult =
  | { status: "recorded" | "duplicate"; attendanceId: string; recordedAt: Date }
  | { status: "invalid_meeting" };

/**
 * Records one officer-method attendance row and its audit event inside `tx`.
 * `actorUserId` is the officer; it is null when that officer's account has
 * been deleted since sending an invite, in which case the event is the
 * system's.
 */
async function recordOfficerRow(
  tx: Tx,
  input: {
    meetingId: string;
    userId: string;
    actorUserId: string | null;
    inviteId?: string;
  },
  now: Date,
): Promise<RecordOfficerResult> {
  if (!(await editableMeeting(tx, input.meetingId, now))) {
    return { status: "invalid_meeting" };
  }
  const [created] = await tx
    .insert(attendance)
    .values({
      meetingId: input.meetingId,
      userId: input.userId,
      method: "officer",
    })
    .onConflictDoNothing({ target: [attendance.meetingId, attendance.userId] })
    .returning({ id: attendance.id, recordedAt: attendance.recordedAt });

  if (created) {
    await tx.insert(auditEvents).values({
      actorType: input.actorUserId ? "user" : "system",
      actorUserId: input.actorUserId,
      source: "platform",
      action: "attendance.recorded",
      targetType: "attendance",
      targetId: created.id,
      correlationId: created.id,
      metadata: {
        meetingId: input.meetingId,
        method: "officer",
        userId: input.userId,
        ...(input.inviteId ? { inviteId: input.inviteId } : {}),
      },
    });
    return {
      status: "recorded",
      attendanceId: created.id,
      recordedAt: created.recordedAt,
    };
  }

  const [existing] = await tx
    .select({ id: attendance.id, recordedAt: attendance.recordedAt })
    .from(attendance)
    .where(
      and(
        eq(attendance.meetingId, input.meetingId),
        eq(attendance.userId, input.userId),
      ),
    );
  if (!existing) return { status: "invalid_meeting" };
  return {
    status: "duplicate",
    attendanceId: existing.id,
    recordedAt: existing.recordedAt,
  };
}

/** An officer adds a member who already has an account (Q8). */
export function addOfficerAttendance(
  officerId: string,
  meetingId: string,
  userId: string,
  now: Date = new Date(),
): Promise<RecordOfficerResult> {
  return db.transaction((tx) =>
    recordOfficerRow(tx, { meetingId, userId, actorUserId: officerId }, now),
  );
}

export type RemoveResult =
  | { status: "removed" }
  | { status: "not_found" }
  | { status: "invalid_meeting" };

/**
 * Removes one attendance row (Q9): a hard delete plus an `attendance.removed`
 * audit event holding what was deleted. Reflections and survey answers point
 * at the meeting, not the row, and stay.
 */
export function removeAttendance(
  officerId: string,
  meetingId: string,
  attendanceId: string,
  reason: string | null,
  now: Date = new Date(),
): Promise<RemoveResult> {
  const trimmed = reason?.trim() ?? "";
  return db.transaction(async (tx) => {
    if (!(await editableMeeting(tx, meetingId, now))) {
      return { status: "invalid_meeting" };
    }
    const [removed] = await tx
      .delete(attendance)
      .where(
        and(
          eq(attendance.id, attendanceId),
          eq(attendance.meetingId, meetingId),
        ),
      )
      .returning({
        userId: attendance.userId,
        method: attendance.method,
        recordedAt: attendance.recordedAt,
      });
    if (!removed) return { status: "not_found" };

    await tx.insert(auditEvents).values({
      actorType: "user",
      actorUserId: officerId,
      source: "platform",
      action: "attendance.removed",
      targetType: "attendance",
      targetId: attendanceId,
      metadata: {
        meetingId,
        userId: removed.userId,
        method: removed.method,
        recordedAt: removed.recordedAt.toISOString(),
        ...(trimmed ? { reason: trimmed.slice(0, MAX_REMOVAL_REASON) } : {}),
      },
    });
    return { status: "removed" };
  });
}

export type InviteResult =
  | {
      status: "invited";
      inviteId: string;
      token: string;
      expiresAt: Date;
    }
  | { status: "has_account" }
  | { status: "invalid_meeting" };

/**
 * Invites an address with no account (Q51). The single-use secret is returned
 * once, for the email; only its hash is stored. An address that already has an
 * unclaimed invite for this meeting gets that invite renewed rather than a
 * second row.
 */
export async function createAttendanceInvite(
  officerId: string,
  meetingId: string,
  email: string,
  now: Date = new Date(),
): Promise<InviteResult> {
  const address = email.trim().toLowerCase();
  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  return db.transaction(async (tx) => {
    if (!(await editableMeeting(tx, meetingId, now))) {
      return { status: "invalid_meeting" };
    }
    const [account] = await tx
      .select({ id: usersInAuth.id })
      .from(usersInAuth)
      .where(sql`lower(${usersInAuth.email}) = ${address}`)
      .limit(1);
    if (account) return { status: "has_account" };

    const expiresAt = inviteExpiry(now);
    const [invite] = await tx
      .insert(attendanceInvites)
      .values({
        meetingId,
        ugaEmail: address,
        tokenHash,
        createdBy: officerId,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [attendanceInvites.meetingId, attendanceInvites.ugaEmail],
        targetWhere: sql`"claimedAt" is null`,
        set: { tokenHash, createdBy: officerId, createdAt: now, expiresAt },
      })
      .returning({ id: attendanceInvites.id });
    return { status: "invited", inviteId: invite!.id, token, expiresAt };
  });
}

export type ResendResult =
  | {
      status: "resent";
      meetingId: string;
      ugaEmail: string;
      token: string;
      expiresAt: Date;
    }
  | { status: "not_found" };

/** Issues a fresh link for a pending invite; the old link stops working. */
export async function resendAttendanceInvite(
  meetingId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<ResendResult> {
  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  const expiresAt = inviteExpiry(now);
  const [invite] = await db
    .update(attendanceInvites)
    .set({ tokenHash, expiresAt })
    .where(
      and(
        eq(attendanceInvites.id, inviteId),
        eq(attendanceInvites.meetingId, meetingId),
        sql`${attendanceInvites.claimedAt} is null`,
      ),
    )
    .returning({ ugaEmail: attendanceInvites.ugaEmail });
  if (!invite) return { status: "not_found" };
  return {
    status: "resent",
    meetingId,
    ugaEmail: invite.ugaEmail,
    token,
    expiresAt,
  };
}

/** Cancels a pending invite: its link stops working and the row is gone. */
export async function cancelAttendanceInvite(
  meetingId: string,
  inviteId: string,
): Promise<boolean> {
  const rows = await db
    .delete(attendanceInvites)
    .where(
      and(
        eq(attendanceInvites.id, inviteId),
        eq(attendanceInvites.meetingId, meetingId),
        sql`${attendanceInvites.claimedAt} is null`,
      ),
    )
    .returning({ id: attendanceInvites.id });
  return rows.length > 0;
}

export type ClaimResult =
  | { status: "recorded" | "duplicate"; meetingId: string; recordedAt: Date }
  | {
      status:
        "invalid" | "used" | "expired" | "address_mismatch" | "invalid_meeting";
    };

/** Whether the token names an invite that could still be claimed. */
export async function isClaimableInvite(
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [invite] = await db
    .select({
      claimedAt: attendanceInvites.claimedAt,
      expiresAt: attendanceInvites.expiresAt,
    })
    .from(attendanceInvites)
    .where(eq(attendanceInvites.tokenHash, await hashInviteToken(token)));
  return invite !== undefined && inviteState(invite, now) === "pending";
}

/**
 * Claims an invite for the signed-in member (Q51). The address UGA SSO signed
 * them in with must equal the invited one, or nothing happens and the invite
 * stays usable. A claim records attendance (method officer, the inviting
 * officer as actor) and spends the invite in the same transaction, so the link
 * works once.
 */
export async function claimAttendanceInvite(
  token: string,
  userId: string,
  signedInEmail: string | null,
  now: Date = new Date(),
): Promise<ClaimResult> {
  const tokenHash = await hashInviteToken(token);
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(attendanceInvites)
      .where(eq(attendanceInvites.tokenHash, tokenHash))
      .for("update");
    if (!invite) return { status: "invalid" };
    const state = inviteState(invite, now);
    if (state === "claimed") return { status: "used" };
    if (state === "expired") return { status: "expired" };
    if (!addressesMatch(invite.ugaEmail, signedInEmail)) {
      return { status: "address_mismatch" };
    }

    const result = await recordOfficerRow(
      tx,
      {
        meetingId: invite.meetingId,
        userId,
        actorUserId: invite.createdBy,
        inviteId: invite.id,
      },
      now,
    );
    if (result.status === "invalid_meeting") return result;

    await tx
      .update(attendanceInvites)
      .set({ claimedAt: now, claimedBy: userId })
      .where(eq(attendanceInvites.id, invite.id));
    return {
      status: result.status,
      meetingId: invite.meetingId,
      recordedAt: result.recordedAt,
    };
  });
}

/**
 * Account deletion (Q168): an invite the member claimed goes with the account
 * through its `claimedBy` foreign key; the ones still pending for their
 * address have no member to cascade from, so the deletion job erases them
 * here, before the auth user goes.
 */
export async function eraseAttendanceInvitesForEmail(
  email: string,
): Promise<number> {
  const rows = await db
    .delete(attendanceInvites)
    .where(eq(attendanceInvites.ugaEmail, email.trim().toLowerCase()))
    .returning({ id: attendanceInvites.id });
  return rows.length;
}
