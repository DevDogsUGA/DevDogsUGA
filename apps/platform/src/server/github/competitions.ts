import { sql } from "drizzle-orm";
import { env } from "~/env";
import { octokit } from "./client";
import { db } from "~/server/db";
import { competitions } from "~/server/db/schema";
import { postAlert } from "../alerts";
import {
  checkProjectShape,
  parseProjectItem,
  slugForCompetition,
  type ParsedCompetition,
  type ProjectFieldConfig,
} from "./competitionParsing";
import {
  CompetitionProjectItem,
  CompetitionsProjectItems,
  type CompetitionProjectItemResult,
  type CompetitionsProjectItemsResult,
  type RawProjectItemFields,
} from "./queries";

/**
 * The competitions mirror: platform.competitions, one row per CONVERTED
 * Project item.
 *
 * A competition's source of truth is a draft item in the private
 * "Competitions" GitHub Project (`env.GH_COMPETITIONS_PROJECT_ID`),
 * authored with one custom field -- "Judging/End Date" (date, display-only)
 * -- and a markdown body that becomes the brief. Its title is the draft's own
 * title: GitHub Projects v2 already has a BUILT-IN "Title" field
 * (`ProjectV2FieldType.TITLE`), so there is no custom field to add for it,
 * and none of this module's GraphQL reads a "Title" field by name. Converting
 * the draft into a real issue in `GITHUB_ORG/GITHUB_COMPETITION_REPO`
 * is KICKOFF, and that conversion is the only thing that makes a Project item
 * a competition this table knows about: a still-draft item has no row, and
 * this module never creates one for it. That is also the membership test the
 * design calls for -- "distinguishes competition issues by membership in
 * that Project" -- an issue in the competition repo that never went through
 * this Project is simply never named here.
 *
 * Optional: `GH_COMPETITIONS_PROJECT_ID` unset means every function below is
 * a logged no-op, so the platform boots (and every OTHER GitHub integration
 * keeps working) before Sloan has created the Project.
 *
 * ## GraphQL, not REST
 *
 * Projects v2 -- custom fields, draft-to-issue conversion -- has no REST
 * surface. `octokit().graphql(...)` reuses the same installation auth as
 * every REST call in `teamSync.ts`; there is no second credential to manage.
 *
 * ## Two triggers, one shared apply
 *
 * The webhook route (`projects_v2_item` `converted`/`edited`) fetches ONE
 * item by node id and applies it; the nightly `github-reconcile` cron pages
 * through the WHOLE Project and applies every item it finds. Both funnel
 * through `applyProjectItem`, which is the one place "is this a competition,
 * and is it shaped right" is decided, so the two triggers cannot drift on
 * what counts as valid.
 *
 * ## Project-shape drift
 *
 * `checkProjectShape` is this module's `verifyBase`: the Project's
 * "Judging/End Date" field is read by NAME, and GraphQL returns null for a
 * name that does not resolve to a field just as happily as it returns null
 * for a field with no value set on one item -- the two are indistinguishable
 * from an item-level read alone. So the field CONFIG is checked separately,
 * once per Project (not per item), and a missing or retyped field is
 * reported to Sentry and the run for that item (or every item, when the
 * reconcile catches it at the top of a page) is skipped rather than applied
 * with a guessed value. Never partially applied, the same rule
 * `server/config/reconcile.ts` follows for config-as-code.
 *
 * ## `deleted` / `archived` project items
 *
 * The simplest faithful behaviour: do nothing. A competition that already
 * kicked off keeps its mirror row exactly as it last synced -- the issue
 * itself is unaffected by an item leaving the Project, so there is nothing
 * to correct -- and this module simply stops being asked to refresh it. A
 * draft that gets deleted or archived before conversion never had a row to
 * begin with. Documented here rather than encoded, because there is no
 * decision to make: both webhook handlers below just do not call this
 * module for those two actions.
 */

// ── Parsing and validation ──────────────────────────────────────────────────
//
// `checkProjectShape`, `parseProjectItem` and their types live in
// `./competitionParsing` now -- pure, no `env` or `db` import, so a plain
// `*.test.ts` can exercise them against recorded GraphQL fixtures. See that
// file's header.

/**
 * Upserts one parsed competition. Idempotent on `issueNodeId`.
 *
 * `slug` is set only on INSERT -- omitted from the update `set` below, so a
 * later title edit never changes a competition's URL out from under a link
 * already shared. A new title still reaches the mirror through the `title`
 * column; the slug is a separate, stable identity, the same split
 * `teams."slug"` draws from `teams."name"`.
 */
async function upsertCompetition(
  database: typeof db,
  competition: ParsedCompetition,
): Promise<void> {
  await database
    .insert(competitions)
    .values({
      issueNodeId: competition.issueNodeId,
      issueNumber: competition.issueNumber,
      repo: competition.repo,
      url: competition.url,
      slug: slugForCompetition(competition.title, competition.issueNumber),
      title: competition.title,
      brief: competition.brief,
      plannedEndAt: competition.plannedEndAt,
      kickedOffAt: competition.kickedOffAt,
      closedAt: competition.closedAt,
      githubSyncedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: competitions.issueNodeId,
      set: {
        issueNumber: competition.issueNumber,
        repo: competition.repo,
        url: competition.url,
        title: competition.title,
        brief: competition.brief,
        plannedEndAt: competition.plannedEndAt,
        closedAt: competition.closedAt,
        githubSyncedAt: sql`now()`,
      },
    });
}

// ── The GitHub read seam ─────────────────────────────────────────────────────

/** A Project's identity plus its field config, for the membership check
 *  `ingestCompetitionItem` runs before it trusts anything else about an
 *  item: a GitHub App with org-wide `projects_v2_item` webhooks can deliver
 *  items from a Project this club never scoped as competitions. */
export interface ProjectIdentity extends ProjectFieldConfig {
  id: string;
}

export interface CompetitionsGithubClient {
  /** One Project item by node id, or null if the node does not resolve to a
   *  `ProjectV2Item` at all (never existed, or the id is stale). */
  projectItem(itemNodeId: string): Promise<{
    project: ProjectIdentity | null;
    item: RawProjectItemFields;
  } | null>;
  /** Every item currently in the configured Project, paginated internally.
   *  Returns null if the Project id itself does not resolve. */
  projectItems(projectId: string): Promise<{
    fields: ProjectFieldConfig;
    items: RawProjectItemFields[];
  } | null>;
}

/** One page of `CompetitionsProjectItems`. See the call site's comment on
 *  why this is not inlined into the loop that calls it. */
function fetchPage(
  projectId: string,
  cursor: string | null,
): Promise<CompetitionsProjectItemsResult> {
  return octokit().graphql<CompetitionsProjectItemsResult>(
    CompetitionsProjectItems,
    { projectId, cursor },
  );
}

function liveGithubClient(): CompetitionsGithubClient {
  return {
    async projectItem(itemNodeId) {
      const result = await octokit().graphql<CompetitionProjectItemResult>(
        CompetitionProjectItem,
        { itemId: itemNodeId },
      );
      if (result.node === null) return null;
      const { project, ...item } = result.node;
      return {
        project:
          project === null
            ? null
            : {
                id: project.id,
                plannedEndDateField: project.plannedEndDateField,
              },
        item,
      };
    },

    async projectItems(projectId) {
      const items: RawProjectItemFields[] = [];
      let fields: ProjectFieldConfig | null = null;
      let cursor: string | null = null;

      for (;;) {
        // Named rather than inlined: TypeScript cannot resolve `result`'s
        // type from `octokit().graphql<T>(...)` called directly inside this
        // loop (TS7022, "referenced in its own initializer") -- a
        // known quirk of `@octokit/rest`'s intersection-typed `Octokit`
        // interacting with a generic call re-evaluated every iteration.
        // Hoisting the call into its own function, whose return type is
        // resolved once, breaks the cycle.
        const result: CompetitionsProjectItemsResult = await fetchPage(
          projectId,
          cursor,
        );
        if (result.node === null) return null;
        fields ??= {
          plannedEndDateField: result.node.plannedEndDateField,
        };
        for (const { id: _id, ...rest } of result.node.items.nodes) {
          items.push(rest);
        }
        if (!result.node.items.pageInfo.hasNextPage) break;
        cursor = result.node.items.pageInfo.endCursor;
      }

      return { fields, items };
    },
  };
}

// ── Applying one item ────────────────────────────────────────────────────────

/**
 * Mirrors the migration's `competitions_title_length` check constraint
 * (`supabase/migrations/20260829040000_11_platform_events_core.sql`).
 * `parseProjectItem` has no length opinion -- a GitHub issue title allows up
 * to 256 characters -- so an ordinary issue can genuinely exceed what this
 * table's heading is allowed to hold. Checked here, before the write that
 * would otherwise be the first and only place to learn that. Exported so
 * `competitionEvents.ts`'s `issues.edited` handler can apply the same cap
 * to a title update rather than duplicating the number.
 */
export const COMPETITION_TITLE_MAX_LENGTH = 160;

export interface ApplyReport {
  upserted: number;
  skipped: number;
  /** Project-shape drift, human-readable, already sent to Sentry by the time
   *  the caller sees this -- present so a caller (the cron route) can echo
   *  it without a second read. */
  drift: string[];
}

function emptyReport(): ApplyReport {
  return { upserted: 0, skipped: 0, drift: [] };
}

/**
 * Applies one item against a KNOWN-GOOD field config -- the caller has
 * already run `checkProjectShape` once for the whole batch this item is
 * part of. Never partially applies: a drifted shape means this item (and
 * every other one sharing the same Project read) is skipped outright, not
 * upserted with a best guess.
 *
 * Contained on purpose: this is called from inside `reconcileCompetitions`'s
 * `for` loop and from the webhook route's single-item path, and this
 * function must never throw either caller into losing the rest of its work
 * over ONE bad item -- an over-length title (see `COMPETITION_TITLE_MAX_LENGTH`)
 * or any other write failure the shape check did not anticipate reports to
 * Sentry and is skipped, the same "report and move on" contract
 * `reportDrift` gives the shape check, rather than aborting the batch or
 * surfacing as an uncaught 500 that GitHub would just retry forever.
 */
async function applyItem(
  database: typeof db,
  item: RawProjectItemFields,
  report: ApplyReport,
): Promise<void> {
  const competitionRepo = `${env.GITHUB_ORG}/${env.GITHUB_COMPETITION_REPO}`;
  const outcome = parseProjectItem(item, competitionRepo);
  if (outcome.kind !== "competition") {
    report.skipped += 1;
    return;
  }

  try {
    if (outcome.competition.title.length > COMPETITION_TITLE_MAX_LENGTH) {
      throw new Error(
        `title is ${outcome.competition.title.length} characters, over the ` +
          `${COMPETITION_TITLE_MAX_LENGTH}-character cap`,
      );
    }
    await upsertCompetition(database, outcome.competition);
    report.upserted += 1;
  } catch (error) {
    report.skipped += 1;
    await postAlert(
      "Competitions ingest failed to apply an item",
      [
        `${outcome.competition.repo}#${outcome.competition.issueNumber}: ` +
          (error instanceof Error ? error.message : String(error)),
      ],
      "That item was skipped; every other item in this run still applied. Fix the issue's title and this will pick back up on the next webhook delivery or nightly reconcile.",
    );
  }
}

/**
 * Ingests one Project item by node id -- the webhook path.
 *
 * A no-op, successfully, when `GH_COMPETITIONS_PROJECT_ID` is unset, so a
 * checkout with no Competitions Project yet still boots and its webhook
 * route still answers 200.
 */
export async function ingestCompetitionItem(
  itemNodeId: string,
  database: typeof db = db,
  github: CompetitionsGithubClient = liveGithubClient(),
): Promise<ApplyReport> {
  const report = emptyReport();
  if (env.GH_COMPETITIONS_PROJECT_ID === "") return report;

  const fetched = await github.projectItem(itemNodeId);
  if (fetched === null) {
    report.skipped += 1;
    return report;
  }
  // Membership: this item has to belong to OUR Project, not merely to A
  // Project. A GitHub App with `projects_v2_item` webhooks configured
  // org-wide can deliver items from a Project this club never scoped as
  // competitions -- silently ignored, the same way `webhookEvents.ts`
  // ignores a team or branch it does not recognize.
  if (fetched.project?.id !== env.GH_COMPETITIONS_PROJECT_ID) {
    report.skipped += 1;
    return report;
  }

  const drift = checkProjectShape(fetched.project);
  if (drift.length > 0) {
    report.drift = drift;
    await reportDrift(drift);
    return report;
  }

  await applyItem(database, fetched.item, report);
  return report;
}

/**
 * Pages through the whole Competitions Project and upserts every converted
 * issue item -- the nightly backstop for `github-reconcile`.
 *
 * Unlike `reconcileTeams`, there is no "GitHub wins, mirror repairs toward
 * it" removal step here: a competition never leaves the mirror once
 * kicked off (see this file's header on `deleted`/`archived` items), so this
 * pass only ever adds or refreshes rows, never closes one.
 */
export async function reconcileCompetitions(
  database: typeof db = db,
  github: CompetitionsGithubClient = liveGithubClient(),
): Promise<ApplyReport> {
  const report = emptyReport();
  if (env.GH_COMPETITIONS_PROJECT_ID === "") return report;

  const fetched = await github.projectItems(env.GH_COMPETITIONS_PROJECT_ID);
  if (fetched === null) {
    // The configured Project id itself does not resolve -- a typo, or the
    // Project was deleted. Every item in it is unreachable, which IS
    // Project-shape drift: nothing here can tell "a typo'd id" apart from
    // "the Project disappeared", and both need a human.
    const drift = [
      `GH_COMPETITIONS_PROJECT_ID (${env.GH_COMPETITIONS_PROJECT_ID}) does not resolve to a GitHub Project`,
    ];
    report.drift = drift;
    await reportDrift(drift);
    return report;
  }

  const drift = checkProjectShape(fetched.fields);
  if (drift.length > 0) {
    report.drift = drift;
    await reportDrift(drift);
    return report;
  }

  for (const item of fetched.items) {
    await applyItem(database, item, report);
  }
  return report;
}

async function reportDrift(findings: string[]): Promise<void> {
  await postAlert(
    "Competitions Project no longer matches the expected shape",
    findings,
    'Ingestion refused rather than guessing at a missing or retyped field. Fix the field in the "Competitions" Project and this will pick back up on the next webhook delivery or nightly reconcile.',
  );
}
