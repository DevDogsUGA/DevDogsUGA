import {
  COMPETITION_TITLE_MAX_LENGTH,
  normalizeMeetingSummary,
  type AirtableValue,
} from "@devdogsuga/airtable";

/**
 * The rules that make this a sync rather than a mirror -- for competitions.
 *
 * Meetings, workshops and projects lost this file's rules with the
 * config-as-code cutover: they are authored in `@devdogsuga/club-config` now,
 * validated by its CI check before anything reaches Postgres, so there is
 * nothing left here to refuse for them. Competitions are still Airtable-
 * authored until the git-native competitions rework, so their rules survive.
 *
 * Airtable is the CMS for what remains, so the default answer to "the
 * officer changed this" is "then change it here too". These are the
 * exceptions: the edits the platform refuses because applying them would
 * rewrite something already earned or already published.
 *
 * Pure on purpose. Each rule takes the facts it needs and returns a reason,
 * with no database and no Airtable client anywhere near it, because these are
 * the rules that most need a test each and the least need a fixture base to
 * test against.
 */

/** What the sync refused, and why, in words an officer can act on. */
export interface Refusal {
  table: "competitions" | "platformSettings";
  airtableRecordId: string;
  /** Machine-readable, for the console and for tests. */
  code: RefusalCode;
  /** Written verbatim into the record's `Sync status` field. */
  message: string;
}

export type RefusalCode =
  // Not a refusal: no rule rejected anything, the write itself failed. The
  // backstop for a bad value no rule here has learned to name yet. See
  // `tryWrite` in `sync.ts`.
  | "row_write_failed"
  | "reflection_settings_invalid"
  | "competition_title_too_long"
  | "judging_before_workshop"
  | "judging_moved_after_freeze";

/**
 * A refusal is per FIELD, not per record.
 *
 * An officer who fixes a project link and a max team size in the same edit
 * should get the team size change applied and a complaint about the project,
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

// ── Competitions ─────────────────────────────────────────────────────────────

export interface CompetitionFacts {
  airtableRecordId: string;
  /**
   * True once participation has frozen for this competition.
   *
   * ⚠️ Always `false` from `sync.ts` for now. The platform redesign's
   * teams-core step dropped `teams."competedAt"`, the column this used to be
   * computed from ("any team frozen means judging has happened"), because a
   * team is no longer scoped to one competition. The competitions step
   * reintroduces a freeze signal from the competition-entry mirror; until
   * then this rule cannot refuse anything and `judgingStartsAt` may move
   * freely even after judging.
   */
  participationFrozen: boolean;
  currentJudgingStartsAt: Date | null;
  /** `startsAt` of the opening workshop's meeting. */
  workshopMeetingStartsAt: Date | null;
}

export interface CompetitionIncoming {
  judgingStartsAt: Date | null;
}

export interface CompetitionValueFacts {
  airtableRecordId: string;
  /** Exactly what Airtable returned for `Title`, unparsed. */
  rawTitle: AirtableValue;
  /** What the registry parser made of it. Null past the length cap. */
  title: string | null;
}

/**
 * The title a competition cannot store.
 *
 * The number is never written as null: the caller already omits a null
 * number from the update rather than clearing the column, so nothing needs
 * adding to `rejectedFields` for it. The title is the exception, and works
 * like the workshop title did -- an over-length one adds itself to
 * `rejectedFields` so the caller keeps the published title rather than
 * erasing it, exactly the way one extra character must not blank a heading
 * mid-edit.
 */
export function checkCompetitionValues(
  facts: CompetitionValueFacts,
): RuleResult {
  const result = empty();

  const titleText = normalizeMeetingSummary(facts.rawTitle);
  if (titleText !== null && facts.title === null) {
    result.rejectedFields.add("title");
    result.refusals.push({
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "competition_title_too_long",
      message:
        `Title is ${titleText.length} characters; a competition heading fits ` +
        `about ${COMPETITION_TITLE_MAX_LENGTH}. It has not been published — ` +
        "shorten it and it will appear within fifteen minutes. The previous " +
        "title is still on the site until then.",
    });
  }

  return result;
}

/** Protects the entry state machine. */
export function checkCompetition(
  facts: CompetitionFacts,
  incoming: CompetitionIncoming,
): RuleResult {
  const result = empty();

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
 * announced, which would lock every roster the moment the competition was
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
