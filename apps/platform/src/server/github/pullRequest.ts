import { and, eq, inArray, isNull } from "drizzle-orm";
import { env } from "~/env";
import { octokit } from "./client";
import type { db } from "~/server/db";
import { competitionEntries, competitions, teams } from "~/server/db/schema";
import { postAlert } from "../alerts";
import { referencedIssueNumbers, teamSlugForHead } from "./pullRequestParsing";

/**
 * Competition entries: applying a recognized pull request to
 * `platform.competitionEntries`, and the nightly reconcile backstop.
 *
 * An entry is a PR from a team's branch (`team/<slug>`) into `main` that
 * links a mirrored competition's issue -- see
 * `docs/platform/guides/meetings-and-teams/competitions.md` and
 * `pullRequestParsing.ts`, which decides that. Unlike the competitions
 * mirror itself (`competitions.ts`), a `pull_request` webhook payload
 * already carries everything this module needs -- title, body, head and
 * base refs, the merge/close timestamps -- so there is no GraphQL fetch on
 * the webhook path, the same "the payload IS the fact" reasoning
 * `webhookEvents.ts`'s module doc gives for the team mirror. A GitHub fetch
 * only happens for the nightly reconcile backstop (`reconcileEntries`
 * below), which has no payload to work from and has to ask GitHub what PRs
 * currently exist.
 *
 * `applyPullRequest` is the one place "is this PR an entry, and what does it
 * say" is decided, shared by the webhook handler
 * (`server/github/prEvent.ts`) and the reconcile backstop, so the two cannot
 * drift on what counts as a valid entry.
 *
 * ## Winning
 *
 * There is no separate "who won" table. `competitionEntries."mergedAt"` IS
 * the record: an officer merging the winning pull request is the only
 * action that names a winner, and the merge is a fact GitHub already reports
 * on this same payload. See the team-awards migration's header for why an
 * earlier, officer-authored `teamAwards` table was deleted rather than kept
 * alongside this.
 */

// ── Applying a PR: writes the mirror ────────────────────────────────────────

/** The one shape both the webhook handler and the reconcile backstop reduce
 *  a PR to before calling `applyPullRequest` -- REST and webhook payloads
 *  name these fields slightly differently on the wire, but agree once
 *  flattened to this. */
export interface PullRequestFields {
  nodeId: string;
  number: number;
  url: string;
  title: string;
  body: string | null;
  headRef: string;
  baseRef: string;
  /** ISO 8601, GitHub's own `created_at`. */
  createdAt: string;
  /** ISO 8601, or null while unmerged. */
  mergedAt: string | null;
  /** ISO 8601, or null while open. GitHub sets this alongside `mergedAt` on
   *  a merge too -- `applyPullRequest` is what separates "closed by merging"
   *  from "closed without merging" into this table's own two columns. */
  closedAt: string | null;
}

async function teamRowBySlug(database: typeof db, slug: string) {
  const [row] = await database
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * The mirrored competition a PR's referenced issue numbers resolve to, or
 * null if none of them do.
 *
 * Walks `issueNumbers` in the order they were referenced and returns the
 * FIRST one that names a row this table mirrors -- a PR linking more than
 * one issue is unusual, and there is no principled way to prefer a later
 * reference over an earlier one, so "whichever the author wrote first"
 * decides.
 */
async function mirroredCompetitionFor(
  database: typeof db,
  issueNumbers: number[],
  repo: string,
) {
  if (issueNumbers.length === 0) return null;
  const rows = await database
    .select({
      id: competitions.id,
      issueNumber: competitions.issueNumber,
      closedAt: competitions.closedAt,
    })
    .from(competitions)
    .where(
      and(
        eq(competitions.repo, repo),
        inArray(competitions.issueNumber, issueNumbers),
      ),
    );
  for (const number of issueNumbers) {
    const match = rows.find((row) => row.issueNumber === number);
    if (match) return match;
  }
  return null;
}

/**
 * Deletes a PR's entry row, unless it already recorded a merge.
 *
 * Called whenever a PR no longer qualifies -- its head is not a mirrored
 * team's branch, its base is not `main`, or it no longer links a mirrored
 * competition (an edit can remove all three). "Unless already merged" is
 * deliberate: a merge is history, not a live qualification check, and an
 * edit landing after the merge (tidying the PR description, say) must not
 * erase who won.
 */
async function removeUnmergedEntry(
  database: typeof db,
  prNodeId: string,
): Promise<void> {
  await database
    .delete(competitionEntries)
    .where(
      and(
        eq(competitionEntries.prNodeId, prNodeId),
        isNull(competitionEntries.mergedAt),
      ),
    );
}

/**
 * Applies one PR's current state to the entries mirror. Idempotent:
 * upserted on `prNodeId`, so a redelivered webhook or a reconcile pass
 * re-applying the same PR is a no-op the second time.
 *
 * Shared by `server/github/prEvent.ts` (one PR, from a webhook payload) and
 * `reconcileEntries` below (every open PR into `main`, from the nightly
 * pass) -- the one place "is this PR an entry" is decided, so the two
 * triggers cannot drift on what counts as one.
 */
export async function applyPullRequest(
  database: typeof db,
  pr: PullRequestFields,
): Promise<void> {
  const teamSlug = teamSlugForHead(pr.headRef, pr.baseRef);
  const team =
    teamSlug === null ? null : await teamRowBySlug(database, teamSlug);

  if (team === null) {
    await removeUnmergedEntry(database, pr.nodeId);
    return;
  }

  const competitionRepo = `${env.GITHUB_ORG}/${env.GITHUB_COMPETITION_REPO}`;
  const issueNumbers = referencedIssueNumbers(
    `${pr.title}\n${pr.body ?? ""}`,
    competitionRepo,
  );
  const competition = await mirroredCompetitionFor(
    database,
    issueNumbers,
    competitionRepo,
  );

  if (competition === null) {
    await removeUnmergedEntry(database, pr.nodeId);
    return;
  }

  const openedAt = new Date(pr.createdAt);
  const mergedAt = pr.mergedAt === null ? null : new Date(pr.mergedAt);
  // GitHub sets `closed_at` on a merge too -- this table's own `closedAt`
  // means "closed WITHOUT merging" (see the migration's comment on the
  // column), so a merge suppresses it here rather than carrying both.
  const closedAt =
    mergedAt !== null || pr.closedAt === null ? null : new Date(pr.closedAt);

  const [existing] = await database
    .select({ id: competitionEntries.id })
    .from(competitionEntries)
    .where(eq(competitionEntries.prNodeId, pr.nodeId))
    .limit(1);

  // An entry opened after the competition's issue closed does not count --
  // but only at CREATION. An entry already on the mirror keeps its history
  // even if the competition's `closedAt` moves (a reopen-then-reclose with a
  // different date, say); this only ever refuses to plant a new row.
  if (
    !existing &&
    competition.closedAt !== null &&
    openedAt >= competition.closedAt
  ) {
    return;
  }

  await database
    .insert(competitionEntries)
    .values({
      competitionId: competition.id,
      teamId: team.id,
      prNodeId: pr.nodeId,
      prNumber: pr.number,
      url: pr.url,
      openedAt,
      mergedAt,
      closedAt,
    })
    .onConflictDoUpdate({
      target: competitionEntries.prNodeId,
      set: {
        competitionId: competition.id,
        teamId: team.id,
        prNumber: pr.number,
        url: pr.url,
        openedAt,
        mergedAt,
        closedAt,
      },
    });
}

// ── The nightly reconcile backstop ──────────────────────────────────────────

/** What `reconcileEntries` needs from GitHub: every pull request currently
 *  targeting `main` in the competition repo, open or closed, most-recently
 *  updated first (REST's default sort) so the pass is useful even if it is
 *  ever bounded to the first page. */
export interface EntriesGithubClient {
  pullRequestsIntoMain(): Promise<PullRequestFields[]>;
}

function liveGithubClient(): EntriesGithubClient {
  return {
    async pullRequestsIntoMain() {
      const prs = await octokit().paginate(octokit().rest.pulls.list, {
        owner: env.GITHUB_ORG,
        repo: env.GITHUB_COMPETITION_REPO,
        base: "main",
        state: "all",
        per_page: 100,
      });
      return prs.map((pr) => ({
        nodeId: pr.node_id,
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        body: pr.body,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        createdAt: pr.created_at,
        mergedAt: pr.merged_at,
        closedAt: pr.closed_at,
      }));
    },
  };
}

export interface EntryReconcileReport {
  checked: number;
  anomalies: string[];
}

/**
 * Re-derives entries from GitHub's own PR list. Nightly, alongside
 * `reconcileTeams` and `reconcileCompetitions` -- see `/cron/github-reconcile`.
 *
 * A backstop, not the mechanism: `server/github/prEvent.ts`'s webhook
 * handler applies a PR's state the moment GitHub reports it changed. This
 * exists for a missed or failed delivery -- the same gap `reconcileTeams`
 * closes for team membership. Every PR into `main` is re-applied
 * unconditionally, the same "page through everything, every night" shape
 * `reconcileCompetitions` uses for the Project -- `applyPullRequest` is
 * cheap and idempotent, and a PR against a closed competition is already a
 * no-op inside it (see that function's own comment), so there is nothing to
 * gain by trying to narrow the PR list down first.
 */
export async function reconcileEntries(
  database: typeof db,
  github: EntriesGithubClient = liveGithubClient(),
): Promise<EntryReconcileReport> {
  const report: EntryReconcileReport = { checked: 0, anomalies: [] };

  const prs = await github.pullRequestsIntoMain();
  for (const pr of prs) {
    report.checked += 1;
    try {
      await applyPullRequest(database, pr);
    } catch (error) {
      report.anomalies.push(
        `PR #${pr.number}: reconcile failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  if (report.anomalies.length > 0) {
    await postAlert(
      "Nightly competition-entry reconcile found drift",
      report.anomalies,
    );
  }

  return report;
}
