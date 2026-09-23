import { and, eq, isNull } from "drizzle-orm";
import { env } from "~/env";
// Extensionless like every other import in this app: tsc under bundler
// resolution tolerates a `.js` suffix on a `.ts` source, but Turbopack's
// production build does not resolve it. This line was the only one in the app
// written NodeNext-style, and it broke `next build` invisibly for weeks,
// because nothing runs a production build between pushes.
import { octokit } from "./client";
import { db } from "~/server/db";
import { teamMembers, teams } from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import { githubTeamSlug, teamBranch } from "./naming";
import { teamRulesetName, teamRulesetPayload } from "./rulesets";

/**
 * Repository access for teams.
 *
 * A team IS a branch, `team/<slug>` off `main`; membership IS push access to
 * it, granted through a GitHub team and the ruleset in `rulesets.ts`.
 * Postgres's `teams`/`teamMembers` are a MIRROR of this, not the source of
 * truth -- see `server/actions/teams.ts`, which writes GitHub first and the
 * mirror second.
 *
 * **Every function here fires on the platform event itself, never on a
 * schedule.** A member who joins on Tuesday can push on Tuesday; routing that
 * through the nightly pass would make it a nightly promise. `reconcileTeams`
 * exists because GitHub's API can fail and a membership change that silently
 * did not apply is invisible until somebody cannot push. It closes that gap
 * rather than being the mechanism.
 *
 * Teams get a branch in the org rather than a fork, for one decisive reason:
 * you cannot automate collaborator grants on a student's personal fork.
 * Adding teammates to `someone/DevDogs-Website` needs that student's
 * personal-account admin, which the org's token has no reach into.
 *
 * Keyed by SLUG, not by the mirror's `teamId`, throughout this file. Every
 * GitHub name derives from the slug alone (see `naming.ts`), so a function
 * that only talks to GitHub has no need of the mirror's id, and callers that
 * already have the slug (the actions layer, mid-transaction, before a row
 * exists to look up) are not forced through a database round-trip to get one.
 */

const org = () => env.GITHUB_ORG;
const repo = () => env.GITHUB_COMPETITION_REPO;

/** Why a GitHub operation did not happen, in terms a caller can act on. */
export type GithubSkip =
  "not_linked" | "already_exists" | "not_found" | "api_error";

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

/**
 * Creates the GitHub team, grants it push, and cuts its branch.
 *
 * Ordered so a partial failure leaves the least broken state: the team and its
 * grant come first, because a team that exists without a branch is a team
 * whose members can push once somebody cuts one, while a branch that exists
 * with nobody able to push to it is a dead end.
 *
 * Idempotent. Every step treats "already there" as success, because
 * re-running after a partial failure is the recovery path, and it is what the
 * reconcile pass does.
 */
export async function provisionTeam(teamSlug: string): Promise<GithubResult> {
  const slug = githubTeamSlug(teamSlug);
  const api = octokit();

  // The numeric id, not the slug. The ruleset's bypass actor needs it, since
  // `actor_type: "Team"` takes an id and nothing else, and the create response
  // is the cheapest place to get it. The `already_exists` path costs one extra
  // request because re-provisioning is the recovery path and has to reach the
  // same end state.
  let githubTeamId: number;
  try {
    const { data } = await api.rest.teams.create({
      org: org(),
      name: slug,
      // `closed` rather than `secret`: members need to see that the team
      // exists to understand why they have access, and a secret team is
      // invisible to its own members in the org UI.
      privacy: "closed",
      description: `DevDogs team: ${teamSlug}`,
    });
    githubTeamId = data.id;
  } catch (error) {
    if (!isAlreadyExists(error)) {
      return failed("api_error", describe(error));
    }
    try {
      const { data } = await api.rest.teams.getByName({
        org: org(),
        team_slug: slug,
      });
      githubTeamId = data.id;
    } catch (lookupError) {
      return failed("api_error", describe(lookupError));
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

  const branch = await cutTeamBranch(teamSlug);
  if (!branch.ok) return branch;

  // AFTER the branch exists. The ruleset's `update` rule governs pushes to an
  // existing ref; creating it first would restrict a ref that is not there yet
  // and leave the branch cut under a rule nobody had reviewed.
  return ensureTeamRuleset(teamSlug, githubTeamId);
}

/**
 * The ruleset that turns a repository-wide `push` grant into one branch.
 *
 * Without this, provisioning is actively harmful: the team grant above is
 * repository-wide because GitHub team permissions have no branch dimension, so
 * every team can push to every other team's branch. This is the only thing
 * that narrows it.
 *
 * Idempotent by name, because rulesets are addressed by a numeric id nothing
 * here stores and `createRepoRuleset` does NOT reject a duplicate name. A
 * blind create on the recovery path would leave two rulesets over one branch,
 * both enforcing, and removing either would look like it fixed the problem.
 */
async function ensureTeamRuleset(
  teamSlug: string,
  githubTeamId: number,
): Promise<GithubResult> {
  const api = octokit();
  const payload = teamRulesetPayload(teamSlug, githubTeamId);

  let existingId: number | undefined;
  try {
    const { data } = await api.rest.repos.getRepoRulesets({
      owner: org(),
      repo: repo(),
    });
    existingId = data.find((r) => r.name === payload.name)?.id;
  } catch (error) {
    return failed("api_error", describe(error));
  }

  try {
    if (existingId === undefined) {
      await api.rest.repos.createRepoRuleset({
        owner: org(),
        repo: repo(),
        ...payload,
      });
    } else {
      // Update rather than skip: a ruleset carrying a STALE bypass actor is the
      // dangerous case. If the GitHub team was deleted and recreated its id
      // changed, and the ruleset would then be blocking the team it is named
      // for while letting whoever inherited the old id through.
      await api.rest.repos.updateRepoRuleset({
        owner: org(),
        repo: repo(),
        ruleset_id: existingId,
        ...payload,
      });
    }
  } catch (error) {
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

/**
 * Cuts the team branch from `main`.
 *
 * From `main`, not from a shared integration branch: teams are persistent and
 * competition-independent now, so there is no per-week branch to fork from.
 * The team's first diff is against the same `main` its eventual pull request
 * targets.
 */
async function cutTeamBranch(teamSlug: string): Promise<GithubResult> {
  const api = octokit();
  const branch = teamBranch(teamSlug);

  let sha: string;
  try {
    const { data } = await api.rest.git.getRef({
      owner: org(),
      repo: repo(),
      ref: "heads/main",
    });
    sha = data.object.sha;
  } catch (error) {
    return failed("api_error", describe(error));
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

// ── Membership ───────────────────────────────────────────────────────────────

/**
 * Adds a member to the GitHub team.
 *
 * A member without a linked GitHub identity cannot be added, so the join path
 * refuses rather than succeeding into a half-provisioned state where somebody
 * is on the roster and cannot push. See `github_not_linked` in the team
 * errors. This returns `not_linked` for the case where the link disappeared
 * between joining and the reconcile.
 */
export async function addMember(
  teamSlug: string,
  userId: string,
): Promise<GithubResult> {
  const login = await githubLoginFor(userId);
  if (!login)
    return failed("not_linked", `User ${userId} has no GitHub identity`);

  try {
    await octokit().rest.teams.addOrUpdateMembershipForUserInOrg({
      org: org(),
      team_slug: githubTeamSlug(teamSlug),
      username: login,
      role: "member",
    });
  } catch (error) {
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

export async function removeMember(
  teamSlug: string,
  userId: string,
): Promise<GithubResult> {
  const login = await githubLoginFor(userId);
  // Nothing to remove: a member with no linked identity was never added.
  if (!login) return { ok: true };

  try {
    await octokit().rest.teams.removeMembershipForUserInOrg({
      org: org(),
      team_slug: githubTeamSlug(teamSlug),
      username: login,
    });
  } catch (error) {
    if (isNotFound(error)) return { ok: true };
    return failed("api_error", describe(error));
  }

  return { ok: true };
}

/**
 * Tears a disbanded team's GitHub presence down: the ruleset, then the team.
 *
 * Not the branch. The branch, and any pull request opened from it, is the
 * record of what the team did, and a member should still be able to point at
 * it after the team that made it no longer exists.
 *
 * Order is deliberate and is the opposite of provisioning's "grant, then
 * restrict": here it is "revoke, then unrestrict". Deleting the GitHub team
 * first means a crash between the two steps leaves the branch governed by a
 * ruleset whose bypass actor no longer resolves to anybody -- nobody can push,
 * which is safe. Deleting the ruleset first would leave the branch open to
 * every OTHER team's repository-wide `push` grant while this team's members
 * (whose GitHub team still exists) can also still push to it, which is not.
 */
export async function disbandTeam(teamSlug: string): Promise<GithubResult> {
  const api = octokit();

  try {
    await api.rest.teams.deleteInOrg({
      org: org(),
      team_slug: githubTeamSlug(teamSlug),
    });
  } catch (error) {
    if (!isNotFound(error)) return failed("api_error", describe(error));
  }

  let rulesetId: number | undefined;
  try {
    const { data } = await api.rest.repos.getRepoRulesets({
      owner: org(),
      repo: repo(),
    });
    rulesetId = data.find((r) => r.name === teamRulesetName(teamSlug))?.id;
  } catch (error) {
    return failed("api_error", describe(error));
  }

  if (rulesetId !== undefined) {
    try {
      await api.rest.repos.deleteRepoRuleset({
        owner: org(),
        repo: repo(),
        ruleset_id: rulesetId,
      });
    } catch (error) {
      if (!isNotFound(error)) return failed("api_error", describe(error));
    }
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

  const rows = await db.select({ id: teams.id, slug: teams.slug }).from(teams);

  const api = octokit();

  for (const row of rows) {
    report.teamsChecked += 1;
    const slug = githubTeamSlug(row.slug);

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
        // this is the same call the join path makes, and re-running it is the
        // whole recovery path.
        const result = await provisionTeam(row.slug);
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
      .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)));

    const expected = new Set<string>();
    for (const member of roster) {
      const login = await githubLoginFor(member.userId);
      if (!login) {
        report.unlinked += 1;
        continue;
      }
      expected.add(login.toLowerCase());

      if (!live.has(login.toLowerCase())) {
        const result = await addMember(row.slug, member.userId);
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
 * GitHub answers "this already exists" with 422 on ref creation and on team
 * creation, so both provisioning steps treat it as success. Anything else at
 * 422 is a malformed request and must not be swallowed, hence the message check
 * rather than the status alone.
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
