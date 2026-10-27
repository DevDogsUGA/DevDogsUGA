import {
  MEETING_CANCELLATION_REASON_MAX_LENGTH,
  MEETING_SLUG_PATTERN,
  MEETING_SUMMARY_MAX_LENGTH,
  MEETING_TITLE_MAX_LENGTH,
  RSVP_URL_PATTERN,
  WORKSHOP_DESCRIPTION_MAX_LENGTH,
  WORKSHOP_TITLE_MAX_LENGTH,
  type AuthoredClubConfig,
  type ClubConfig,
  type Meeting,
  type Workshop,
} from "./schema.js";
import type { SeriesConfig } from "./series.js";
import type { VenuesConfig } from "./venues.js";
import type { WorkshopsConfig } from "./workshops.js";
import type { QuestionsConfig } from "./questions.js";

/**
 * Publishability rules: lengths, the RSVP-host allowlist, cancellation
 * reason/date pairing, slug and workshop-title uniqueness. There is no such thing as a
 * half-typed row here. A config file either parses and validates whole, or
 * CI fails the merge -- there is no "officer is still mid-edit" state to stay
 * silent about, because nothing reaches `main` until it is complete. So a
 * REFUSAL (a value that arrived and cannot be published) and a STATE (a row
 * that is merely unfinished) are not different things here: every finding
 * below is a hard error.
 *
 * Deliberately pure: no filesystem, no network, no database. Takes an
 * already-parsed `ClubConfig` and returns every problem it can find, rather
 * than stopping at the first one -- an author fixing one issue at a time off
 * a truncated report is the exact frustration the old refusal messages were
 * written to end.
 */

export interface ValidationIssue {
  /** Which meeting (its slug) or workshop ("<slug> › <title>") this finding
   * is about. */
  id: string;
  /** Machine-readable, for tests and for `check.ts`'s exit-code decision. */
  code: ValidationIssueCode;
  /** A human-readable explanation, in the same voice the old refusal
   * messages used: what is wrong, and why it matters. */
  message: string;
}

export type ValidationIssueCode =
  | "duplicate_series_id"
  | "unknown_series"
  | "missing_title"
  | "missing_category"
  | "missing_summary"
  | "missing_venue"
  | "unknown_venue"
  | "unknown_workshop"
  | "duplicate_workshop_id"
  | "duplicate_workshop_in_meeting"
  | "duplicate_venue_id"
  | "venue_needs_address"
  | "venue_building_not_campus"
  | "duplicate_workshop_title"
  | "duplicate_slug"
  | "meeting_slug_date"
  | "meeting_title_too_long"
  | "meeting_summary_too_long"
  | "meeting_cancellation_reason_too_long"
  | "meeting_cancellation_reason_without_date"
  | "meeting_rsvp_host"
  | "meeting_join_url_not_virtual"
  | "workshop_title_too_long"
  | "workshop_description_too_long"
  | "duplicate_question_id"
  | "duplicate_option_id"
  | "member_question_prefill"
  | "unknown_question"
  | "member_question_listed"
  | "question_listed_twice";

/**
 * `questions` is `questions.json`, checked on its own and against the
 * meetings that list its questions. Without it (a caller with only the
 * meetings), the meetings are checked alone.
 */
export function validateClubConfig(
  config: ClubConfig,
  questions?: QuestionsConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkWorkshopTitles(config, issues);
  checkSlugs(config, issues);

  for (const meeting of config.meetings) {
    checkMeeting(meeting, issues);
    for (const workshop of meeting.agenda) {
      checkWorkshop(meeting, workshop, issues);
    }
  }

  if (questions) checkQuestions(questions, config.meetings, issues);

  return issues;
}

// ── Series ───────────────────────────────────────────────────────────────────

/**
 * The checks that must pass before a series can be applied: series ids are
 * unique, every named series exists, and every meeting ends up with a
 * title, category, summary and location, from itself or its series. A
 * one-off (no series) has only itself to take them from.
 */
export function validateAuthored(
  config: AuthoredClubConfig,
  seriesConfig: SeriesConfig,
  workshopsConfig: WorkshopsConfig = { workshops: [] },
  venuesConfig: VenuesConfig = { venues: [] },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const workshopIds = new Set(workshopsConfig.workshops.map((w) => w.id));
  const venueIds = new Set(venuesConfig.venues.map((v) => v.id));
  const byId = new Map<string, SeriesConfig["series"][number]>();
  for (const series of seriesConfig.series) {
    if (byId.has(series.id)) {
      issues.push({
        id: series.id,
        code: "duplicate_series_id",
        message: `"${series.id}" names more than one series; meetings reference a series by id.`,
      });
    }
    byId.set(series.id, series);
    if (series.venue !== undefined && !venueIds.has(series.venue)) {
      issues.push({
        id: series.id,
        code: "unknown_venue",
        message: `Series "${series.id}" names venue "${series.venue}", which is not in venues.json.`,
      });
    }
  }

  for (const meeting of config.meetings) {
    const series =
      meeting.series === undefined ? undefined : byId.get(meeting.series);
    if (meeting.series !== undefined && series === undefined) {
      issues.push({
        id: meeting.slug,
        code: "unknown_series",
        message: `Meeting "${meeting.slug}" names series "${meeting.series}", which is not in series.json.`,
      });
      continue;
    }
    const needs: [string, ValidationIssueCode, unknown, unknown][] = [
      ["category", "missing_category", meeting.category, series?.category],
      ["summary", "missing_summary", meeting.summary, series?.summary],
      ["venue", "missing_venue", meeting.venue, series?.venue],
    ];
    if (series === undefined && meeting.title === undefined) {
      issues.push({
        id: meeting.slug,
        code: "missing_title",
        message: `Meeting "${meeting.slug}" has no series and no title. A one-off sets its own title.`,
      });
    }
    if (meeting.venue !== undefined && !venueIds.has(meeting.venue)) {
      issues.push({
        id: meeting.slug,
        code: "unknown_venue",
        message: `Meeting "${meeting.slug}" names venue "${meeting.venue}", which is not in venues.json. A venue is never guessed.`,
      });
    }
    const seen = new Set<string>();
    for (const entry of meeting.agenda) {
      const id = typeof entry === "string" ? entry : entry.workshop;
      if (!workshopIds.has(id)) {
        issues.push({
          id: meeting.slug,
          code: "unknown_workshop",
          message: `Meeting "${meeting.slug}" runs workshop "${id}", which is not in workshops.json.`,
        });
      }
      if (seen.has(id)) {
        issues.push({
          id: meeting.slug,
          code: "duplicate_workshop_in_meeting",
          message: `Workshop "${id}" is on ${meeting.slug}'s agenda more than once.`,
        });
      }
      seen.add(id);
    }
    for (const [field, code, own, inherited] of needs) {
      if (own === undefined && inherited === undefined) {
        issues.push({
          id: meeting.slug,
          code,
          message:
            `Meeting "${meeting.slug}" has no ${field}` +
            (series
              ? ` and series "${series.id}" gives none.`
              : ". A one-off sets its own."),
        });
      }
    }
  }
  return issues;
}

// ── Catalogs ─────────────────────────────────────────────────────────────────

/**
 * `workshops.json` and `venues.json` on their own: ids are unique (meetings
 * and the platform's rows point at them), an off-campus venue has an address
 * to navigate to, and only campus venues name a campus-map building.
 */
export function validateCatalog(
  workshopsConfig: WorkshopsConfig,
  venuesConfig: VenuesConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const workshopIds = new Set<string>();
  for (const workshop of workshopsConfig.workshops) {
    if (workshopIds.has(workshop.id)) {
      issues.push({
        id: workshop.id,
        code: "duplicate_workshop_id",
        message: `"${workshop.id}" names more than one workshop; agendas reference a workshop by id.`,
      });
    }
    workshopIds.add(workshop.id);
  }
  const venueIds = new Set<string>();
  for (const venue of venuesConfig.venues) {
    if (venueIds.has(venue.id)) {
      issues.push({
        id: venue.id,
        code: "duplicate_venue_id",
        message: `"${venue.id}" names more than one venue; meetings reference a venue by id.`,
      });
    }
    venueIds.add(venue.id);
    if (venue.kind === "offCampus" && venue.address === undefined) {
      issues.push({
        id: venue.id,
        code: "venue_needs_address",
        message: `Venue "${venue.id}" is off campus and needs an address to navigate to.`,
      });
    }
    if (venue.building !== undefined && venue.kind !== "campus") {
      issues.push({
        id: venue.id,
        code: "venue_building_not_campus",
        message: `Venue "${venue.id}" names a campus-map building but is ${venue.kind}; only campus venues do.`,
      });
    }
  }
  return issues;
}

// ── Identity ─────────────────────────────────────────────────────────────────

/** How a workshop is named in a finding: its meeting, then its title. */
function workshopLabel(meeting: Meeting, workshop: Workshop): string {
  return `${meeting.slug} › ${workshop.title}`;
}

/**
 * A workshop's identity is its title within its meeting: the reconcile
 * matches workshop rows on (meeting, title). Two workshops with one title in
 * one meeting would be the same row. Case-insensitive, because two titles
 * differing only in case are a typo, not two sessions.
 */
function checkWorkshopTitles(
  config: ClubConfig,
  issues: ValidationIssue[],
): void {
  for (const meeting of config.meetings) {
    const seen = new Set<string>();
    for (const workshop of meeting.agenda) {
      const key = workshop.title.toLowerCase();
      if (seen.has(key)) {
        issues.push({
          id: workshopLabel(meeting, workshop),
          code: "duplicate_workshop_title",
          message:
            `"${workshop.title}" is on ${meeting.slug}'s agenda more than ` +
            "once. A workshop is identified by its title within its meeting.",
        });
      }
      seen.add(key);
    }
  }
}

/** The club's timezone. Duplicated from `@devdogsuga/sdk/brand`'s `EVENT_TZ`,
 * which this package cannot import without a dependency cycle. */
const CLUB_TIME_ZONE = "America/New_York";

/** `YYYY-MM-DD` for an instant, on the club's clock. */
function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Slugs are URLs: unique, and on the meeting's own Eastern date. The pattern
 * itself is the schema's.
 */
function checkSlugs(config: ClubConfig, issues: ValidationIssue[]): void {
  const owner = new Map<string, string>();
  for (const meeting of config.meetings) {
    const { slug } = meeting;
    const other = owner.get(slug);
    if (other !== undefined) {
      issues.push({
        id: slug,
        code: "duplicate_slug",
        message:
          `"${slug}" is also the slug of "${other}". Slugs are URLs; give ` +
          'each meeting on a shared date its own descriptor ("2026-10-05-judging").',
      });
    } else {
      owner.set(slug, meeting.title);
    }
    const date = MEETING_SLUG_PATTERN.exec(slug)?.[1];
    const starts = easternDate(meeting.startsAt);
    if (date !== undefined && date !== starts) {
      issues.push({
        id: slug,
        code: "meeting_slug_date",
        message:
          `"${slug}" starts with ${date}, but the meeting starts on ${starts} ` +
          "(Eastern). A slug leads with the meeting's own date.",
      });
    }
  }
}

// ── Meetings ─────────────────────────────────────────────────────────────────

function checkMeeting(meeting: Meeting, issues: ValidationIssue[]): void {
  // The length caps are already enforced by the schema's `.max()` calls --
  // a config that violates them fails to PARSE, and `check.ts` never reaches
  // this function with one. They are re-asserted here anyway, defensively,
  // because this validator's contract is "call it on any parsed ClubConfig",
  // and a future caller that relaxes the schema without reading this file
  // must not silently lose the check.
  if (meeting.title.length > MEETING_TITLE_MAX_LENGTH) {
    issues.push({
      id: meeting.slug,
      code: "meeting_title_too_long",
      message: `Title is ${meeting.title.length} characters; a schedule row fits about ${MEETING_TITLE_MAX_LENGTH}.`,
    });
  }

  if (meeting.summary.length > MEETING_SUMMARY_MAX_LENGTH) {
    issues.push({
      id: meeting.slug,
      code: "meeting_summary_too_long",
      message: `Summary is ${meeting.summary.length} characters; the card fits about ${MEETING_SUMMARY_MAX_LENGTH}.`,
    });
  }

  if (
    meeting.cancellationReason !== null &&
    meeting.cancellationReason.length > MEETING_CANCELLATION_REASON_MAX_LENGTH
  ) {
    issues.push({
      id: meeting.slug,
      code: "meeting_cancellation_reason_too_long",
      message: `Cancellation reason is ${meeting.cancellationReason.length} characters; the notice fits about ${MEETING_CANCELLATION_REASON_MAX_LENGTH}.`,
    });
  }

  // The pairing rule: a reason with no cancellation date is a row nothing
  // renders and nobody can find to correct. The reverse -- cancelled with no
  // stated reason -- is allowed; the club does not always owe an explanation.
  // Mirrors `meetings_cancellationReason_needs_cancellation`.
  if (meeting.cancellationReason !== null && meeting.cancelledAt === null) {
    issues.push({
      id: meeting.slug,
      code: "meeting_cancellation_reason_without_date",
      message:
        "cancellationReason is set but cancelledAt is null -- the reason is " +
        "only ever shown beside the date it explains. Set cancelledAt, or " +
        "clear the reason if the meeting is back on.",
    });
  }

  // Tested against the whole URL with `RSVP_URL_PATTERN`, not parsed with
  // `new URL()` and checked by hostname -- see that constant's comment for
  // why: a hostname-only check would happily wave through the wrong-scheme
  // and userinfo URLs the DB's check constraint exists to reject.
  if (meeting.rsvpUrl !== null && !RSVP_URL_PATTERN.test(meeting.rsvpUrl)) {
    issues.push({
      id: meeting.slug,
      code: "meeting_rsvp_host",
      message: `rsvpUrl "${meeting.rsvpUrl}" must be an HTTPS address without userinfo or unsupported URL characters.`,
    });
  }
  if (meeting.joinUrl !== null && meeting.venue.kind !== "virtual") {
    issues.push({
      id: meeting.slug,
      code: "meeting_join_url_not_virtual",
      message: `Meeting "${meeting.slug}" has a joinUrl but its venue "${meeting.venue.id}" is not virtual; a join link belongs to an online night.`,
    });
  }
}

// ── Workshops ────────────────────────────────────────────────────────────────

function checkWorkshop(
  meeting: Meeting,
  workshop: Workshop,
  issues: ValidationIssue[],
): void {
  if (workshop.title.length > WORKSHOP_TITLE_MAX_LENGTH) {
    issues.push({
      id: workshopLabel(meeting, workshop),
      code: "workshop_title_too_long",
      message: `Title is ${workshop.title.length} characters; a schedule row fits about ${WORKSHOP_TITLE_MAX_LENGTH}.`,
    });
  }

  if (
    workshop.description !== null &&
    workshop.description.length > WORKSHOP_DESCRIPTION_MAX_LENGTH
  ) {
    issues.push({
      id: workshopLabel(meeting, workshop),
      code: "workshop_description_too_long",
      message: `Description is ${workshop.description.length} characters; the dialog fits about ${WORKSHOP_DESCRIPTION_MAX_LENGTH}.`,
    });
  }
}

// ── Questions ────────────────────────────────────────────────────────────────

/**
 * Question and option ids are unique (answers point at them); `prefill` is a
 * meeting question's (a member question already carries its one answer); and
 * a meeting lists only meeting questions that exist, each once. A retired
 * question may stay listed: it is simply not asked.
 */
function checkQuestions(
  config: QuestionsConfig,
  meetings: readonly Meeting[],
  issues: ValidationIssue[],
): void {
  const byId = new Map<string, QuestionsConfig["questions"][number]>();
  for (const question of config.questions) {
    if (byId.has(question.id)) {
      issues.push({
        id: question.id,
        code: "duplicate_question_id",
        message: `"${question.id}" names more than one question; answers are stored by id.`,
      });
    }
    byId.set(question.id, question);

    if (question.scope === "member" && question.prefill !== undefined) {
      issues.push({
        id: question.id,
        code: "member_question_prefill",
        message:
          `"${question.id}" is a member question, which always shows the ` +
          "person's saved answer; prefill is for meeting questions.",
      });
    }

    if ("options" in question) {
      const seen = new Set<string>();
      for (const option of question.options) {
        if (seen.has(option.id)) {
          issues.push({
            id: question.id,
            code: "duplicate_option_id",
            message: `"${question.id}" has more than one option "${option.id}".`,
          });
        }
        seen.add(option.id);
      }
    }
  }

  for (const meeting of meetings) {
    const listed = new Set<string>();
    for (const id of meeting.questions ?? []) {
      const question = byId.get(id);
      if (!question) {
        issues.push({
          id: meeting.slug,
          code: "unknown_question",
          message: `Meeting "${meeting.slug}" lists "${id}", which is not in questions.json.`,
        });
      } else if (question.scope === "member") {
        issues.push({
          id: meeting.slug,
          code: "member_question_listed",
          message:
            `Meeting "${meeting.slug}" lists "${id}", a member question. Member ` +
            "questions are asked at every check-in and are never listed.",
        });
      }
      if (listed.has(id)) {
        issues.push({
          id: meeting.slug,
          code: "question_listed_twice",
          message: `Meeting "${meeting.slug}" lists "${id}" more than once.`,
        });
      }
      listed.add(id);
    }
  }
}
