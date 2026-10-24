import {
  ACCOUNTS_QUERY,
  accountRowFrom,
  type ExistingCheckIn,
} from "@devdogsuga/events/imports";
import { and, desc, eq, isNull, lte, notInArray, sql } from "drizzle-orm";
import { isMeetingEditable } from "~/lib/attendanceInvite";
import { meetingTitle } from "~/lib/meetingTitle";
import { db } from "~/server/db";
import {
  attendance,
  auditEvents,
  meetings,
  profiles,
} from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";
import type {
  AttendanceWrite,
  AttendanceWriteResult,
  AuditDraft,
  ImportDeps,
  ImportMeeting,
  RosterWrite,
} from "./types";

/** The check-in method imports record; the CLI uses the same value. */
const IMPORT_METHOD = "import" as const;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Conn = Tx | typeof db;

/** Rows per insert: keeps a large roster far under Postgres's 65,535 parameters. */
const CHUNK = 1000;

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK)
    out.push(rows.slice(i, i + CHUNK));
  return out;
}

export function insertImportAudit(
  conn: Conn,
  audit: AuditDraft,
  outcome: Record<string, unknown> = {},
) {
  return conn.insert(auditEvents).values({
    actorType: "user",
    actorUserId: audit.actorUserId,
    source: "platform",
    action: audit.action,
    targetType: "import",
    targetId: audit.targetId,
    correlationId: audit.targetId,
    metadata: { ...audit.metadata, ...outcome },
  });
}

/**
 * The meetings an attendance import can target: started and not cancelled,
 * newest first. The same rule the write enforces (`isMeetingEditable`).
 */
export async function listImportableMeetings(
  now: Date = new Date(),
  limit = 80,
): Promise<{ id: string; title: string; startsAt: Date }[]> {
  const rows = await db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      startsAt: meetings.startsAt,
    })
    .from(meetings)
    .where(
      and(
        isNull(meetings.deletedAt),
        isNull(meetings.cancelledAt),
        lte(meetings.startsAt, now),
      ),
    )
    .orderBy(desc(meetings.startsAt), desc(meetings.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: meetingTitle(r),
    startsAt: r.startsAt,
  }));
}

async function loadMeeting(id: string): Promise<ImportMeeting | null> {
  const [row] = await db
    .select({
      id: meetings.id,
      nameOverride: meetings.nameOverride,
      startsAt: meetings.startsAt,
      cancelledAt: meetings.cancelledAt,
      deletedAt: meetings.deletedAt,
    })
    .from(meetings)
    .where(eq(meetings.id, id))
    .limit(1);
  return row
    ? {
        id: row.id,
        title: meetingTitle(row),
        startsAt: row.startsAt,
        cancelledAt: row.cancelledAt,
        deletedAt: row.deletedAt,
      }
    : null;
}

async function loadCheckIns(meetingId: string): Promise<ExistingCheckIn[]> {
  const rows = await db
    .select({ userId: attendance.userId, method: attendance.method })
    .from(attendance)
    .where(eq(attendance.meetingId, meetingId));
  return rows;
}

export async function writeAttendance(
  write: AttendanceWrite,
  audit: AuditDraft,
): Promise<AttendanceWriteResult> {
  // `notInArray(x, [])` matches every row: replacing with nobody would remove
  // every imported check-in. The callers never ask for that; refuse it here too.
  if (write.replace && write.userIds.length === 0) {
    throw new Error("A replace import needs at least one attendee");
  }
  return db.transaction(async (tx) => {
    // Share-locked so a cancellation cannot land between this check and the
    // writes below (the same rule as the console's other attendance writes).
    const [meeting] = await tx
      .select({
        startsAt: meetings.startsAt,
        cancelledAt: meetings.cancelledAt,
        deletedAt: meetings.deletedAt,
      })
      .from(meetings)
      .where(eq(meetings.id, write.meetingId))
      .for("share");
    if (!meeting || !isMeetingEditable(meeting, write.now)) {
      return { status: "invalid_meeting" };
    }

    for (const rows of chunks(write.profiles)) {
      await tx
        .insert(profiles)
        .values(
          rows.map((p) => ({
            userId: p.userId,
            preferredName: p.name,
            ugaEmail: p.email,
          })),
        )
        .onConflictDoNothing({ target: profiles.userId });
    }

    let removed = 0;
    if (write.replace) {
      const gone = await tx
        .delete(attendance)
        .where(
          and(
            eq(attendance.meetingId, write.meetingId),
            eq(attendance.method, IMPORT_METHOD),
            notInArray(attendance.userId, write.userIds),
          ),
        )
        .returning({ id: attendance.id });
      removed = gone.length;
    }

    let recorded = 0;
    for (const ids of chunks(write.userIds)) {
      const made = await tx
        .insert(attendance)
        .values(
          ids.map((userId) => ({
            meetingId: write.meetingId,
            userId,
            method: IMPORT_METHOD,
            recordedAt: write.recordedAt,
          })),
        )
        .onConflictDoNothing({
          target: [attendance.meetingId, attendance.userId],
        })
        .returning({ id: attendance.id });
      recorded += made.length;
    }

    await insertImportAudit(tx, audit, { recorded, removed });
    return { status: "written", recorded, removed };
  });
}

export async function writeRoster(
  write: RosterWrite,
  audit: AuditDraft,
): Promise<{ written: number; cleared: number }> {
  // As above: a snapshot of nobody would clear every member's verification.
  if (write.snapshot && write.members.length === 0) {
    throw new Error("A roster snapshot needs at least one member");
  }
  return db.transaction(async (tx) => {
    const at = new Date();
    for (const rows of chunks(write.members)) {
      await tx
        .insert(profiles)
        .values(
          rows.map((m) => ({
            userId: m.userId,
            // A new profile takes the roster's name; an existing one keeps
            // its own preferred name (the update below leaves it out).
            preferredName: `${m.firstName} ${m.lastName}`,
            involvementFirstName: m.firstName,
            involvementLastName: m.lastName,
            involvementImportedAt: at,
            ugaEmail: m.email,
            legalFirstName: m.firstName,
            legalLastName: m.lastName,
            identitySourcedAt: at,
          })),
        )
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            involvementFirstName: sql`excluded."involvementFirstName"`,
            involvementLastName: sql`excluded."involvementLastName"`,
            involvementImportedAt: sql`excluded."involvementImportedAt"`,
            ugaEmail: sql`excluded."ugaEmail"`,
            legalFirstName: sql`excluded."legalFirstName"`,
            legalLastName: sql`excluded."legalLastName"`,
            identitySourcedAt: sql`excluded."identitySourcedAt"`,
          },
        });
    }

    let cleared = 0;
    if (write.snapshot) {
      const ids = write.members.map((m) => m.userId);
      const dropped = await tx
        .update(profiles)
        .set({
          involvementFirstName: null,
          involvementLastName: null,
          involvementImportedAt: null,
        })
        .where(
          and(
            notInArray(profiles.userId, ids),
            sql`(${profiles.involvementFirstName} is not null or ${profiles.involvementImportedAt} is not null)`,
          ),
        )
        .returning({ userId: profiles.userId });
      cleared = dropped.length;
    }

    await insertImportAudit(tx, audit, {
      verified: write.members.length,
      cleared,
    });
    return { written: write.members.length, cleared };
  });
}

/** Creates a confirmed account with no invite email. Returns its id. */
async function createAccount(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "no user returned");
  }
  return data.user.id;
}

export const importDeps: ImportDeps = {
  async accounts() {
    const rows = await db.execute(sql.raw(ACCOUNTS_QUERY));
    return Array.from(rows as Iterable<Record<string, unknown>>).map(
      accountRowFrom,
    );
  },
  meeting: loadMeeting,
  checkIns: loadCheckIns,
  createAccount,
  writeAttendance,
  writeRoster,
  async audit(audit) {
    await insertImportAudit(db, audit);
  },
  now: () => new Date(),
};
