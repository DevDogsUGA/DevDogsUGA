import {
  officerChangesTable,
  type AirtableClient,
  type OfficerChangeRow,
} from "@devdogsuga/airtable";
import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { canUserManageAttendance } from "~/server/actions/permissions";
import {
  airtableChangeReceipts,
  attendance,
  auditEvents,
  reflectionRevisions,
  reflections,
  teams,
} from "~/server/db/schema";
import { usersInAuth } from "~/supabase/drizzle/schema";
import { resolveUser } from "./memberIdentity";
import {
  officerChangeDigest,
  rawOfficerChangeDigest,
  InvalidOfficerChangeError,
  parseOfficerChangeActor,
  parseOfficerChangeRecord,
  type OfficerChangeActor,
  type OfficerChangeCommand,
} from "./officerChangeCommand";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReceiptStatus = "processing" | "applied" | "rejected" | "retryable";

interface Receipt {
  [key: string]: unknown;
  formResponseRecordId: string;
  status: ReceiptStatus;
  payloadDigest: string;
  targetType: string;
  targetId: string | null;
  auditEventId: string | null;
  processedAt: Date | null;
  error: string | null;
}

export interface ProcessOfficerChangeResult {
  status: "applied" | "already_applied" | "rejected";
  auditEventId: string | null;
  error: string | null;
}

export class OfficerChangeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficerChangeRejectedError";
  }
}

/**
 * Fetch, pin, apply, audit, and acknowledge one Airtable form response.
 * Airtable status is written last: a failed write makes the automation retry,
 * while the applied receipt prevents that retry from mutating Postgres twice.
 */
export async function processOfficerChange(
  client: AirtableClient,
  formResponseRecordId: string,
): Promise<ProcessOfficerChangeResult> {
  const record = await client.getRecord(
    officerChangesTable.id,
    formResponseRecordId,
  );
  let command: OfficerChangeCommand;
  let actor: OfficerChangeActor;
  try {
    command = parseOfficerChangeRecord(record);
    actor = parseOfficerChangeActor(record);
  } catch (error) {
    if (!(error instanceof InvalidOfficerChangeError)) throw error;
    return rejectInvalidRecord(
      client,
      formResponseRecordId,
      await rawOfficerChangeDigest(record),
      error.message,
    );
  }
  const digest = await officerChangeDigest(command);
  const target = commandTarget(command);

  await db
    .insert(airtableChangeReceipts)
    .values({
      formResponseRecordId,
      payload: command,
      payloadDigest: digest,
      targetType: target.type,
      targetId: target.id,
    })
    .onConflictDoNothing();

  const existing = await readReceipt(formResponseRecordId);
  if (!existing) throw new Error("Officer change receipt was not created.");
  if (existing.payloadDigest !== digest) {
    const error = "This form response changed after its first delivery.";
    await writeAirtableStatus(client, formResponseRecordId, {
      formResponseRecordId,
      status: "Rejected",
      processedAt: new Date().toISOString(),
      auditEventId: existing.auditEventId,
      error,
    });
    return { status: "rejected", auditEventId: existing.auditEventId, error };
  }

  if (existing.status === "applied") {
    await writeAirtableStatus(
      client,
      formResponseRecordId,
      projection(existing),
    );
    return {
      status: "already_applied",
      auditEventId: existing.auditEventId,
      error: null,
    };
  }
  if (existing.status === "rejected") {
    await writeAirtableStatus(
      client,
      formResponseRecordId,
      projection(existing),
    );
    return {
      status: "rejected",
      auditEventId: existing.auditEventId,
      error: existing.error,
    };
  }

  try {
    const actorUserId = await resolveActorUserId(actor);
    if (!(await canUserManageAttendance(actorUserId))) {
      throw new OfficerChangeRejectedError(
        "The Airtable submitter is not authorized to apply officer corrections.",
      );
    }
    const memberUserId = await resolveCommandMember(command);
    const applied = await db.transaction(async (tx) => {
      const locked = await lockReceipt(tx, formResponseRecordId);
      if (!locked) throw new Error("Officer change receipt disappeared.");
      if (locked.status === "applied") return locked;
      if (locked.status === "rejected") return locked;

      const event = await applyCommand(tx, {
        command,
        actor,
        actorUserId,
        memberUserId,
        correlationId: formResponseRecordId,
      });
      const [receipt] = await tx
        .update(airtableChangeReceipts)
        .set({
          status: "applied",
          targetId: event.targetId,
          auditEventId: event.id,
          processedAt: new Date(),
          error: null,
          updatedAt: new Date(),
        })
        .where(
          eq(airtableChangeReceipts.formResponseRecordId, formResponseRecordId),
        )
        .returning(receiptColumns);
      if (!receipt) throw new Error("Officer change receipt was not updated.");
      return receipt as Receipt;
    });

    await writeAirtableStatus(
      client,
      formResponseRecordId,
      projection(applied),
    );
    return {
      status: applied.status === "applied" ? "applied" : "rejected",
      auditEventId: applied.auditEventId,
      error: applied.error,
    };
  } catch (error) {
    if (!(error instanceof OfficerChangeRejectedError)) {
      await markRetryable(formResponseRecordId, safeError(error));
      throw error;
    }
    const message = error.message;
    const rejected = await markRejected(formResponseRecordId, message);
    await writeAirtableStatus(
      client,
      formResponseRecordId,
      projection(rejected),
    );
    return { status: "rejected", auditEventId: null, error: message };
  }
}

async function rejectInvalidRecord(
  client: AirtableClient,
  formResponseRecordId: string,
  digest: string,
  error: string,
): Promise<ProcessOfficerChangeResult> {
  await db
    .insert(airtableChangeReceipts)
    .values({
      formResponseRecordId,
      payload: { invalid: true },
      payloadDigest: digest,
      targetType: "invalid_command",
    })
    .onConflictDoNothing();
  const existing = await readReceipt(formResponseRecordId);
  if (!existing)
    throw new Error("Invalid officer change receipt was not created.");

  if (existing.payloadDigest !== digest) {
    const altered = "This form response changed after its first delivery.";
    await writeAirtableStatus(client, formResponseRecordId, {
      formResponseRecordId,
      status: "Rejected",
      processedAt: new Date().toISOString(),
      auditEventId: existing.auditEventId,
      error: altered,
    });
    return {
      status: "rejected",
      auditEventId: existing.auditEventId,
      error: altered,
    };
  }

  const receipt =
    existing.status === "processing" || existing.status === "retryable"
      ? await markRejected(formResponseRecordId, error)
      : existing;
  await writeAirtableStatus(client, formResponseRecordId, projection(receipt));
  return {
    status: receipt.status === "applied" ? "already_applied" : "rejected",
    auditEventId: receipt.auditEventId,
    error: receipt.error,
  };
}

const receiptColumns = {
  formResponseRecordId: airtableChangeReceipts.formResponseRecordId,
  status: airtableChangeReceipts.status,
  payloadDigest: airtableChangeReceipts.payloadDigest,
  targetType: airtableChangeReceipts.targetType,
  targetId: airtableChangeReceipts.targetId,
  auditEventId: airtableChangeReceipts.auditEventId,
  processedAt: airtableChangeReceipts.processedAt,
  error: airtableChangeReceipts.error,
};

async function readReceipt(id: string): Promise<Receipt | undefined> {
  const [row] = await db
    .select(receiptColumns)
    .from(airtableChangeReceipts)
    .where(eq(airtableChangeReceipts.formResponseRecordId, id))
    .limit(1);
  return row as Receipt | undefined;
}

async function lockReceipt(tx: Tx, id: string): Promise<Receipt | undefined> {
  const rows = await tx.execute<Receipt>(sql`
    select "formResponseRecordId", "status", "payloadDigest", "targetType",
           "targetId", "auditEventId", "processedAt", "error"
    from platform."airtableChangeReceipts"
    where "formResponseRecordId" = ${id}
    for update
  `);
  return rows[0];
}

async function resolveActorUserId(actor: OfficerChangeActor): Promise<string> {
  const [user] = await db
    .select({ id: usersInAuth.id })
    .from(usersInAuth)
    .where(eq(usersInAuth.email, actor.email))
    .limit(1);
  if (!user) {
    throw new OfficerChangeRejectedError(
      "The Airtable submitter does not have a DevDogs Platform account.",
    );
  }
  return user.id;
}

async function resolveCommandMember(
  command: OfficerChangeCommand,
): Promise<string | null> {
  if (!("member" in command) || command.member === undefined) return null;
  const resolved = await resolveUser(command.member);
  if (!resolved) {
    throw new Error("The member account could not be resolved.");
  }
  return resolved.userId;
}

async function applyCommand(
  tx: Tx,
  input: {
    command: OfficerChangeCommand;
    actor: OfficerChangeActor;
    actorUserId: string;
    memberUserId: string | null;
    correlationId: string;
  },
): Promise<{ id: string; targetId: string }> {
  const { command } = input;
  if (command.kind === "attendance") return applyAttendance(tx, input);
  if (command.kind === "competition_participation")
    return applyParticipation(tx, input);
  return applyReflection(tx, input);
}

async function applyAttendance(
  tx: Tx,
  input: Parameters<typeof applyCommand>[1],
): Promise<{ id: string; targetId: string }> {
  const command = input.command;
  if (command.kind !== "attendance") throw new Error("Invalid command kind.");

  let attendanceId: string;
  let action: string;
  if (command.action === "add") {
    if (!input.memberUserId) throw new Error("Member was not resolved.");
    const meetings = await tx.execute<{ id: string }>(sql`
      select id from platform.meetings
      where id = ${command.meetingId}::uuid and "deletedAt" is null
      for share
    `);
    if (!meetings[0])
      throw new OfficerChangeRejectedError("The meeting does not exist.");

    const [created] = await tx
      .insert(attendance)
      .values({
        meetingId: command.meetingId,
        userId: input.memberUserId,
        method: "officer",
        recordedBy: input.actorUserId,
      })
      .onConflictDoNothing({
        target: [attendance.meetingId, attendance.userId],
      })
      .returning({ id: attendance.id });
    if (created) {
      attendanceId = created.id;
      action = "attendance.added";
    } else {
      const rows = await tx.execute<{ id: string; revokedAt: Date | null }>(sql`
        select id, "revokedAt" from platform.attendance
        where "meetingId" = ${command.meetingId}::uuid
          and "userId" = ${input.memberUserId}::uuid
        for update
      `);
      const existing = rows[0];
      if (!existing) throw new Error("Attendance conflict could not be read.");
      attendanceId = existing.id;
      if (existing.revokedAt === null) {
        action = "attendance.added";
      } else {
        await tx
          .update(attendance)
          .set({
            revokedAt: null,
            revokedBy: null,
            revocationReason: null,
            method: "officer",
            recordedBy: input.actorUserId,
          })
          .where(eq(attendance.id, attendanceId));
        action = "attendance.restored";
      }
    }
  } else {
    const rows = await tx.execute<{ id: string; revokedAt: Date | null }>(sql`
      select id, "revokedAt" from platform.attendance
      where id = ${command.attendanceId}::uuid for update
    `);
    if (!rows[0])
      throw new OfficerChangeRejectedError(
        "The attendance record does not exist.",
      );
    attendanceId = rows[0].id;
    action = `attendance.${command.action}d`;
    await tx
      .update(attendance)
      .set(
        command.action === "revoke"
          ? {
              revokedAt: new Date(),
              revokedBy: input.actorUserId,
              revocationReason: command.reason,
            }
          : { revokedAt: null, revokedBy: null, revocationReason: null },
      )
      .where(eq(attendance.id, attendanceId));
  }

  return insertAudit(tx, input, action, "attendance", attendanceId, {
    reason: command.reason,
  });
}

async function applyParticipation(
  tx: Tx,
  input: Parameters<typeof applyCommand>[1],
): Promise<{ id: string; targetId: string }> {
  const command = input.command;
  if (command.kind !== "competition_participation")
    throw new Error("Invalid command kind.");
  const rows = await tx.execute<{
    id: string;
    participationOverride: boolean | null;
  }>(sql`
    select id, "participationOverride"
    from platform.teams where id = ${command.teamId}::uuid for update
  `);
  const team = rows[0];
  if (!team) throw new OfficerChangeRejectedError("The team does not exist.");
  const value =
    command.action === "grant"
      ? true
      : command.action === "revoke"
        ? false
        : null;
  await tx
    .update(teams)
    .set(
      value === null
        ? {
            participationOverride: null,
            participationOverrideAt: null,
            participationOverrideBy: null,
            participationOverrideReason: null,
          }
        : {
            participationOverride: value,
            participationOverrideAt: new Date(),
            participationOverrideBy: input.actorUserId,
            participationOverrideReason: command.reason,
          },
    )
    .where(eq(teams.id, team.id));

  return insertAudit(
    tx,
    input,
    `competition_participation.${command.action}`,
    "team",
    team.id,
    {
      before: team.participationOverride,
      after: value,
      reason: command.reason,
    },
  );
}

async function applyReflection(
  tx: Tx,
  input: Parameters<typeof applyCommand>[1],
): Promise<{ id: string; targetId: string }> {
  const command = input.command;
  if (command.kind !== "reflection") throw new Error("Invalid command kind.");
  const rows = await tx.execute<{
    id: string;
    userId: string;
    meetingId: string | null;
    competitionId: string | null;
    content: string;
    submittedAt: Date | null;
  }>(sql`
    select id, "userId", "meetingId", "competitionId", content, "submittedAt"
    from platform.reflections where id = ${command.reflectionId}::uuid for update
  `);
  const current = rows[0];
  if (!current)
    throw new OfficerChangeRejectedError("The reflection does not exist.");

  const next = {
    userId: input.memberUserId ?? current.userId,
    meetingId:
      command.meetingId ??
      (command.competitionId !== undefined ? null : current.meetingId),
    competitionId:
      command.competitionId ??
      (command.meetingId !== undefined ? null : current.competitionId),
    content: command.content ?? current.content,
    submittedAt:
      command.submitted === undefined
        ? current.submittedAt
        : command.submitted
          ? (current.submittedAt ?? new Date())
          : null,
  };
  const changed =
    next.userId !== current.userId ||
    next.meetingId !== current.meetingId ||
    next.competitionId !== current.competitionId ||
    next.content !== current.content ||
    next.submittedAt?.getTime() !== current.submittedAt?.getTime();
  if (!changed)
    throw new OfficerChangeRejectedError(
      "The reflection already has those values.",
    );

  const [before] = await tx
    .insert(reflectionRevisions)
    .values({
      reflectionId: current.id,
      userId: current.userId,
      meetingId: current.meetingId,
      competitionId: current.competitionId,
      content: current.content,
      submittedAt: current.submittedAt,
      createdByAirtableUserId: input.actor.airtableUserId,
      changeReason: command.reason,
    })
    .returning({ id: reflectionRevisions.id });
  await tx
    .update(reflections)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(reflections.id, current.id));
  const [after] = await tx
    .insert(reflectionRevisions)
    .values({
      reflectionId: current.id,
      ...next,
      createdByAirtableUserId: input.actor.airtableUserId,
      changeReason: command.reason,
    })
    .returning({ id: reflectionRevisions.id });
  if (!before || !after)
    throw new Error("Reflection revisions were not created.");

  return insertAudit(
    tx,
    input,
    "reflection.edited",
    "reflection",
    current.id,
    { reason: command.reason, changedFields: reflectionChangedFields(command) },
    before.id,
    after.id,
  );
}

async function insertAudit(
  tx: Tx,
  input: Parameters<typeof applyCommand>[1],
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
  beforeReflectionRevisionId?: string,
  afterReflectionRevisionId?: string,
): Promise<{ id: string; targetId: string }> {
  const [event] = await tx
    .insert(auditEvents)
    .values({
      actorType: "airtable_collaborator",
      actorAirtableUserId: input.actor.airtableUserId,
      actorAirtableDisplayName: input.actor.displayName,
      source: "airtable_form",
      action,
      targetType,
      targetId,
      correlationId: input.correlationId,
      metadata,
      beforeReflectionRevisionId,
      afterReflectionRevisionId,
    })
    .returning({ id: auditEvents.id });
  if (!event) throw new Error("Audit event was not created.");
  return { id: event.id, targetId };
}

function commandTarget(command: OfficerChangeCommand): {
  type: string;
  id: string | null;
} {
  if (command.kind === "attendance")
    return {
      type: "attendance",
      id: command.action === "add" ? null : command.attendanceId,
    };
  if (command.kind === "competition_participation")
    return { type: "team", id: command.teamId };
  return { type: "reflection", id: command.reflectionId };
}

function reflectionChangedFields(command: OfficerChangeCommand): string[] {
  if (command.kind !== "reflection") return [];
  return [
    "content",
    "submitted",
    "member",
    "meetingId",
    "competitionId",
  ].filter((field) => command[field as keyof typeof command] !== undefined);
}

function projection(receipt: Receipt): OfficerChangeRow {
  return {
    formResponseRecordId: receipt.formResponseRecordId,
    status:
      receipt.status === "applied"
        ? "Applied"
        : receipt.status === "rejected"
          ? "Rejected"
          : receipt.status === "retryable"
            ? "Retryable"
            : "Pending",
    processedAt: receipt.processedAt?.toISOString() ?? null,
    auditEventId: receipt.auditEventId,
    error: receipt.error,
  };
}

async function writeAirtableStatus(
  client: AirtableClient,
  recordId: string,
  row: OfficerChangeRow,
): Promise<void> {
  const f = officerChangesTable.fields;
  await client.updateRecords(officerChangesTable.id, [
    {
      id: recordId,
      fields: {
        [f.formResponseRecordId.id]: row.formResponseRecordId,
        [f.status.id]: row.status,
        [f.processedAt.id]: row.processedAt,
        [f.auditEventId.id]: row.auditEventId,
        [f.error.id]: row.error,
      },
    },
  ]);
}

async function markRejected(id: string, error: string): Promise<Receipt> {
  const [row] = await db
    .update(airtableChangeReceipts)
    .set({
      status: "rejected",
      processedAt: new Date(),
      error,
      updatedAt: new Date(),
    })
    .where(eq(airtableChangeReceipts.formResponseRecordId, id))
    .returning(receiptColumns);
  if (!row) throw new Error("Rejected receipt could not be updated.");
  return row as Receipt;
}

async function markRetryable(id: string, error: string): Promise<void> {
  await db
    .update(airtableChangeReceipts)
    .set({ status: "retryable", error, updatedAt: new Date() })
    .where(eq(airtableChangeReceipts.formResponseRecordId, id));
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/\s+/g, " ").slice(0, 1000);
}
