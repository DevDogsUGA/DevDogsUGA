import {
  MEETING_CANCELLATION_REASON_MAX_LENGTH,
  MEETING_NAME_OVERRIDE_MAX_LENGTH,
  MEETING_SUMMARY_MAX_LENGTH,
  normalizeMeetingSummary,
  RSVP_URL_ALLOWED_HOSTS,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  type AirtableValue,
} from "@devdogsuga/airtable";

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
 *
 * ## Two classes of rule live here, and they are not the same thing
 *
 * The workshop and competition rules mean **"this edit would destroy
 * something already earned"**: attendance credit attached to a workshop,
 * arithmetic already published under a competition. They are refusals about
 * HISTORY, and what they protect is a row that is already correct.
 *
 * `checkMeeting` is the other kind. It means **"this value cannot be
 * published"** — a summary that will not fit the card it is laid out in, an
 * RSVP link pointing somewhere the club is not. Nothing has been earned and
 * nothing is at risk; the value simply cannot go on a public page as written.
 *
 * Both write to `⚙️ Sync status`, and they should, because the officer's
 * question is the same in both cases: I edited this and the site did not
 * change — why. But the reasoning does not transfer. A rule of the first kind
 * asks what already exists; a rule of the second kind asks only what arrived.
 *
 * ## And one entry that is not a rule at all
 *
 * `meeting_incomplete` is a STATE, not a refusal: nothing was rejected, the
 * row simply does not have enough in it to become a meeting yet. It travels
 * with the refusals because it has the same destination and answers the same
 * officer question, and because the field is called `⚙️ Sync status` rather
 * than `⚙️ Sync errors`.
 *
 * ⚠️ It must stay worded as a state. The reason this row was silent for so
 * long is a good one — officers fill fields one at a time, and a pass landing
 * between two keystrokes must not COMPLAIN about a row that will be finished
 * in a minute. Saying where the row stands is not complaining; saying it did
 * something wrong would be. `.status()` clears on the next pass once the row
 * is whole, so a transient message costs nothing.
 */

/**
 * What to put in `⚙️ Sync status` for a row that is not a meeting yet.
 *
 * Names what is actually missing rather than restating the rule, because the
 * officer reading it is looking at the row and wants to know the next
 * keystroke, not the schema. Phrased as a state rather than a complaint — see
 * the third class of entry in this file's header for why that is
 * load-bearing.
 *
 * The two halves differ on one fact worth being accurate about: whether
 * anything of this meeting is already published. A row that exists in Postgres
 * keeps serving its previous values, so "not on the site yet" would be false
 * there, and would send an officer looking for a page that is up.
 */
export function describeIncompleteMeeting(
  values: {
    startsAt: string | null;
    endsAt: string | null;
  },
  published: boolean,
): string {
  const missing: string[] = [];
  // A name is no longer among these. Most nights have none by design — the
  // heading is derived from the workshops and the judging — so asking for one
  // would report the ordinary case as a fault, and the slug no longer needs it.
  if (values.startsAt === null) missing.push("a start time");
  if (values.endsAt === null) missing.push("an end time");

  // Empty means every field arrived and the ORDER is what failed, which is the
  // one case here that is a wrong value rather than an absent one.
  const problem =
    missing.length > 0
      ? `still needs ${formatList(missing)}`
      : "has an end time at or before its start time";

  return published
    ? `Not applied: this meeting ${problem}. What is on the site is the ` +
        "previous version, and it stays up until the row is complete again."
    : `Not on the site yet: this meeting ${problem}. Nothing is wrong with ` +
        "what you have entered so far — it appears within fifteen minutes of " +
        "being complete.";
}

/** "a name, a start time and an end time", the way an officer would write it. */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]!}`;
}

/** What the sync refused, and why, in words an officer can act on. */
export interface Refusal {
  table: "meetings" | "workshops" | "competitions" | "attendance";
  airtableRecordId: string;
  /** Machine-readable, for the console and for tests. */
  code: RefusalCode;
  /** Written verbatim into the record's `Sync status` field. */
  message: string;
}

export type RefusalCode =
  // Not a refusal — see the note on the third class above.
  | "meeting_incomplete"
  // Also not a refusal: no rule rejected anything, the write itself failed.
  // The backstop for a bad value no rule here has learned to name yet — see
  // `tryWrite` in `sync.ts`.
  | "row_write_failed"
  | "meeting_summary_too_long"
  | "meeting_cancellation_reason_too_long"
  | "meeting_reason_without_cancellation"
  | "meeting_rsvp_host"
  | "meeting_name_too_long"
  | "meeting_attendance_form_host"
  | "workshop_meeting_changed"
  | "workshop_project_changed"
  | "workshop_project_cleared"
  | "workshop_title_too_long"
  | "workshop_description_too_long"
  | "competition_max_team_size_invalid"
  | "competition_requirement_count_invalid"
  | "requirement_count_after_finalize"
  | "judging_before_workshop"
  | "judging_moved_after_freeze"
  | "attendance_bad_myid"
  | "attendance_unknown_workshop"
  | "attendance_meeting_already_recorded";

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

// ── Meetings ─────────────────────────────────────────────────────────────────

export interface MeetingFacts {
  airtableRecordId: string;
  /**
   * Exactly what Airtable returned for `Summary`, before any parsing.
   *
   * See the note on `checkMeeting` for why the raw cell is needed alongside
   * the parsed value.
   */
  rawSummary: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  summary: string | null;
  /** Exactly what Airtable returned for `RSVP`, before any parsing. */
  rawRsvpUrl: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  rsvpUrl: string | null;
  /**
   * The Cancelled date, parsed. Null means the night is on.
   *
   * Present here only so the reason can be judged against it: the two columns
   * are paired by a check constraint, so neither can be ruled on alone.
   */
  cancelledAt: string | null;
  /** Exactly what Airtable returned for `Cancellation reason`, unparsed. */
  rawCancellationReason: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  cancellationReason: string | null;
  /** Exactly what Airtable returned for `Name`, before any parsing. */
  rawNameOverride: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  nameOverride: string | null;
  /** Exactly what Airtable returned for `Attendance form`, unparsed. */
  rawAttendanceForm: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  attendanceForm: string | null;
}

/**
 * The values a meeting cannot publish.
 *
 * ## Empty is not malformed
 *
 * This is the rule the whole thing turns on. A blank Summary and a blank RSVP
 * are the ORDINARY state of a meeting: most weeks have neither, the events
 * page derives an agenda instead, and an officer who never fills them in has
 * done nothing wrong. A blank field must therefore stay silent forever, not
 * just until somebody notices the noise — otherwise every meeting in the base
 * carries a permanent complaint and `⚙️ Sync status` stops being a signal.
 *
 * Only a value that is PRESENT and WRONG produces a refusal.
 *
 * ## Which is why the raw cell is a parameter
 *
 * The parser cannot answer this on its own. It returns `null` for both
 * "nothing was written" and "something was written and I will not publish it",
 * and those two are the entire distinction this rule is made of. Collapsing
 * them would either silence every real refusal or complain about every empty
 * field, depending on which way you guessed.
 *
 * So the caller hands over both halves: the raw Airtable cell, which answers
 * "did the officer write anything", and the parsed value, which answers "was
 * it publishable". A refusal is exactly the pair (present, null) — and the
 * verdict stays with the parser rather than being re-derived here, so there is
 * no second definition of "acceptable" to drift out of step with the first.
 *
 * Note what is absent: there is no rule for `Kind`. It is a single select in
 * Airtable, so an out-of-list value is close to unrepresentable at the source,
 * and there is no wrong-but-plausible value for an officer to be told about —
 * they picked from a dropdown or they did not.
 */
export function checkMeeting(facts: MeetingFacts): RuleResult {
  const result = empty();

  // Normalized here rather than trimmed, so the length quoted back at the
  // officer is the length the rule actually measured. A message naming a
  // different number than the rule applied is worse than no message.
  const summaryText = normalizeMeetingSummary(facts.rawSummary);
  if (summaryText !== null && facts.summary === null) {
    result.rejectedFields.add("summary");
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_summary_too_long",
      message:
        `Summary is ${summaryText.length} characters; the card fits about ` +
        `${MEETING_SUMMARY_MAX_LENGTH}. It has not been published — shorten ` +
        "it and it will appear within fifteen minutes. It was not cut short " +
        "for you on purpose: half a sentence under your name on the events " +
        "page is worse than none.",
    });
  }

  const rsvpText = presentText(facts.rawRsvpUrl);
  if (rsvpText !== null && facts.rsvpUrl === null) {
    result.rejectedFields.add("rsvpUrl");
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_rsvp_host",
      message:
        `RSVP is "${rsvpText}", which is not a link this can publish. It has ` +
        "not been published — the events page links members straight to it, " +
        "so it has to be an https:// address on " +
        `${RSVP_ALLOWED_HOSTS_TEXT}. Paste the meeting's event page from the ` +
        "Involvement Network and it will appear within fifteen minutes.",
    });
  }

  // Both of the rules below guard a CHECK CONSTRAINT rather than a layout.
  // That is a stronger reason than the two above: an unpublishable summary is
  // a bad card, but a value the constraint rejects is an exception raised in
  // the middle of the pull, and that unwinds past every table left in the
  // pass. The parser now returns null for both, so all that is left here is
  // telling the officer which keystroke did it.
  const nameText = presentText(facts.rawNameOverride);
  if (nameText !== null && facts.nameOverride === null) {
    result.rejectedFields.add("nameOverride");
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_name_too_long",
      message:
        `Name is ${nameText.length} characters; a schedule row fits about ` +
        `${MEETING_NAME_OVERRIDE_MAX_LENGTH}. It has not been published — ` +
        "shorten it and it will appear within fifteen minutes. Most nights " +
        "need no name at all: the heading is built from the workshops and " +
        "the judging, so clearing this cell is also a fix.",
    });
  }

  const formText = presentText(facts.rawAttendanceForm);
  if (formText !== null && facts.attendanceForm === null) {
    result.rejectedFields.add("attendanceFormUrl");
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_attendance_form_host",
      message:
        `Attendance form is "${formText}", which is not a link this can ` +
        "store. It has not been published — check-in sends members straight " +
        "to it, so it has to be an https:// address on airtable.com. Open " +
        "the form in Airtable, use Share form, and paste that link.",
    });
  }

  // The cancellation pair, which the rules above have no equivalent of:
  // `meetings_cancellationReason_needs_cancellation` allows a reason only
  // beside the date it explains, so neither column can be judged alone.
  const reasonText = normalizeMeetingSummary(facts.rawCancellationReason);

  if (reasonText !== null && facts.cancelledAt === null) {
    // Deliberately NOT added to `rejectedFields`, unlike every other refusal
    // here. The caller must write null rather than drop the key: withholding
    // it leaves whatever the column already held, and a reason left behind by
    // an un-cancellation is precisely the row the constraint rejects — the
    // next write would take down the pass this refusal exists to prevent.
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_reason_without_cancellation",
      message:
        "Cancellation reason is filled in but Cancelled is empty, so it has " +
        "not been published — the reason is only ever shown beside the date " +
        "it explains. Set Cancelled and both appear within fifteen minutes. " +
        "If the meeting is back on, clear the reason as well.",
    });
  }

  // A SEPARATE `if`, not the `else` this used to be. The two conditions are
  // independent — one is about `cancelledAt`, the other about the length of
  // `cancellationReason` — and chaining them hid the length problem behind
  // the pairing one. An officer who typed 220 characters before setting the
  // date was told only "set Cancelled and both appear within fifteen
  // minutes", which was untrue; they set the date, waited a pull, and then
  // learned about a fault that was knowable on the first pass. Summary and
  // rsvpUrl have always both fired, and this now matches them.
  if (reasonText !== null && facts.cancellationReason === null) {
    result.rejectedFields.add("cancellationReason");
    result.refusals.push({
      table: "meetings",
      airtableRecordId: facts.airtableRecordId,
      code: "meeting_cancellation_reason_too_long",
      message:
        `Cancellation reason is ${reasonText.length} characters; the notice ` +
        `fits about ${MEETING_CANCELLATION_REASON_MAX_LENGTH}. It has not ` +
        "been published — shorten it and it will appear within fifteen " +
        "minutes. The night still shows as cancelled either way.",
      // That last sentence used to end "; only the explanation is missing",
      // which is false on the update path: a refused reason is DROPPED from
      // the write, so a previously published explanation stays on the page.
      // The officer would read "missing", look at the site, and see words.
      // Claiming only what is certainly true is what the summary refusal does.
    });
  }

  return result;
}

/** The allowlist as a phrase, so the message names what is actually accepted. */
const RSVP_ALLOWED_HOSTS_TEXT = RSVP_URL_ALLOWED_HOSTS.join(" or ");

/**
 * The cell's text if the officer wrote something, else null.
 *
 * "Wrote something" and not "wrote a string": Airtable omits an empty field
 * from a record's `fields` object entirely rather than returning null, so
 * `undefined` is the shape absence usually arrives in. A cell holding only
 * whitespace is absence too — nobody meant it, and refusing it would be a
 * complaint about a stray keystroke.
 *
 * Anything present and not a string is stringified rather than treated as
 * absent. A `url` field will never return one, but the failure modes are not
 * symmetric: a value wrongly called absent is silently dropped, while a value
 * wrongly called present is at worst a refusal an officer can read and ignore.
 */
function presentText(raw: AirtableValue): string | null {
  if (raw === null || raw === undefined) return null;
  const text = typeof raw === "string" ? raw : String(raw);
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

// ── Workshops ────────────────────────────────────────────────────────────────

export interface WorkshopFacts {
  airtableRecordId: string;
  /** Attendance rows already pointing at this workshop. */
  attendanceCount: number;
  currentMeetingId: string;
  /** Null when the workshop has no project yet: `workshops.projectId` is
   *  nullable, and a session can be run and attended before anyone attaches
   *  repo work to it. */
  currentProjectId: string | null;
}

export interface WorkshopIncoming {
  meetingId: string | null;
  projectId: string | null;
  /**
   * True when the officer EMPTIED the Project cell, as opposed to a link that
   * is present and merely failed to resolve this pass.
   *
   * Both arrive as `projectId: null`, and the difference is the whole of the
   * rule below: emptying the cell is an edit with intent, and a link whose
   * project row was skipped earlier in the same run is not an edit at all.
   * The caller knows which because it holds the raw cell; this file cannot
   * derive it, so it is passed rather than guessed.
   */
  projectCleared: boolean;
}

// ── Workshop values ──────────────────────────────────────────────────────────

export interface WorkshopValueFacts {
  airtableRecordId: string;
  /** Exactly what Airtable returned for `Title`, before any parsing. */
  rawTitle: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  title: string | null;
  /** Exactly what Airtable returned for `Description`, unparsed. */
  rawDescription: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  description: string | null;
}

/**
 * The values a workshop cannot publish.
 *
 * The second class of rule, on the workshops table — see this file's header.
 * `checkWorkshop` below asks what a workshop already HAS; this asks only what
 * arrived, which is why it runs on the insert path too and does not care
 * about attendance.
 *
 * It exists because `title` and `description` were written through
 * unconditionally while `workshops_title_length` and
 * `workshops_description_length` cap both at 80 and 280. The parser returns
 * null past those caps, and null CLEARS — so an officer lengthening a title
 * by one character silently erased the one that was there, with nothing in
 * `⚙️ Sync status` to say so and the schedule quietly falling back to the
 * project name. Summary and rsvpUrl have always been handled this way; these
 * two were the pair that never got it.
 */
export function checkWorkshopValues(facts: WorkshopValueFacts): RuleResult {
  const result = empty();

  const titleText = normalizeMeetingSummary(facts.rawTitle);
  if (titleText !== null && facts.title === null) {
    result.rejectedFields.add("title");
    result.refusals.push({
      table: "workshops",
      airtableRecordId: facts.airtableRecordId,
      code: "workshop_title_too_long",
      message:
        `Title is ${titleText.length} characters; a schedule row fits about ` +
        `${WORKSHOP_TITLE_MAX_LENGTH}. It has not been published — shorten ` +
        "it and it will appear within fifteen minutes. The previous title " +
        "is still on the site until then.",
    });
  }

  const descriptionText = normalizeMeetingSummary(facts.rawDescription);
  if (descriptionText !== null && facts.description === null) {
    result.rejectedFields.add("description");
    result.refusals.push({
      table: "workshops",
      airtableRecordId: facts.airtableRecordId,
      code: "workshop_description_too_long",
      message:
        `Description is ${descriptionText.length} characters; the dialog ` +
        `fits about ${WORKSHOP_DESCRIPTION_MAX_LENGTH}. It has not been ` +
        "published — shorten it and it will appear within fifteen minutes. " +
        "The previous description is still on the site until then.",
    });
  }

  return result;
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

  // A null *current* project is not a change either, for the mirror of the
  // reason a null incoming one isn't: nothing has been credited to a project
  // yet, so filling the field in for the first time takes nothing away from
  // one. The refusal below promises "a different project", and where there is
  // no current project there is none to differ from.
  if (
    incoming.projectId !== null &&
    facts.currentProjectId !== null &&
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

  // Clearing the cell is the third edit, and it was the one that got through.
  //
  // The rule above only fires for a project that DIFFERS, and emptying the
  // cell arrives as `projectId: null`, which it reads as "not a change" by
  // design. So a cleared Project on a workshop with twenty check-ins was
  // written straight through: `memberStars` groups on `w."projectId"`, and
  // every one of those members lost the project off a star they had already
  // earned, silently, with a clean `⚙️ Sync status`.
  //
  // Unlinking a session that turned out to teach a skill rather than a
  // codebase is still a real edit — it is the reason `projectId` became
  // nullable. It is real up until somebody has been credited for it, which is
  // exactly where the other two rules draw the line too.
  if (
    incoming.projectCleared &&
    incoming.projectId === null &&
    facts.currentProjectId !== null
  ) {
    result.rejectedFields.add("projectId");
    result.refusals.push({
      table: "workshops",
      airtableRecordId: facts.airtableRecordId,
      code: "workshop_project_cleared",
      message:
        `Refused: this workshop has ${facts.attendanceCount} attendance ` +
        "record(s), so its Project cannot be emptied — those check-ins are " +
        "credited to that project, and clearing it would take the project " +
        "off stars members have already earned. The Project is unchanged on " +
        "the site. If this session really teaches a skill rather than a " +
        "codebase, create a new workshop row for it.",
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

export interface CompetitionValueFacts {
  airtableRecordId: string;
  /** Exactly what Airtable returned for `Max team size`, unparsed. */
  rawMaxTeamSize: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  maxTeamSize: number | null;
  /** Exactly what Airtable returned for `Requirements`, unparsed. */
  rawRequirementCount: AirtableValue;
  /** What the registry parser made of it — null if it refused the value. */
  requirementCount: number | null;
}

/**
 * The numbers a competition cannot store.
 *
 * `competitions_maxTeamSize_positive` and
 * `competitions_requirementCount_nonneg` are check constraints, so a 0 typed
 * into Max team size used to be an exception raised inside the pull rather
 * than a refused cell. The parser now rejects both, and the only thing left
 * is saying so — otherwise the number simply never applies and the officer
 * has no way to find out which of their edits did not take.
 *
 * Unlike the meeting rules, a rejected value here is never written as null:
 * the caller already omits a null number from the update rather than
 * clearing the column, so nothing needs adding to `rejectedFields`.
 */
export function checkCompetitionValues(
  facts: CompetitionValueFacts,
): RuleResult {
  const result = empty();

  if (facts.rawMaxTeamSize !== undefined && facts.maxTeamSize === null) {
    result.refusals.push({
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "competition_max_team_size_invalid",
      message:
        `Max team size is "${String(facts.rawMaxTeamSize)}", which is not a ` +
        "team size. It has to be a whole number of at least 1, and it has " +
        "not been applied — the previous value is still in force. Leave the " +
        "cell empty for no limit.",
    });
  }

  if (
    facts.rawRequirementCount !== undefined &&
    facts.requirementCount === null
  ) {
    result.refusals.push({
      table: "competitions",
      airtableRecordId: facts.airtableRecordId,
      code: "competition_requirement_count_invalid",
      message:
        `Requirements is "${String(facts.rawRequirementCount)}", which is ` +
        "not a count. It has to be a whole number, zero or more, and it has " +
        "not been applied — the previous value is still in force. It is the " +
        "denominator every team's requirement score is computed against.",
    });
  }

  return result;
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

// ── Attendance ───────────────────────────────────────────────────────────────

const UGA_DOMAIN = "@uga.edu";

/**
 * A MyID as an address, or null if it cannot be one.
 *
 * Accepts a bare local part (`jdoe`) and also a full `@uga.edu` address, since
 * somebody will type one however the form is labelled. Everything else is
 * rejected rather than coerced.
 *
 * The rejection matters more than the parsing. Sign-in is Google restricted to
 * `hd=uga.edu`, so an account created for `someone@gmail.com` could never be
 * signed into by anybody — it would be an unreachable row holding somebody's
 * attendance forever. Refusing is the only outcome that leaves a person able to
 * fix it.
 */
export function myIdToEmail(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  const local = value.endsWith(UGA_DOMAIN)
    ? value.slice(0, -UGA_DOMAIN.length)
    : value;

  // MyIDs are alphanumeric. Anything with an @ left in it named another
  // domain, and anything with a space is two of something.
  if (!/^[a-z0-9._-]+$/.test(local)) return null;

  return `${local}${UGA_DOMAIN}`;
}

export interface AttendanceFacts {
  airtableRecordId: string;
  /** What the form actually held, for quoting back at the officer. */
  rawMyId: string | null;
  /** The address `myIdToEmail` made of it, or null if it could not. */
  email: string | null;
  /** Resolved from the Workshop link, or null if it did not resolve. */
  workshopId: string | null;
  /** Derived from the workshop, or null if that workshop has no meeting. */
  meetingId: string | null;
}

/**
 * The two ways an attendance response cannot be stored.
 *
 * Both are refusals rather than skips, and the distinction is worth stating
 * because the rest of the pull leans the other way. An officer half-filling a
 * meeting row will finish it in thirty seconds, so complaining is noise. A
 * response naming `jdoe@gmail.com`, or naming a workshop that is not in the
 * base, will still be wrong on the next pass and every pass after — nobody
 * finds out unless somebody is told.
 */
export function checkAttendance(facts: AttendanceFacts): RuleResult {
  // An address outside uga.edu can never be signed into. Sign-in is Google
  // with hd=uga.edu, so creating that account would produce a row holding
  // somebody's attendance that no human on earth can reach.
  if (facts.email === null) {
    return {
      refusals: [
        {
          table: "attendance",
          airtableRecordId: facts.airtableRecordId,
          code: "attendance_bad_myid",
          message:
            `Refused: "${facts.rawMyId ?? ""}" is not a UGA MyID. Enter the ` +
            "part before @uga.edu — sign-in is restricted to UGA Google " +
            "accounts, so an address anywhere else could never be claimed by " +
            "the person who attended.",
        },
      ],
      rejectedFields: new Set(["myId"]),
    };
  }

  if (facts.workshopId === null || facts.meetingId === null) {
    return {
      refusals: [
        {
          table: "attendance",
          airtableRecordId: facts.airtableRecordId,
          code: "attendance_unknown_workshop",
          message:
            "Refused: the linked Workshop is not one the platform knows " +
            "about. A workshop needs both its Meeting and its Project filled " +
            "in before attendance can hang off it.",
        },
      ],
      rejectedFields: new Set(["workshop"]),
    };
  }

  return empty();
}
