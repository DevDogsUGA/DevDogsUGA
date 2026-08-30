import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { competitions, teams } from "~/server/db/schema";
import { isEntryBase, isTeamHead } from "./naming";
import {
  parseTeamBranch,
  stateFor,
  type PullRequestEvent,
  type PullRequestOutcome,
} from "./prEvent";

/**
 * The PR half of the entry state machine.
 *
 * The team's PR against the competition's integration branch **is** the entry,
 * and it drives both the roster lock and the competition star. The webhook
 * only mirrors GitHub's view of the PR. Every time-dependent consequence,
 * whether the roster is locked and whether a star was earned, is derived from
 * `submissionState` elsewhere rather than decided here.
 *
 * That separation is what makes this handler safe to replay: it is a
 * projection of GitHub's current state, not an event log.
 */

/**
 * Applies a PR event to the team it belongs to.
 *
 * The team is resolved from the HEAD ref and the entry is validated against
 * the BASE ref, which is the pairing that matters: a `team/...` head tells you
 * whose PR it is, and only the base tells you whether it is an entry at all.
 */
export async function applyPullRequestEvent(
  event: PullRequestEvent,
): Promise<PullRequestOutcome> {
  const state = stateFor(event);
  if (state === null) return { applied: false, reason: "ignored_action" };

  const parsed = parseTeamBranch(event.headRef);
  if (!parsed) return { applied: false, reason: "not_a_team_branch" };

  const [row] = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      competedAt: teams.competedAt,
      competitionSlug: competitions.slug,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .where(
      and(
        eq(teams.slug, parsed.teamSlug),
        eq(competitions.slug, parsed.competitionSlug),
      ),
    );

  if (!row) return { applied: false, reason: "unknown_team" };

  if (!isEntryBase(event.baseRef, row.competitionSlug)) {
    // A PR against `main` by mistake, or against another week's branch. Not an
    // entry, and deliberately not an error: opening one is a normal mistake.
    return { applied: false, reason: "wrong_base" };
  }

  if (!isTeamHead(event.headRef, row.competitionSlug, row.slug)) {
    return { applied: false, reason: "not_a_team_branch" };
  }

  // Participation is frozen. `competedAt` turned a live entry into a permanent
  // fact, and nothing GitHub does afterwards may undo it: closing the PR the
  // evening after judging must not cost the team its star. The submission state
  // still advances so the record stays accurate, but it no longer decides
  // anything.
  const frozen = row.competedAt !== null;

  // The entry triple moves together or not at all.
  //
  // `teams_submission_url_state_together` and
  // `teams_submission_url_submittedAt_together` require all three of
  // `submissionUrl`, `submissionState` and `submittedAt` to be null or all
  // three set. Stamping `submittedAt` only on `opened` looks right and is not:
  // the first event this handler sees need not be `opened` at all. A webhook
  // that was down when the PR was created, a hook added to an existing repo, or
  // a redelivery replayed out of order all deliver `closed` or `merged` first.
  // That write would set two of the three, the constraint would reject it, and
  // the entry would never register.
  //
  // `coalesce` rather than a conditional: it fills the gap on a first-seen
  // close and preserves the original time on a reopen, which is what "when this
  // team first entered" should mean.
  await db
    .update(teams)
    .set({
      submissionState: state,
      submissionUrl: event.htmlUrl,
      submittedAt: sql`coalesce(${teams.submittedAt}, now())`,
    })
    .where(eq(teams.id, row.id));

  return frozen
    ? { applied: false, reason: "competed" }
    : { applied: true, teamId: row.id, state };
}
