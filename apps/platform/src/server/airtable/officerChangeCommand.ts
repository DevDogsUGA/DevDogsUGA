import {
  officerChangesTable,
  type AirtableRecord,
  type AirtableValue,
} from "@devdogsuga/airtable";
import { z } from "zod";
import { myIdToEmail } from "./memberIdentity";

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(500);

const attendanceCommand = z.discriminatedUnion("action", [
  z.object({
    kind: z.literal("attendance"),
    action: z.literal("add"),
    meetingId: uuid,
    member: z.string(),
    reason,
  }),
  z.object({
    kind: z.literal("attendance"),
    action: z.enum(["revoke", "restore"]),
    attendanceId: uuid,
    reason,
  }),
]);

const participationCommand = z.object({
  kind: z.literal("competition_participation"),
  action: z.enum(["grant", "revoke", "clear"]),
  teamId: uuid,
  reason,
});

const reflectionCommand = z
  .object({
    kind: z.literal("reflection"),
    action: z.literal("edit"),
    reflectionId: uuid,
    reason,
    content: z.string().max(12_000).optional(),
    submitted: z.boolean().optional(),
    member: z.string().optional(),
    meetingId: uuid.optional(),
    competitionId: uuid.optional(),
  })
  .superRefine((value, context) => {
    const changes = [
      value.content !== undefined,
      value.submitted !== undefined,
      value.member !== undefined,
      value.meetingId !== undefined,
      value.competitionId !== undefined,
    ].filter(Boolean).length;
    if (changes === 0) {
      context.addIssue({
        code: "custom",
        message: "A reflection edit must change at least one field.",
      });
    }
    if (value.meetingId !== undefined && value.competitionId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A reflection can be assigned to only one activity.",
      });
    }
  });

const commandSchema = z.union([
  attendanceCommand,
  participationCommand,
  reflectionCommand,
]);

export type OfficerChangeCommand = z.infer<typeof commandSchema>;

export interface OfficerChangeActor {
  airtableUserId: string;
  displayName: string | null;
  email: string;
}

export class InvalidOfficerChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOfficerChangeError";
  }
}

function text(value: AirtableValue): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export function parseOfficerChangeActor(
  record: AirtableRecord,
): OfficerChangeActor {
  const value = record.fields[officerChangesTable.fields.createdBy.id];
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string"
  ) {
    throw new InvalidOfficerChangeError(
      "The response has no attributable Airtable submitter.",
    );
  }
  const email = myIdToEmail(value.email);
  if (email === null) {
    throw new InvalidOfficerChangeError(
      "The Airtable submitter must use a UGA email address.",
    );
  }
  return {
    airtableUserId: value.id,
    displayName:
      typeof value.name === "string" && value.name.trim() !== ""
        ? value.name.trim()
        : null,
    email,
  };
}

/** Maps one immutable Airtable form response into the normalized boundary. */
export function parseOfficerChangeRecord(
  record: AirtableRecord,
): OfficerChangeCommand {
  const fields = record.fields;
  const spec = officerChangesTable.fields;
  const command = text(fields[spec.command.id]);
  const targetId = text(fields[spec.targetId.id]);
  const reasonValue = text(fields[spec.reason.id]);
  const member = text(fields[spec.member.id]);
  const meetingId = text(fields[spec.meetingId.id]);

  const common = { reason: reasonValue };
  // Runtime Airtable values are strings even though the registry narrows the
  // configured choices, so unknown/renamed choices must reach the refusal.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (command) {
    case "Add attendance":
      return normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId,
        member,
        ...common,
      });
    case "Revoke attendance":
    case "Restore attendance":
      return normalizeOfficerChange({
        kind: "attendance",
        action: command === "Revoke attendance" ? "revoke" : "restore",
        attendanceId: targetId,
        ...common,
      });
    case "Grant competition participation":
    case "Revoke competition participation":
    case "Clear competition participation override":
      return normalizeOfficerChange({
        kind: "competition_participation",
        action:
          command === "Grant competition participation"
            ? "grant"
            : command === "Revoke competition participation"
              ? "revoke"
              : "clear",
        teamId: targetId,
        ...common,
      });
    case "Edit reflection": {
      const state = text(fields[spec.reflectionState.id]);
      const replacementContent = text(fields[spec.reflectionContent.id]);
      const clearContent = fields[spec.clearReflectionContent.id] === true;
      if (clearContent && replacementContent !== undefined) {
        throw new InvalidOfficerChangeError(
          "Choose replacement reflection content or clear it, not both.",
        );
      }
      return normalizeOfficerChange({
        kind: "reflection",
        action: "edit",
        reflectionId: targetId,
        content: clearContent ? "" : replacementContent,
        submitted:
          state === "Submitted" ? true : state === "Draft" ? false : undefined,
        member: text(fields[spec.newMember.id]),
        meetingId: text(fields[spec.newMeetingId.id]),
        competitionId: text(fields[spec.newCompetitionId.id]),
        ...common,
      });
    }
    default:
      throw new InvalidOfficerChangeError("Command is required.");
  }
}

/**
 * Converts a form-shaped value into the only command representation receipts
 * and mutations accept. Member identities are normalized to a full UGA email
 * here so retries cannot disagree over casing or whether an officer typed the
 * domain.
 */
export function normalizeOfficerChange(input: unknown): OfficerChangeCommand {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidOfficerChangeError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const command = parsed.data;
  if ("member" in command && command.member !== undefined) {
    const email = myIdToEmail(command.member);
    if (email === null) {
      throw new InvalidOfficerChangeError(
        "Member must be a valid UGA MyID or uga.edu address.",
      );
    }
    return { ...command, member: email };
  }
  return command;
}

/** Stable SHA-256 used to pin a receipt to its first normalized payload. */
export async function officerChangeDigest(
  command: OfficerChangeCommand,
): Promise<string> {
  return sha256(JSON.stringify(command));
}

/** Pins an invalid response too, without storing its potentially sensitive text. */
export async function rawOfficerChangeDigest(
  record: AirtableRecord,
): Promise<string> {
  const fields = officerChangesTable.fields;
  const values = [
    fields.command,
    fields.targetId,
    fields.member,
    fields.meetingId,
    fields.reason,
    fields.createdBy,
    fields.reflectionContent,
    fields.clearReflectionContent,
    fields.reflectionState,
    fields.newMember,
    fields.newMeetingId,
    fields.newCompetitionId,
  ].map((fieldSpec) => canonicalValue(record.fields[fieldSpec.id]));
  return sha256(JSON.stringify(values));
}

function canonicalValue(value: AirtableValue): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested as AirtableValue)]),
    );
  }
  return value ?? null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
