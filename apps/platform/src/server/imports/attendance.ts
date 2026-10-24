import {
  createAccounts,
  guessHeaderRow,
  ImportInputError,
  parseSheet,
  planAttendance,
  type AccountRow,
  type AttendancePlan,
  type SheetOptions,
} from "@devdogsuga/events/imports";
import { formatEventLongDate } from "~/lib/eventTime";
import type {
  ImportMapping,
  ImportPreview,
  ImportResult,
  InvalidRow,
  MappingField,
  SummaryLine,
} from "~/lib/imports";
import { fingerprintOf } from "./fingerprint";
import {
  auditFileName,
  capInvalid,
  sample,
  who,
  type Analysis,
} from "./shared";
import type {
  AuditDraft,
  ImportDeps,
  ImportMeeting,
  ImportRequest,
} from "./types";

export const ATTENDANCE_FIELDS: MappingField[] = [
  { key: "email", label: "UGA email column", required: true },
  { key: "name", label: "Name column (optional)", required: false },
];

/** Whether check-ins can be written to this meeting right now (Q52). */
export function meetingProblem(
  meeting: ImportMeeting | null,
  now: Date,
): string | null {
  if (!meeting || meeting.deletedAt) return "That meeting no longer exists.";
  if (meeting.cancelledAt) return `${meeting.title} was cancelled.`;
  if (meeting.startsAt > now) return `${meeting.title} has not started yet.`;
  return null;
}

/**
 * The picked columns as parser options. A pick that is not a header (the
 * preview labels a first-plus-last-name read "First Name + Last Name") means
 * "detect", and an empty name pick means "no name column".
 */
export function sheetOptions(
  text: string,
  mapping: Record<string, string>,
): SheetOptions {
  let headers: string[];
  try {
    headers = parseSheet(text).headers;
  } catch {
    headers = guessHeaderRow(text);
  }
  const has = (h: string | undefined): h is string =>
    !!h &&
    headers.some((x) => x.trim().toLowerCase() === h.trim().toLowerCase());
  return {
    emailColumn: has(mapping.email) ? mapping.email : undefined,
    nameColumn:
      "name" in mapping
        ? mapping.name === ""
          ? null
          : has(mapping.name)
            ? mapping.name
            : undefined
        : undefined,
  };
}

export interface AttendancePlanned {
  meeting: ImportMeeting;
  plan: AttendancePlan;
  accounts: AccountRow[];
  replace: boolean;
  invalidCount: number;
}

export async function analyzeAttendance(
  req: ImportRequest,
  deps: ImportDeps,
): Promise<Analysis<AttendancePlanned>> {
  if (!req.meetingId) throw new ImportInputError("Choose a meeting.");
  const meeting = await deps.meeting(req.meetingId);
  const now = deps.now();
  const problem = meetingProblem(meeting, now);
  if (problem || !meeting) {
    throw new ImportInputError(problem ?? "Choose a meeting.");
  }

  const sheet = parseSheet(req.text, sheetOptions(req.text, req.mapping));
  const replace = req.mode === "replace";
  const [accounts, checkIns] = await Promise.all([
    deps.accounts(),
    deps.checkIns(meeting.id),
  ]);
  const plan = planAttendance(sheet.attendees, accounts, checkIns, replace);

  const invalid: InvalidRow[] = [
    ...sheet.notUga.map((n) => ({
      line: n.line,
      value: n.email,
      reason: "Not a UGA (@uga.edu) address",
    })),
    ...sheet.missingEmail.map((line) => ({
      line,
      value: "",
      reason: "No email address in this row",
    })),
    ...plan.cannotCreate.map((a) => ({
      line: a.line,
      value: a.email,
      reason: "No account yet and no name in the file to create one with",
    })),
  ];

  const mapping: ImportMapping = {
    email: sheet.emailColumn,
    name: sheet.nameColumn,
  };
  const summary: SummaryLine[] = [
    { label: "To record (have an account)", count: plan.record.length },
    { label: "Accounts to create, then record", count: plan.create.length },
    {
      label: "Checked in themselves (left as is)",
      count: plan.checkedIn.length,
    },
    { label: "Imported before (left as is)", count: plan.imported.length },
  ];
  if (replace) {
    summary.push({
      label: "Imported before but not in this file, to remove",
      count: plan.remove.length,
      tone: "remove",
    });
  }
  const warnings: string[] = [];
  if (sheet.duplicates > 0) {
    warnings.push(
      `${sheet.duplicates} repeat ${sheet.duplicates === 1 ? "row" : "rows"} for an address already read, ignored.`,
    );
  }
  if (!sheet.emailColumn) {
    warnings.push(
      "The file has no header row, so every address found in its cells was read.",
    );
  }
  if (replace && invalid.length > 0 && plan.remove.length > 0) {
    warnings.push(
      "Some rows could not be read. Anyone only on those rows counts as absent and is removed.",
    );
  }

  const writes = plan.record.length + plan.create.length + plan.remove.length;
  let blocked: string | null = null;
  if (sheet.attendees.length === 0) {
    blocked = "The file has no valid UGA addresses to record.";
  } else if (writes === 0) {
    blocked = "Nothing to change: everyone in the file is already recorded.";
  }

  const preview: ImportPreview = {
    kind: "attendance",
    mode: req.mode,
    fileName: req.fileName,
    headers: sheet.headers,
    mappingFields: sheet.emailColumn ? ATTENDANCE_FIELDS : [],
    mapping,
    meeting: {
      id: meeting.id,
      title: meeting.title,
      when: formatEventLongDate(meeting.startsAt),
    },
    summary,
    samples: [
      ...sample(
        "To record",
        plan.record.map((m) => who(m.attendee)),
      ),
      ...sample("New accounts", plan.create.map(who)),
      ...sample(
        "To remove",
        plan.remove.map((r) => r.name),
      ),
    ],
    warnings,
    ...capInvalid(invalid),
    blocked,
    fingerprint: await fingerprintOf({
      kind: "attendance",
      mode: req.mode,
      meeting: meeting.id,
      mapping,
      record: plan.record.map((m) => m.userId).sort(),
      create: plan.create.map((a) => a.email).sort(),
      remove: plan.remove.map((r) => r.userId).sort(),
      checkedIn: plan.checkedIn.map((m) => m.userId).sort(),
      imported: plan.imported.map((m) => m.userId).sort(),
      invalid: invalid.map((r) => `${r.line}:${r.value}`).sort(),
    }),
  };
  return {
    preview,
    plan: { meeting, plan, accounts, replace, invalidCount: invalid.length },
  };
}

function result(
  req: ImportRequest,
  a: Analysis<AttendancePlanned>,
  status: ImportResult["status"],
  message: string,
  counts: SummaryLine[],
  failures: ImportResult["failures"],
): ImportResult {
  return {
    status,
    kind: "attendance",
    mode: req.mode,
    message,
    counts,
    failures,
    invalid: a.preview.invalid,
    invalidMore: a.preview.invalidMore,
  };
}

/**
 * Writes a confirmed attendance import (Q71, Q81).
 *
 * Accounts are created first, outside the transaction (Auth is another
 * service). In add mode the rows whose accounts were made carry on and the
 * failures are reported. In replace mode any failure stops the import before
 * the removal runs: the retry, using the whole file, finds the accounts that
 * were made (they match by sign-in address) rather than creating them again.
 */
export async function applyAttendance(
  req: ImportRequest,
  a: Analysis<AttendancePlanned>,
  actorUserId: string,
  deps: ImportDeps,
): Promise<ImportResult> {
  const { plan, meeting, accounts, replace } = a.plan;
  const { created, failed } = await createAccounts(
    plan.create.map((x) => x.email),
    deps.createAccount,
  );
  const failures = failed.map((f) => ({ email: f.email, reason: f.reason }));
  const targetId = crypto.randomUUID();
  const base = {
    mode: req.mode,
    meetingId: meeting.id,
    fileName: auditFileName(req.fileName),
    invalidRows: a.plan.invalidCount,
    accountsCreated: created.size,
    accountFailures: failures.length,
  };
  const draft = (extra: Record<string, unknown>): AuditDraft => ({
    actorUserId,
    action: "import.attendance",
    targetId,
    metadata: { ...base, ...extra },
  });

  if (replace && failures.length > 0) {
    await deps.audit(draft({ outcome: "stopped", recorded: 0, removed: 0 }));
    return result(
      req,
      a,
      "stopped",
      `${failures.length} ${failures.length === 1 ? "account" : "accounts"} could not be created, so nothing was replaced. Fix the problem and run the import again with the complete file; accounts that were made are reused.`,
      [{ label: "Accounts created", count: created.size }],
      failures,
    );
  }

  const byId = new Map(accounts.map((x) => [x.userId, x]));
  const everyone = [...plan.record, ...plan.checkedIn, ...plan.imported];
  const profiles = [
    ...plan.create.flatMap((x) => {
      const userId = created.get(x.email);
      return userId ? [{ userId, email: x.email, name: x.name! }] : [];
    }),
    // An account an earlier, interrupted run made has no profile yet.
    ...everyone.flatMap((m) =>
      byId.get(m.userId)?.hasProfile === false && m.attendee.name
        ? [{ userId: m.userId, email: m.attendee.email, name: m.attendee.name }]
        : [],
    ),
  ];
  const userIds = [
    ...everyone.map((m) => m.userId),
    ...plan.create.flatMap((x) => created.get(x.email) ?? []),
  ];

  const written = await deps.writeAttendance(
    {
      meetingId: meeting.id,
      recordedAt: meeting.startsAt,
      profiles,
      userIds,
      replace,
      now: deps.now(),
    },
    draft({ outcome: failures.length > 0 ? "partial" : "done" }),
  );
  if (written.status === "invalid_meeting") {
    // Accounts may have been made before the meeting went, so this is audited
    // like every other stop.
    await deps.audit(
      draft({ outcome: "stopped", reason: "meeting", recorded: 0, removed: 0 }),
    );
    return result(
      req,
      a,
      "stopped",
      "The meeting was cancelled or removed while the import ran. Nothing was recorded.",
      [{ label: "Accounts created", count: created.size }],
      failures,
    );
  }
  const counts: SummaryLine[] = [
    { label: "Check-ins recorded", count: written.recorded },
    { label: "Accounts created", count: created.size },
  ];
  if (replace) {
    counts.push({ label: "Check-ins removed", count: written.removed });
  }
  const partial = failures.length > 0 || a.plan.invalidCount > 0;
  return result(
    req,
    a,
    partial ? "partial" : "done",
    failures.length > 0
      ? `Recorded ${written.recorded}; ${failures.length} ${failures.length === 1 ? "account" : "accounts"} could not be created. Run the import again to record them.`
      : a.plan.invalidCount > 0
        ? `Recorded ${written.recorded}; ${a.plan.invalidCount} ${a.plan.invalidCount === 1 ? "row was" : "rows were"} skipped.`
        : `Recorded ${written.recorded} for ${meeting.title}.`,
    counts,
    failures,
  );
}
