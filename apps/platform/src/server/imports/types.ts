import type {
  AccountRow,
  CreateAccount,
  ExistingCheckIn,
} from "@devdogsuga/events/imports";
import type { ImportKind, ImportMode } from "~/lib/imports";

/** A meeting an attendance import can record into. */
export interface ImportMeeting {
  id: string;
  title: string;
  startsAt: Date;
  cancelledAt: Date | null;
  deletedAt: Date | null;
}

/** The audit row of one import, minus the outcome the write adds. */
export interface AuditDraft {
  actorUserId: string;
  action: "import.attendance" | "import.roster";
  /** Unique per import, so the audit log's idempotency index never merges two. */
  targetId: string;
  metadata: Record<string, unknown>;
}

export interface AttendanceWrite {
  meetingId: string;
  /** Stamped on every imported check-in: the file says who came, not when. */
  recordedAt: Date;
  /** Profiles for accounts that have none yet (just created, or recovered). */
  profiles: { userId: string; email: string; name: string }[];
  /** Everyone in the file with an account. */
  userIds: string[];
  /** Remove the meeting's imported check-ins for anyone not in `userIds`. */
  replace: boolean;
  now: Date;
}

export type AttendanceWriteResult =
  | { status: "written"; recorded: number; removed: number }
  /** The meeting was cancelled, removed or not started when the write ran. */
  | { status: "invalid_meeting" };

export interface RosterWrite {
  members: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
  }[];
  /** Clear verification from every profile not in `members`. */
  snapshot: boolean;
}

export interface ImportDeps {
  accounts(): Promise<AccountRow[]>;
  meeting(id: string): Promise<ImportMeeting | null>;
  checkIns(meetingId: string): Promise<ExistingCheckIn[]>;
  createAccount: CreateAccount;
  /** One transaction: the check-ins and the audit row, or neither. */
  writeAttendance(
    write: AttendanceWrite,
    audit: AuditDraft,
  ): Promise<AttendanceWriteResult>;
  /** One transaction: the profiles and the audit row, or neither. */
  writeRoster(
    write: RosterWrite,
    audit: AuditDraft,
  ): Promise<{ written: number; cleared: number }>;
  /** An import that wrote nothing (stopped, or every account failed). */
  audit(audit: AuditDraft): Promise<void>;
  now(): Date;
}

export interface ImportRequest {
  kind: ImportKind;
  mode: ImportMode;
  fileName: string;
  text: string;
  /** Empty means detect; a key holding "" means "none" for an optional field. */
  mapping: Record<string, string>;
  meetingId: string | null;
}
