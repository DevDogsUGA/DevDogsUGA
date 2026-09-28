import { and, count, eq, isNull, sql } from "drizzle-orm";
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
import { postAlert } from "../alerts";
import { MAX_CONCURRENT_TEAMS_PER_USER, MAX_TEAM_SIZE } from "../teams/limits";
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
 * Adding teammates to `someone/DevDogsUGA` needs that student's
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

/**
 * The reverse of `githubLoginFor`: the platform account, if any, linked to a
 * GitHub login.
 *
 * The webhook route and the nightly reconcile are the callers. A
 * `membership` event, and a GitHub team's member list, both carry a GitHub
 * login -- GitHub has no notion of this platform's user ids -- so mapping
 * either back onto a mirror row starts here. Matched case-insensitively
 * against the same three keys `githubLoginFor` reads, because GitHub logins
 * are themselves case-insensitive and `identity_data` was captured once, at
 * whatever casing that sign-in happened to return.
 *
 * A login this returns null for is not necessarily a stranger to the club --
 * it can be a member who linked some other way, or never linked GitHub at
 * all. The caller's job either way is to skip the mirror write it cannot
 * attribute and report it, not to treat this as an error.
 */
export async function userIdForGithubLogin(
  login: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: identitiesInAuth.userId })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.provider, "github"),
        sql`lower(${identitiesInAuth.identityData} ->> 'user_name') = lower(${login})
          or lower(${identitiesInAuth.identityData} ->> 'preferred_username') = lower(${login})
          or lower(${identitiesInAuth.identityData} ->> 'login') = lower(${login})`,
      ),
    )
    .limit(1);

  return row?.userId ?? null;
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

/**
 * What the nightly reconcile needs to read from GitHub, and the one GitHub
 * write it may make.
 *
 * A narrow interface, not `octokit()` passed straight through: the only
 * thing a db-test can convincingly fake is a small, closed set of methods
 * with meanings this file defines, not an actual Octokit instance and its
 * hundreds of endpoints. `liveGithubClient` is the sole production
 * implementation and the only thing in this section that touches the
 * network -- everything below it is plain logic over whatever `teamMembers`
 * / `branchExists` / `rulesetExists` report, which is what makes it
 * testable against a real database with a fake client instead of either
 * hitting the network or mocking this whole module the way the actions
 * layer's tests do.
 */
export interface ReconcileGithubClient {
  /**
   * Lowercased logins of a GitHub team's current members, or null if the
   * GitHub team itself does not exist (a 404 on the members list).
   */
  teamMembers(githubTeamSlug: string): Promise<string[] | null>;
  /** Whether a branch currently exists. */
  branchExists(branch: string): Promise<boolean>;
  /** Whether a team's ruleset currently exists, by the name `rulesets.ts` gives it. */
  rulesetExists(teamSlug: string): Promise<boolean>;
  /** Re-provisions the team/branch/ruleset trio. Idempotent -- see `provisionTeam`. */
  provisionTeam(teamSlug: string): Promise<GithubResult>;
}

function liveGithubClient(): ReconcileGithubClient {
  const api = octokit();
  return {
    async teamMembers(slug) {
      try {
        const members = await api.paginate(api.rest.teams.listMembersInOrg, {
          org: org(),
          team_slug: slug,
          per_page: 100,
        });
        return members.map((member) => member.login.toLowerCase());
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async branchExists(branch) {
      try {
        await api.rest.git.getRef({
          owner: org(),
          repo: repo(),
          ref: `heads/${branch}`,
        });
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async rulesetExists(teamSlug) {
      const { data } = await api.rest.repos.getRepoRulesets({
        owner: org(),
        repo: repo(),
      });
      return data.some((ruleset) => ruleset.name === teamRulesetName(teamSlug));
    },
    provisionTeam,
  };
}

export interface ReconcileReport {
  teamsChecked: number;
  /** Mirror rows opened because GitHub already granted access the mirror did not know about. */
  added: number;
  /** Mirror rows closed because GitHub no longer grants access the mirror still claimed. */
  removed: number;
  /** Branch and/or ruleset (and, rarely, the GitHub team itself) recreated for a team whose GitHub side had gone missing. */
  provisioned: number;
  /** GitHub team members with no linked platform identity -- reported, never repaired. */
  unmatched: number;
  /** Everything reported to Sentry this run: unmatched logins, cap overruns, API failures. */
  anomalies: string[];
}

function emptyReport(): ReconcileReport {
  return {
    teamsChecked: 0,
    added: 0,
    removed: 0,
    provisioned: 0,
    unmatched: 0,
    anomalies: [],
  };
}

/**
 * Repairs the mirror against GitHub. Nightly.
 *
 * A backstop, not the mechanism: every membership change already writes
 * GitHub first and the mirror second, at the moment it happens (see
 * `server/actions/teams.ts`), and the webhook route
 * (`server/github/webhookEvents.ts`) closes most of the remaining gap
 * between "GitHub changed" and "the mirror knows" in near-real time. This
 * exists for what neither of those reaches: a webhook delivery GitHub never
 * made (an App outage, the route down at the wrong moment), or a change made
 * directly on GitHub the platform was never told about at all -- someone
 * added to a GitHub team by hand, a branch or ruleset deleted from the
 * GitHub UI.
 *
 * **GitHub wins.** Unlike the pre-mirror version of this pass, which pushed
 * `teamMembers` onto GitHub, this reads GitHub's state and writes it INTO
 * the mirror -- GitHub is the source of truth for who can actually push, and
 * the mirror is not permitted to claim access it does not confer. A GitHub
 * login on the team with no active mirror row gets one; an active mirror row
 * with no matching GitHub login gets closed, `leftAt = now()`, the same as
 * an ordinary leave. Nobody is EVER kicked off GitHub by this pass -- a
 * member over `MAX_CONCURRENT_TEAMS_PER_USER`, or a team over
 * `MAX_TEAM_SIZE`, because someone was added directly on GitHub is a fact
 * this pass mirrors and reports to Sentry, not a violation it enforces. The
 * caps are enforced going forward, in `requireCanJoin`, on the platform's
 * own join path; they were never a promise about what GitHub itself would
 * allow.
 *
 * Both `db` and the GitHub client are injected, defaulting to the real
 * ones, so a db-test can run this against a real database with a fake
 * client instead of either hitting the network or mocking the module.
 */
export async function reconcileTeams(
  database: typeof db = db,
  github: ReconcileGithubClient = liveGithubClient(),
): Promise<ReconcileReport> {
  const report = emptyReport();

  const rows = await database
    .select({ id: teams.id, slug: teams.slug })
    .from(teams);

  for (const row of rows) {
    report.teamsChecked += 1;
    try {
      await reconcileOneTeam(database, github, row, report);
    } catch (error) {
      // A team can be disbanded by an ordinary platform action WHILE this
      // pass is mid-flight on it -- there is no lock over the whole nightly
      // run, and there should not be one, since holding every team locked
      // for the duration of a run touching the whole club would make an
      // unrelated member's disband wait on it. Whatever failed here (most
      // often the row vanishing between this team's read and its later
      // write, or a GitHub call failing outright) is this ONE team's
      // problem, not every other team's: caught, reported, and the loop
      // moves on rather than a mid-run failure losing every team after it.
      report.anomalies.push(
        `${row.slug}: reconcile failed (${describe(error)})`,
      );
    }
  }

  if (report.anomalies.length > 0) {
    await postAlert("Nightly team reconcile found drift", report.anomalies);
  }

  return report;
}

/**
 * One team's share of `reconcileTeams`. Throws on any failure -- reading
 * GitHub, or a database write racing a concurrent disband -- and leaves
 * catching it to the caller, which is what turns "this team's reconcile
 * failed" into "one more anomaly" instead of "the whole nightly pass
 * aborted here and every team after this one in `rows` was never checked".
 */
async function reconcileOneTeam(
  database: typeof db,
  github: ReconcileGithubClient,
  row: { id: string; slug: string },
  report: ReconcileReport,
): Promise<void> {
  const slug = row.slug;

  const members = await github.teamMembers(githubTeamSlug(slug));
  const branchOk = await github.branchExists(teamBranch(slug));
  const rulesetOk = await github.rulesetExists(slug);

  if (members === null || !branchOk || !rulesetOk) {
    const missing = [
      members === null && "GitHub team",
      !branchOk && "branch",
      !rulesetOk && "ruleset",
    ].filter((piece): piece is string => piece !== false);
    report.anomalies.push(`${slug}: recreating missing ${missing.join("/")}`);

    const result = await github.provisionTeam(slug);
    if (result.ok) report.provisioned += 1;
    else
      report.anomalies.push(
        `${slug}: reprovisioning failed (${result.detail ?? result.skipped})`,
      );
  }

  if (members === null) {
    // The GitHub team itself was gone, so nobody the mirror currently marks
    // active actually has push access any more -- reprovisioning above made
    // a new, empty GitHub team, it did not restore the old membership,
    // because there is no record left on GitHub of who that was. Closing
    // every active row here is the mirror catching up to a roster GitHub
    // had already emptied, not a second way to remove someone. Re-inviting
    // goes through the platform's own join path, which grants GitHub
    // first, same as always.
    const closed = await database
      .update(teamMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)))
      .returning({ id: teamMembers.id });
    report.removed += closed.length;

    await database
      .update(teams)
      .set({ githubSyncedAt: new Date() })
      .where(eq(teams.id, row.id));
    return;
  }

  const live = new Set(members);

  // What the mirror currently believes, as login -> userId, so the two sets
  // can be diffed by login (what GitHub actually speaks) while still
  // knowing which platform account each row belongs to.
  const roster = await database
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)));

  const mirrored = new Map<string, string>();
  for (const member of roster) {
    const login = await githubLoginFor(member.userId);
    if (login) mirrored.set(login.toLowerCase(), member.userId);
  }

  // Every login GitHub still reports live, resolved to a platform userId --
  // whether that row already existed in the mirror or gets inserted below --
  // so the per-user cap check after this loop can walk every currently-active
  // member, not only the ones this pass happened to insert.
  const activeUserIds: string[] = [];
  for (const login of live) {
    const existingUserId = mirrored.get(login);
    if (existingUserId) {
      activeUserIds.push(existingUserId);
      continue;
    }
    const userId = await userIdForGithubLogin(login);
    if (!userId) {
      report.unmatched += 1;
      report.anomalies.push(
        `${slug}: GitHub member "${login}" has no linked platform identity`,
      );
      continue;
    }
    await database
      .insert(teamMembers)
      .values({ teamId: row.id, userId, role: "member" });
    report.added += 1;
    activeUserIds.push(userId);
  }

  for (const [login, userId] of mirrored) {
    if (live.has(login)) continue;
    await database
      .update(teamMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMembers.teamId, row.id),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      );
    report.removed += 1;
  }

  // Cap anomalies, both recomputed unconditionally every pass over the FULL
  // active roster, not just what this pass happened to touch -- a membership
  // already flagged on a previous night stays flagged every night until
  // somebody leaves, which is the point: this is a standing report of drift,
  // not a one-time notice. (A per-user check scoped to only this pass's
  // insertions would stop reporting a hand-added member from the second
  // night onward, once they were no longer new.)
  const [teamSize] = await database
    .select({ n: count() })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)));
  if ((teamSize?.n ?? 0) > MAX_TEAM_SIZE) {
    report.anomalies.push(
      `${slug}: ${teamSize?.n} active members, over the ${MAX_TEAM_SIZE}-member cap`,
    );
  }

  for (const userId of activeUserIds) {
    const [userTeams] = await database
      .select({ n: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)));
    if ((userTeams?.n ?? 0) > MAX_CONCURRENT_TEAMS_PER_USER) {
      report.anomalies.push(
        `${slug}: member ${userId} is active on ${userTeams?.n} teams, over the ${MAX_CONCURRENT_TEAMS_PER_USER}-team cap`,
      );
    }
  }

  await database
    .update(teams)
    .set({ githubSyncedAt: new Date() })
    .where(eq(teams.id, row.id));
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
