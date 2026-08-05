/**
 * The rules that make this a sync rather than a mirror.
 *
 * Airtable is the CMS, so the default answer to "the officer changed this" is
 * "then change it here too". These are the exceptions — the edits the platform
 * refuses because applying them would rewrite something already earned or
 * already published.
 *
 * Pure on purpose. Each rule takes the facts it needs and returns a reason,
 * with no database and no Airtable client anywhere near it, because these are
 * the rules that most need a test each and the least need a fixture base to
 * test against.
 */

/** What the sync refused, and why, in words an officer can act on. */
export interface Refusal {
  table: "meetings" | "workshops" | "competitions";
  airtableRecordId: string;
  /** Machine-readable, for the console and for tests. */
  code: RefusalCode;
  /** Written verbatim into the record's `Sync status` field. */
  message: string;
}

export type RefusalCode =
  | "workshop_meeting_changed"
  | "workshop_project_changed"
  | "requirement_count_after_finalize"
  | "judging_before_workshop"
  | "judging_moved_after_freeze";

/**
 * A refusal is per FIELD, not per record.
 *
 * An officer who fixes a project link and a max team size in the same edit
 * should get the team size change applied and a complaint about the project —
 * not silence on both. So each rule names the field it rejects, and the caller
 * drops exactly those keys from the update.
 */
export interface RuleResult {
  refusals: Refusal[];
  /** Field names the caller must not write. */
  rejectedFields: Set<string>;
}

function empty(): RuleResult {
  return { refusals: [], rejectedFields: new Set() };
}

// ── Workshops ────────────────────────────────────────────────────────────────

export interface WorkshopFacts {
  airtableRecordId: string;
  /** Attendance rows already pointing at this workshop. */
  attendanceCount: number;
  currentMeetingId: string;
  currentProjectId: string;
}

export interface WorkshopIncoming {
  meetingId: string | null;
  projectId: string | null;
}

/**
 * A workshop with attendance rejects destructive edits.
 *
 * Changing its meeting or its project silently re-attributes credit people
 * have already earned: every attendance row hanging off this workshop would
 * start counting toward a different session, or toward a different project's
 * star, without anybody being told.
 *
 * Note that this is not "the workshop is frozen" — a workshop with no
 * attendance yet is still fully editable, which covers the ordinary case of an
 * officer fixing a link they got wrong when they created the row.
 *
 * A null incoming value is NOT a change. An officer fills Airtable fields one
 * at a time and a sync landing between two keystrokes must not refuse a row
 * that will be complete thirty seconds later — the same reasoning that keeps
 * `judgingStartsAt` and `judgingMeetingId` unconstrained against each other.
 */
export function checkWorkshop(
  facts: WorkshopFacts,
  incoming: WorkshopIncoming,
): RuleResult {
  if (facts.attendanceCount === 0) return empty();

  const result = empty();

  if (
    incoming.meetingId !== null &&
    incoming.meetingId !== facts.currentMeetingId
  ) {
    result.rejectedFields.add("meetingId");
    result.refusals.push({
      table: "workshops",
      airtableRecordId: facts.airtableRecordId,
      code: "workshop_meeting_changed",
      message:
        `Refused: this workshop has ${facts.attendanceCount} attendance ` +
        "record(s), so its Meeting cannot be changed — doing so would move " +
        "credit people already earned onto a different meeting. Create a new " +
        "workshop row instead, or ask an officer to correct the attendance " +
        "first.",
    });
  }

  if (
    incoming.projectId !== null &&
    incoming.projectId !== facts.currentProjectId
  ) {
    result.rejectedFields.add("projectId");
    result.refusals.push({
      table: "workshops",
      airtableRecordId: facts.airtableRecordId,
      code: "workshop_project_changed",
      message:
        `Refused: this workshop has ${facts.attendanceCount} attendance ` +
        "record(s), so its Project cannot be changed — doing so would " +
        "re-attribute those check-ins to a different project. Create a new " +
        "workshop row instead.",
    });
  }

  return result;
}

// ── Competitions ─────────────────────────────────────────────────────────────

export interface CompetitionFacts {
  airtableRecordId: string;
  /** True once standings have been written — the arithmetic is published. */
  isFinalized: boolean;
  /** True once `competedAt` has been stamped on any team. */
  participationFrozen: boolean;
  currentRequirementCount: number | null;
  currentJudgingStartsAt: Date | null;
  /** `startsAt` of the opening workshop's meeting. */
  workshopMeetingStartsAt: Date | null;
}

export interface CompetitionIncoming {
  requirementCount: number | null;
  judgingStartsAt: Date | null;
}

/**
 * Two rules: one protecting published results, one protecting the entry state
 * machine.
 */
export function checkCompetition(
  facts: CompetitionFacts,
  incoming: CompetitionIncoming,
): RuleResult {
  const result = empty();

  // A finalized competition rejects edits to `requirementCount`.
  //
  // It is the denominator of the requirement score. Changing it after a winner
  // is announced rewrites arithmetic that has already been published — every
  // team's requirement points move, and the placement order can move with
  // them, silently, days after everyone read the result.
  if (
    facts.isFinalized &&
    incoming.requirementCount !== null &&
    incoming.requirementCount !== facts.currentRequirementCount
  ) {
    result.rejectedFields.add("requirementCount");
    result.refusals.push({
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "requirement_count_after_finalize",
      message:
        "Refused: this competition has been finalized and its points are " +
        `published, so Requirements cannot change from ` +
        `${facts.currentRequirementCount ?? "unset"} to ` +
        `${incoming.requirementCount}. Every team's score is computed against ` +
        "that number. If it was wrong, the results have to be re-tallied " +
        "deliberately rather than drift.",
    });
  }

  const judging = checkJudgingStartsAt(facts, incoming.judgingStartsAt);
  if (judging) {
    result.rejectedFields.add("judgingStartsAt");
    result.refusals.push(judging);
  }

  return result;
}

/**
 * `judgingStartsAt` must fall after the opening workshop's meeting, and cannot
 * move once participation has frozen.
 *
 * The first half stops a typo scheduling judging before the feature was even
 * announced — which would lock every roster the moment the competition was
 * created, with no visible cause.
 *
 * The second half matters more. This datetime IS the roster lock: moving it
 * later after the freeze would reopen rosters on a competition whose stars are
 * already awarded, and moving it earlier would silently extend the lock
 * backwards over a week people spent joining. A competition whose judging has
 * happened is history, not schedule.
 */
function checkJudgingStartsAt(
  facts: CompetitionFacts,
  incoming: Date | null,
): Refusal | null {
  if (incoming === null) return null;

  const current = facts.currentJudgingStartsAt;
  const unchanged =
    current !== null && current.getTime() === incoming.getTime();
  if (unchanged) return null;

  if (facts.participationFrozen) {
    return {
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "judging_moved_after_freeze",
      message:
        "Refused: judging has already started for this competition and team " +
        "participation is frozen, so Judging starts cannot move. Moving it " +
        "later would reopen rosters that are already settled; moving it " +
        "earlier would retroactively lock people out of days they spent " +
        "joining.",
    };
  }

  const meetingStart = facts.workshopMeetingStartsAt;
  if (meetingStart !== null && incoming.getTime() <= meetingStart.getTime()) {
    return {
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "judging_before_workshop",
      message:
        "Refused: Judging starts is at or before the opening workshop's " +
        `meeting (${meetingStart.toISOString()}). Judging cannot precede the ` +
        "session that announces the competition — as written, every team " +
        "roster would be locked from the moment the competition was created.",
    };
  }

  return null;
}
