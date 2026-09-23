import type { RawFieldConfig, RawProjectItemFields } from "./queries";

/**
 * The pure half of the competitions mirror: turning one Project item's
 * GraphQL shape into a competition, or a reason it is not one (yet), plus
 * the Project-shape drift check both ingestion triggers run first.
 *
 * Extracted from `server/github/competitions.ts` for the same reason
 * `lib/meetingSegments.ts` exists: nothing here reads `env` or `db`, so a
 * plain `*.test.ts` can exercise it directly against recorded GraphQL
 * fixtures without needing the whole app's environment validated (a
 * `.env` file present, `with-env` on the command line) the way importing
 * `competitions.ts` itself would. See that file's header for the ingestion
 * story this logic backs -- the GitHub read seam, the upsert, the webhook
 * and nightly-reconcile triggers -- none of which lives here.
 */

const TITLE_FIELD_NAME = "Title";
const PLANNED_END_DATE_FIELD_NAME = "Judging/End Date";

export interface ParsedCompetition {
  issueNodeId: string;
  issueNumber: number;
  repo: string;
  url: string;
  title: string;
  brief: string | null;
  plannedEndAt: Date | null;
  kickedOffAt: Date;
  closedAt: Date | null;
}

export interface ProjectFieldConfig {
  titleField: RawFieldConfig | null;
  plannedEndDateField: RawFieldConfig | null;
}

/**
 * A plain, single-select-free field of the right type -- text for "Title",
 * date for "Judging/End Date". `ProjectV2Field` is GraphQL's shape for both;
 * `dataType` is what tells them apart. Anything else (missing, a
 * single-select, an iteration, the wrong `dataType`) is drift.
 */
function fieldMatches(field: RawFieldConfig | null, dataType: string): boolean {
  return (
    field !== null &&
    field.__typename === "ProjectV2Field" &&
    field.dataType === dataType
  );
}

/**
 * The Project-shape check. Empty means the shape is fine; a non-empty array
 * is what gets reported to Sentry and printed in the alert.
 *
 * Run once per Project read (not once per item): the field CONFIG this
 * checks is a property of the Project, identical for every item in it, so
 * checking it per item would be the same finding N times over for one
 * drifted field.
 */
export function checkProjectShape(fields: ProjectFieldConfig): string[] {
  const findings: string[] = [];
  if (!fieldMatches(fields.titleField, "TEXT")) {
    findings.push(
      `"${TITLE_FIELD_NAME}" field is missing or is not a text field (found: ${fields.titleField?.dataType ?? fields.titleField?.__typename ?? "missing"})`,
    );
  }
  if (!fieldMatches(fields.plannedEndDateField, "DATE")) {
    findings.push(
      `"${PLANNED_END_DATE_FIELD_NAME}" field is missing or is not a date field (found: ${fields.plannedEndDateField?.dataType ?? fields.plannedEndDateField?.__typename ?? "missing"})`,
    );
  }
  return findings;
}

export type ParseOutcome =
  | { kind: "competition"; competition: ParsedCompetition }
  /** Still a draft -- no `content`, or `content` is not an `Issue` (a
   *  Project can also hold pull requests). Not yet a competition. */
  | { kind: "not_converted" }
  /** The issue lives somewhere other than the configured competition repo.
   *  Not this module's business -- a Project can span repositories. */
  | { kind: "wrong_repo" };

/**
 * One item, from Project-scoped field config plus the item's own fields, to
 * either a parsed competition or a reason it is not one (yet).
 *
 * Pure -- no database, no network, no `env` -- so `checkProjectShape`'s
 * drift is the caller's problem to report, and this only runs once the
 * shape has already passed. `competitionRepo` (`GITHUB_ORG/
 * GITHUB_COMPETITION_REPO`) is a parameter rather than read from `env`
 * directly for the same reason: it keeps this function testable with a
 * plain fixture and no environment to configure. Shared verbatim between
 * the single-item and paginated queries: see `competitions.ts`'s header for
 * why the same function has to read both.
 */
export function parseProjectItem(
  item: RawProjectItemFields,
  competitionRepo: string,
): ParseOutcome {
  const content = item.content;
  if (content?.__typename !== "Issue") {
    return { kind: "not_converted" };
  }

  if (content.repository.nameWithOwner !== competitionRepo) {
    return { kind: "wrong_repo" };
  }

  // An `if`, not `??` or `||`: an officer can type nothing but spaces into a
  // GitHub Project text field, and GraphQL hands that back as a non-null,
  // non-empty-until-trimmed string, so `titleValue?.text.trim()` can itself
  // be an empty string, not just `undefined`. Both operators treat those
  // differently (`??` keeps the empty string, `||` and this codebase's lint
  // config disagree on how to fall back on one), so the empty case is
  // spelled out rather than folded into either.
  let title = content.title;
  const titleFieldValue = item.titleValue?.text.trim();
  if (titleFieldValue) {
    title = titleFieldValue;
  }
  const plannedEndAt =
    item.plannedEndDateValue === null
      ? null
      : new Date(`${item.plannedEndDateValue.date}T00:00:00Z`);

  return {
    kind: "competition",
    competition: {
      issueNodeId: content.id,
      issueNumber: content.number,
      repo: content.repository.nameWithOwner,
      url: content.url,
      title,
      brief: content.body,
      plannedEndAt,
      // The issue did not exist before conversion -- converting a draft
      // Project item creates a brand-new GitHub issue at that moment, so its
      // own `createdAt` IS the kickoff instant. There is no separate
      // "convertedAt" field on a ProjectV2Item to read instead.
      kickedOffAt: new Date(content.createdAt),
      closedAt: content.closedAt === null ? null : new Date(content.closedAt),
    },
  };
}

/** Lowercased, hyphenated, capped, with the issue number appended so two
 *  competitions that happen to share a title never collide. Mirrors
 *  `server/actions/teams.ts`'s `slugify`. */
export function slugForCompetition(title: string, issueNumber: number): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "competition";
  return `${base}-${issueNumber}`;
}
