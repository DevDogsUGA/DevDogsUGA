import { Octokit } from "@octokit/rest";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { competitions, teamMembers, teams } from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import { githubTeamSlug, integrationBranch, teamBranch } from "./naming";

/**
 * Repository access for competition teams.
 *
 * **Every function here fires on the platform event itself, never on a
 * schedule.** A member who joins on Tuesday can push on Tuesday; routing that
 * through the nightly pass would make it a nightly promise. `reconcileTeams`
 * exists because GitHub's API can fail and a membership change that silently
 * did not apply is invisible until somebody cannot push — it closes that gap
 * rather than being the mechanism.
 *
 * Teams get a branch in the org rather than a fork, for one decisive reason:
 * you cannot automate collaborator grants on a student's personal fork.
 * Adding teammates to `someone/DevDogs-Website` needs that student's
 * personal-account admin, which the org's token has no reach into.
 */

let client: Octokit | null = null;

function octokit(): Octokit {
  client ??= new Octokit({ auth: env.GITHUB_TOKEN });
  return client;
}

const org = () => env.GITHUB_ORG;
const repo = () => env.GITHUB_COMPETITION_REPO;

/** Why a GitHub operation did not happen, in terms a caller can act on. */
export type GithubSkip =
  | "not_linked"
  | "already_exists"
  | "not_found"
  | "api_error";

export interface GithubResult {
  ok: boolean;
  skipped?: GithubSkip;
  detail?: string;
}

function failed(skipped: GithubSkip, detail?: string): GithubResult {
  return { ok: false, skipped, ...(detail === undefined ? {} : { detail }) };
}

/**
 * The GitHub login on a member's linked identity.
 *
 * Read from `auth.identities` rather than stored on the profile, so it cannot
 * go stale relative to what the user actually signed in with. Supabase's
 * GitHub provider puts the login in `identity_data.user_name`; `preferred_username`
 * is checked as a fallback because the key has changed across provider
 * versions and a null here is indistinguishable from "never linked".
 */
export async function githubLoginFor(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ data: identitiesInAuth.identityData })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.userId, userId),
        eq(identitiesInAuth.provider, "github"),
      ),
    );

  if (!row) return null;

  const data = row.data as Record<string, unknown>;
  for (const key of ["user_name", "preferred_username", "login"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

// ── Provisioning ─────────────────────────────────────────────────────────────

interface TeamContext {
  teamId: string;
  teamSlug: string;
  competitionSlug: string;
}

async function contextFor(teamId: string): Promise<TeamContext | null> {
  const [row] = await db
    .select({
      teamId: teams.id,
      teamSlug: teams.slug,
      competitionSlug: competitions.slug,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .where(eq(teams.id, teamId));

  return row ?? null;
}

/**
 * Creates the GitHub team, grants it push, and cuts its branch.
 *
 * Ordered so a partial failure leaves the least broken state: the team and its
 * grant come first, because a team that exists without a branch is a team
 * whose members can push once somebody cuts one, while a branch that exists
 * with nobody able to push to it is a dead end.
 *
 * Idempotent. Every step treats "already there" as success — re-running after
 * a partial failure is the recovery path, and it is also what the reconcile
 * pass does.
 */
export async function provisionTeam(teamId: string): Promise<GithubResult> {
  const ctx = await contextFor(teamId);
  if (!ctx) return failed("not_found", `No team ${teamId}`);

  const slug = githubTeamSlug(ctx.competitionSlug, ctx.teamSlug);
  const api = octokit();

  try {
    await api.rest.teams.create({
      org: org(),
      name: slug,
      // `closed` rather than `secret`: members need to see that the team
      // exists to understand why they have access, and a secret team is
      // invisible to its own members in the org UI.
      privacy: "closed",
      description: `Competition team for ${ctx.competitionSlug}`,
    });
  } catch (error) {
    if (!isAlreadyExists(error)) {
      return failed("api_error", describe(error));
    }
  }

  try {
    await api.rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: org(),
      team_slug: slug,
      owner: org(),
      repo: repo(),
      permission: "push",
    });
  } catch (error) {
    return failed("api_error", describe(error));
  }

  return cutTeamBranch(ctx);
}

/**
 * Cuts the team branch from the competition's integration branch.
 *
 * From the integration branch and not from `main`: the team's first diff
 * should be against what they will PR into, or their PR opens showing every
 * commit the integration branch carries that `main` does not.
 */
async function cutTeamBranch(ctx: TeamContext): Promise<GithubResult> {
  const api = octokit();
  const base = integrationBranch(ctx.competitionSlug);
  const branch = teamBranch(ctx.competitionSlug, ctx.teamSlug);

  let sha: string;
  try {
    const { data } = await api.rest.git.getRef({
      owner: org(),
      repo: repo(),
      ref: `heads/${base}`,
    });
    sha = data.object.sha;
  } catch (error) {
    // The integration branch is created when the competition is set up, so its
    // absence is a competition-level problem rather than a team-level one —
    // worth naming precisely, because the fix is somewhere else entirely.
    return failed(
      "not_found",
      `Integration branch ${base} does not exist: ${describe(error)}`,
    );
  }

  try {
    await api.rest.git.createRef({
      owner: org(),
      repo: repo(),
      ref: `refs/heads/${branch}`,
      sha,
    });
  } catch (error) {
    if (!isAlreadyExists(error)) return failed("api_error", describe(error));
  }

  return { ok: true };
}

/**
 * Cuts the integration branch for a competition, from `main`.
 *
 * Separate from team provisioning and called when the competition is created,
 * because every team's branch is cut from this one — a competition whose
 * integration branch does not exist cannot provision any team at all.
 */
export async function provisionCompetitionBranch(
  competitionSlug: string,
): Promise<GithubResult> {
  const api = octokit();

  try {
    const { data: main } = await api.rest.git.getRef({
      owner: org(),
      repo: repo(),
      ref: "heads/main",
    });

    await api.rest.git.createRef({
      owner: org(),
      repo: repo(),
      ref: `refs/heads/${integrationBranch(competitionSlug)}`,
      sha: main.object.sha,
    });
  } catch (error) {
    if (isAlreadyExists(error)) return { ok: true };
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

// ── Membership ───────────────────────────────────────────────────────────────

/**
 * Adds a member to the GitHub team.
 *
 * A member without a linked GitHub identity cannot be added, and the join path
 * refuses rather than succeeding into a half-provisioned state where somebody
 * is on the roster and cannot push — see `github_not_linked` in the team
 * errors. This returns `not_linked` for the case where the link disappeared
 * between joining and the reconcile.
 */
export async function addMember(
  teamId: string,
  userId: string,
): Promise<GithubResult> {
  const ctx = await contextFor(teamId);
  if (!ctx) return failed("not_found", `No team ${teamId}`);

  const login = await githubLoginFor(userId);
  if (!login)
    return failed("not_linked", `User ${userId} has no GitHub identity`);

  try {
    await octokit().rest.teams.addOrUpdateMembershipForUserInOrg({
      org: org(),
      team_slug: githubTeamSlug(ctx.competitionSlug, ctx.teamSlug),
      username: login,
      role: "member",
    });
  } catch (error) {
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

export async function removeMember(
  teamId: string,
  userId: string,
): Promise<GithubResult> {
  const ctx = await contextFor(teamId);
  if (!ctx) return failed("not_found", `No team ${teamId}`);

  const login = await githubLoginFor(userId);
  // Nothing to remove: a member with no linked identity was never added.
  if (!login) return { ok: true };

  try {
    await octokit().rest.teams.removeMembershipForUserInOrg({
      org: org(),
      team_slug: githubTeamSlug(ctx.competitionSlug, ctx.teamSlug),
      username: login,
    });
  } catch (error) {
    if (isNotFound(error)) return { ok: true };
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

/**
 * Drops the team to read-only once its competition is over.
 *
 * Not a deletion. The branch, the PR and the history are the record of what
 * the team did, and a member should still be able to point at it a semester
 * later — what they lose is the ability to keep pushing to a competition that
 * has been judged.
 */
export async function downgradeTeam(teamId: string): Promise<GithubResult> {
  const ctx = await contextFor(teamId);
  if (!ctx) return failed("not_found", `No team ${teamId}`);

  try {
    await octokit().rest.teams.addOrUpdateRepoPermissionsInOrg({
      org: org(),
      team_slug: githubTeamSlug(ctx.competitionSlug, ctx.teamSlug),
      owner: org(),
      repo: repo(),
      permission: "pull",
    });
  } catch (error) {
    if (isNotFound(error)) return { ok: true };
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

// ── Reconcile ────────────────────────────────────────────────────────────────

export interface ReconcileReport {
  teamsChecked: number;
  added: number;
  removed: number;
  provisioned: number;
  unlinked: number;
  errors: string[];
}

/**
 * Repairs GitHub team membership against `teamMembers`. Nightly.
 *
 * A backstop, not the mechanism. Every membership change already fired at the
 * moment it happened; this catches the ones where the API call failed and
 * nobody found out, which is invisible until a member tries to push and
 * cannot.
 *
 * Scoped to teams whose competition has not been archived. A finished
 * competition's teams are history — reconciling them would re-add members to
 * a team that was deliberately downgraded, every night, forever.
 */
export async function reconcileTeams(): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    teamsChecked: 0,
    added: 0,
    removed: 0,
    provisioned: 0,
    unlinked: 0,
    errors: [],
  };

  const rows = await db
    .select({
      teamId: teams.id,
      teamSlug: teams.slug,
      competitionSlug: competitions.slug,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .where(and(isNull(competitions.deletedAt), isNull(teams.competedAt)));

  const api = octokit();

  for (const row of rows) {
    report.teamsChecked += 1;
    const slug = githubTeamSlug(row.competitionSlug, row.teamSlug);

    let live: Set<string>;
    try {
      const members = await api.paginate(api.rest.teams.listMembersInOrg, {
        org: org(),
        team_slug: slug,
        per_page: 100,
      });
      live = new Set(members.map((m) => m.login.toLowerCase()));
    } catch (error) {
      if (isNotFound(error)) {
        // The team itself never got created. Provisioning is idempotent, so
        // this is the same call the join path makes — re-running it is the
        // whole recovery path.
        const result = await provisionTeam(row.teamId);
        if (result.ok) report.provisioned += 1;
        else report.errors.push(`${slug}: ${result.detail ?? result.skipped}`);
        continue;
      }
      report.errors.push(`${slug}: ${describe(error)}`);
      continue;
    }

    const roster = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, row.teamId));

    const expected = new Set<string>();
    for (const member of roster) {
      const login = await githubLoginFor(member.userId);
      if (!login) {
        report.unlinked += 1;
        continue;
      }
      expected.add(login.toLowerCase());

      if (!live.has(login.toLowerCase())) {
        const result = await addMember(row.teamId, member.userId);
        if (result.ok) report.added += 1;
        else
          report.errors.push(
            `${slug}/${login}: ${result.detail ?? result.skipped}`,
          );
      }
    }

    for (const login of live) {
      if (expected.has(login)) continue;
      try {
        await api.rest.teams.removeMembershipForUserInOrg({
          org: org(),
          team_slug: slug,
          username: login,
        });
        report.removed += 1;
      } catch (error) {
        report.errors.push(`${slug}/${login}: ${describe(error)}`);
      }
    }
  }

  return report;
}

// ── Error shapes ─────────────────────────────────────────────────────────────

function status(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : null;
}

/**
 * GitHub answers "this already exists" with 422 on ref creation and with 422
 * on team creation, so both provisioning steps treat it as success. Anything
 * else at 422 is a genuinely malformed request and must not be swallowed —
 * hence the message check rather than the status alone.
 */
function isAlreadyExists(error: unknown): boolean {
  if (status(error) !== 422) return false;
  const message = describe(error).toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("name must be unique")
  );
}

function isNotFound(error: unknown): boolean {
  return status(error) === 404;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
