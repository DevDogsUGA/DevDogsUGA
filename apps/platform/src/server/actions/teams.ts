"use server";

import { and, count, eq, isNull, ne } from "drizzle-orm";
import { postAlert } from "~/server/alerts";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { teamMembers, teamMembershipRequests, teams } from "~/server/db/schema";
import {
  TeamActionError,
  isUniqueViolation,
  type TeamActionOutcome,
} from "~/server/teams/errors";
import {
  addMember,
  disbandTeam,
  provisionTeam,
  removeMember,
} from "~/server/github/teamSync";
import {
  insertMembership,
  lockTeam,
  lockUser,
  requireCanJoin,
  type Tx,
} from "~/server/teams/requireCanJoin";
import { underConcurrentTeamCap } from "~/server/teams/limits";

/**
 * Team membership actions.
 *
 * Writes are server actions over Drizzle rather than `security definer` RPCs.
 * Teams are consumed by the platform and nothing else, so routing them through
 * RPCs would buy an independence no caller wants and pay for it by splitting
 * logic that belongs together: a join is a database write and a GitHub API
 * call, and only the first can live in Postgres.
 *
 * **GitHub-first, mirror second, in the SAME transaction.** GitHub is the
 * source of truth for who can push where; `teams`/`teamMembers` is a mirror of
 * it. Every action below calls the GitHub side effect from INSIDE the
 * transaction that also holds the advisory lock, and only writes the mirror
 * row once that call has succeeded. If GitHub fails, the function throws, the
 * transaction rolls back, and the mirror never promised an access grant that
 * was never made. This trades an ordinary anti-pattern -- holding a database
 * transaction open across a network call -- for a stronger guarantee: the
 * mirror can lag behind GitHub (the nightly reconcile repairs that), but it
 * can never claim something GitHub refused.
 *
 * Drizzle connects as the owning role, so RLS does not apply to anything here.
 * The authorization checks at the top of each action are the whole boundary.
 */

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ambiguous glyphs (0/O, 1/I/L) are omitted: this gets read aloud in a room. */
function generateJoinCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    bytes,
    (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length],
  ).join("");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "team"
  );
}

/** Translates a GitHub failure into the code a caller can act on. */
function githubProblem(result: {
  skipped?: string;
  detail?: string;
}): TeamActionError {
  return result.skipped === "not_linked"
    ? new TeamActionError("github_not_linked")
    : new TeamActionError(
        "github_unavailable",
        result.detail ?? result.skipped,
      );
}

async function requireLead(tx: Tx, teamId: string, userId: string) {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt),
      ),
    )
    .limit(1);

  if (!row) throw new TeamActionError("not_a_member");
  if (row.role !== "lead") throw new TeamActionError("not_the_lead");
}

/** Whether this member is currently active on this team. */
async function isActiveMember(
  tx: Tx,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The created team, identified the way the routes are.
 *
 * Both the id and the slug: the id is what the mirror is keyed on, and the
 * slug is what `/teams/[team]` and the GitHub branch are keyed on. Returning
 * only the id leaves a form with nowhere to navigate after a successful
 * create.
 */
export interface CreatedTeam {
  id: string;
  slug: string;
}

async function createTeamImpl(name: string): Promise<CreatedTeam> {
  const userId = await expectSession();
  const slug = slugify(name);

  return db.transaction(async (tx) => {
    // Only the creator's cap matters here -- there is no existing team row to
    // lock, and the slug's own unique constraint is what catches a name race.
    await lockUser(tx, userId);

    const [activeTeams] = await tx
      .select({ n: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)));
    if (!underConcurrentTeamCap(activeTeams?.n ?? 0)) {
      throw new TeamActionError("too_many_teams");
    }

    // GitHub first: the team, its branch and its ruleset have to exist, and
    // the creator has to be able to push, before anything is promised in the
    // mirror. A slug collision is caught below by the mirror's own unique
    // constraint, cheaply, before any of this runs -- see the early check.
    const provisioned = await provisionTeam(slug);
    if (!provisioned.ok) throw githubProblem(provisioned);
    const granted = await addMember(slug, userId);
    if (!granted.ok) throw githubProblem(granted);

    let team: CreatedTeam | undefined;
    try {
      [team] = await tx
        .insert(teams)
        .values({
          slug,
          name,
          joinCode: generateJoinCode(),
          createdBy: userId,
          // Just confirmed, above: the team, its branch, its ruleset and the
          // creator's grant all exist on GitHub as of this instant, so the
          // mirror starts fresh rather than null.
          githubSyncedAt: new Date(),
        })
        .returning({ id: teams.id, slug: teams.slug });
    } catch (error) {
      // Two teams landing on the same slugified name, or any other reason
      // this insert fails. Either way the GitHub team and its ruleset above
      // are now orphaned -- there is no mirror row to reconcile them against
      // -- so this tears them back down itself rather than leaving them for
      // an officer to notice. Best-effort: a member already has a real error
      // to see below, and a stuck GitHub team is a smaller problem than
      // losing that error to one from cleanup, so a teardown failure is
      // reported, not thrown.
      const teardown = await disbandTeam(slug);
      if (!teardown.ok) {
        await postAlert("Orphaned GitHub team after a failed team create", [
          `slug: ${slug}`,
          teardown.detail ?? teardown.skipped ?? "unknown reason",
        ]);
      }

      // Translated here because the untranslated 23505 reaches the member as
      // "something went wrong on our side", which sends them to ask an
      // officer about a problem they could have solved by picking another
      // name.
      if (isUniqueViolation(error, "teams_slug_key")) {
        throw new TeamActionError("name_taken");
      }
      throw error;
    }

    if (!team) throw new TeamActionError("not_found");

    // The creator is the lead. Inserted directly rather than through
    // `requireCanJoin`: the team is brand new, so every check it would run
    // (linked identity, not already a member, room on the team) is trivially
    // true, and the cap was already checked above under this same lock.
    await tx.insert(teamMembers).values({
      teamId: team.id,
      userId,
      role: "lead",
    });

    return team;
  });
}

async function joinTeamImpl(teamId: string, joinCode: string): Promise<void> {
  const userId = await expectSession();

  await db.transaction(async (tx) => {
    const { slug } = await requireCanJoin(tx, { teamId, userId });

    const [team] = await tx
      .select({ joinCode: teams.joinCode })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    // Checked after requireCanJoin so a full team or an unlinked GitHub
    // account reports itself rather than looking like a bad code.
    if (team?.joinCode !== joinCode.trim().toUpperCase()) {
      throw new TeamActionError("bad_join_code");
    }

    const granted = await addMember(slug, userId);
    if (!granted.ok) throw githubProblem(granted);

    await insertMembership(tx, { teamId, userId });
    await touchGithubSynced(tx, teamId);
  });
}

async function requestToJoinImpl(
  teamId: string,
  rawMessage?: string,
): Promise<string> {
  // An all-whitespace note is no note. Normalized here rather than in a form,
  // because it is a fact about the value rather than about one screen.
  //
  // `||` is load-bearing and must NOT become `??`. Trimming produces `""` for
  // an all-whitespace note, and `""` is not nullish. `??` would keep it and
  // store an empty string as if it were a real message, which is the exact
  // thing this line exists to prevent.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const message = rawMessage?.trim() || undefined;
  const userId = await expectSession();

  return db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team) throw new TeamActionError("not_found");

    if (await isActiveMember(tx, teamId, userId)) {
      throw new TeamActionError("already_on_team");
    }

    // Deliberately NOT checked here: the concurrent-team cap and whether the
    // team is full. Both are validated when the request is ANSWERED, never
    // when it is created -- asking a few teams and joining whichever answers
    // first is the intended use, and a request that turns out to be
    // unanswerable is a normal outcome the requests page explains, not a
    // creation-time refusal.
    return insertRequest(tx, {
      teamId,
      userId,
      direction: "request",
      createdBy: userId,
      message,
    });
  });
}

async function inviteToTeamImpl(
  teamId: string,
  inviteeId: string,
): Promise<string> {
  const callerId = await expectSession();

  return db.transaction(async (tx) => {
    await requireLead(tx, teamId, callerId);

    if (await isActiveMember(tx, teamId, inviteeId)) {
      throw new TeamActionError("already_on_team");
    }

    return insertRequest(tx, {
      teamId,
      userId: inviteeId,
      direction: "invite",
      createdBy: callerId,
    });
  });
}

async function insertRequest(
  tx: Tx,
  values: {
    teamId: string;
    userId: string;
    direction: "invite" | "request";
    createdBy: string;
    message?: string;
  },
): Promise<string> {
  try {
    const [row] = await tx
      .insert(teamMembershipRequests)
      .values(values)
      .returning({ id: teamMembershipRequests.id });
    if (!row) throw new TeamActionError("not_found");
    return row.id;
  } catch (error) {
    // The partial unique index allows one PENDING approach per (team, member)
    // in either direction, so a duplicate is "there is already one open", not
    // a hard failure.
    if (
      isUniqueViolation(
        error,
        "teamMembershipRequests_one_pending_per_team_user",
      )
    ) {
      throw new TeamActionError(
        "request_not_actionable",
        "There is already a pending invitation or request for that member",
      );
    }
    throw error;
  }
}

async function respondToMembershipImpl(
  requestId: string,
  accept: boolean,
): Promise<void> {
  const callerId = await expectSession();

  await db.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        userId: teamMembershipRequests.userId,
        direction: teamMembershipRequests.direction,
        status: teamMembershipRequests.status,
      })
      .from(teamMembershipRequests)
      .where(eq(teamMembershipRequests.id, requestId))
      .limit(1);

    if (!request) throw new TeamActionError("not_found");
    if (request.status !== "pending") {
      throw new TeamActionError("request_not_actionable");
    }

    // Who may answer follows from the direction: an invitation is answered by
    // its recipient, a request by the team's lead. This is the only place the
    // two halves of the shared table behave differently.
    if (request.direction === "invite") {
      if (request.userId !== callerId) {
        throw new TeamActionError("request_not_actionable");
      }
    } else {
      await requireLead(tx, request.teamId, callerId);
    }

    // Declining needs none of the checks below: it is always allowed, and it
    // must not fail because the cap or the roster changed underneath it.
    if (!accept) {
      await tx
        .update(teamMembershipRequests)
        .set({
          status: "declined",
          respondedAt: new Date(),
          respondedBy: callerId,
        })
        .where(eq(teamMembershipRequests.id, requestId));
      return;
    }

    // Re-validated here rather than trusted from creation time: the cap, the
    // roster and the GitHub link can all have changed since this request was
    // opened. `requireCanJoin` takes the lock this whole acceptance runs
    // under.
    const { slug } = await requireCanJoin(tx, {
      teamId: request.teamId,
      userId: request.userId,
    });

    const granted = await addMember(slug, request.userId);
    if (!granted.ok) throw githubProblem(granted);

    await insertMembership(tx, {
      teamId: request.teamId,
      userId: request.userId,
    });
    await touchGithubSynced(tx, request.teamId);

    await tx
      .update(teamMembershipRequests)
      .set({
        status: "accepted",
        respondedAt: new Date(),
        respondedBy: callerId,
      })
      .where(eq(teamMembershipRequests.id, requestId));

    // Unlike the old one-team-per-competition model, accepting this one does
    // NOT withdraw the member's other pending approaches: a contributor may
    // be active on up to `MAX_CONCURRENT_TEAMS_PER_USER` teams at once, so a
    // second acceptance is not automatically moot. If it would push them over
    // the cap, `requireCanJoin` refuses it on its own turn with
    // `too_many_teams`, and the request stays pending for them to decline.
  });
}

async function leaveTeamImpl(teamId: string): Promise<void> {
  const userId = await expectSession();

  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);

    const [membership] = await tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      )
      .limit(1);

    if (!membership) throw new TeamActionError("not_a_member");

    if (membership.role === "lead") {
      const [other] = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            ne(teamMembers.userId, userId),
            isNull(teamMembers.leftAt),
          ),
        )
        .limit(1);

      // A team with no lead has nobody who can invite, respond or transfer,
      // and the partial unique index means one cannot simply be promoted by a
      // second writer. Leaving last is fine; the row goes with the member.
      if (other) throw new TeamActionError("lead_must_transfer_first");
    }

    // GitHub first, same as every grant: if the revoke fails, the mirror
    // stays exactly as it was, which is the correct state to be in when the
    // member in fact still has push access.
    const revoked = await removeMember(await teamSlugOf(tx, teamId), userId);
    if (!revoked.ok) throw githubProblem(revoked);

    // A stint ends, it is not erased: `leftAt` is set rather than the row
    // deleted, so a later competition step can still ask who was on this
    // team at some past moment.
    await tx
      .update(teamMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      );
    await touchGithubSynced(tx, teamId);
  });
}

/**
 * Marks a team's mirror as freshly confirmed against GitHub.
 *
 * Called from inside the same transaction as the GitHub call it follows, not
 * as a separate pass over `teams` -- the transaction is already open and
 * already knows the GitHub grant just succeeded, so recording that is one
 * more statement under the same commit rather than a second round-trip
 * dependent on this one having landed.
 */
async function touchGithubSynced(tx: Tx, teamId: string): Promise<void> {
  await tx
    .update(teams)
    .set({ githubSyncedAt: new Date() })
    .where(eq(teams.id, teamId));
}

async function teamSlugOf(tx: Tx, teamId: string): Promise<string> {
  const [row] = await tx
    .select({ slug: teams.slug })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new TeamActionError("not_found");
  return row.slug;
}

async function transferLeadImpl(
  teamId: string,
  newLeadId: string,
): Promise<void> {
  const callerId = await expectSession();

  await db.transaction(async (tx) => {
    // Same lock as leave/disband. Without it, a transfer racing a concurrent
    // leaveTeam on the promoted member can interleave: both read an active
    // membership, both report success, and the team ends up with the old
    // lead demoted and the new one promoted-but-left -- no active lead, and
    // no self-service action left that can create one.
    await lockTeam(tx, teamId);

    await requireLead(tx, teamId, callerId);

    if (!(await isActiveMember(tx, teamId, newLeadId))) {
      throw new TeamActionError("not_a_member");
    }

    // Demote first. The partial unique index permits exactly one ACTIVE lead
    // per team, so promoting before demoting violates it. Within one
    // transaction the order is the whole difference between working and
    // 23505.
    await tx
      .update(teamMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, callerId),
          isNull(teamMembers.leftAt),
        ),
      );

    // Defense in depth: the lock plus the isActiveMember check above should
    // make this affect exactly one row, but if some other path this file
    // does not yet know about ever races it, failing loudly here is better
    // than silently leaving the team with no active lead.
    const promoted = await tx
      .update(teamMembers)
      .set({ role: "lead" })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, newLeadId),
          isNull(teamMembers.leftAt),
        ),
      )
      .returning({ id: teamMembers.id });

    if (promoted.length === 0) throw new TeamActionError("not_a_member");
  });
}

async function disbandTeamImpl(teamId: string): Promise<void> {
  const userId = await expectSession();

  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);
    await requireLead(tx, teamId, userId);

    const slug = await teamSlugOf(tx, teamId);

    // GitHub first: the ruleset and the GitHub team come down before the
    // mirror row does, so a failure here leaves the mirror -- and therefore
    // every member's access -- exactly as it was.
    const torn = await disbandTeam(slug);
    if (!torn.ok) throw githubProblem(torn);

    // `teamMembers` and any pending `teamMembershipRequests` cascade off this
    // delete, so a disbanded team's history does not outlive the team itself.
    // (The branch and its pull-request history do -- see `disbandTeam`.)
    await tx.delete(teams).where(eq(teams.id, teamId));
  });
}

// ── The boundary ─────────────────────────────────────────────────────────────

/**
 * Every action returns an outcome; none of them throws across the wire.
 *
 * The implementations above throw `TeamActionError`, which is the right shape
 * for them. The checks read as a chain of guards rather than as a result
 * threaded through by hand. But a thrown error does not survive the trip to a
 * client component: Next redacts an uncaught server-action error in
 * production and hands the browser an opaque digest, so `error.code`, the thing
 * every one of these screens branches on, reads correctly in development and is
 * GONE in the deployed build.
 *
 * Converting here rather than in a per-page wrapper is what makes that
 * impossible to forget. A page that forgets is not broken in a way anybody
 * notices locally; it is broken only once it ships.
 */
async function attempt<T>(
  run: () => Promise<T>,
): Promise<TeamActionOutcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof TeamActionError) {
      return { ok: false, code: error.code };
    }
    // Anything else is a fault rather than a refusal: a dropped connection, a
    // constraint nothing translated. Logged so the server keeps it, and
    // reported as "unknown" so a member is not told they did something wrong.
    console.error("[teams] unexpected action failure:", error);
    return { ok: false, code: "unknown" };
  }
}

export async function createTeam(
  name: string,
): Promise<TeamActionOutcome<CreatedTeam>> {
  return attempt(() => createTeamImpl(name));
}

export async function joinTeam(
  teamId: string,
  joinCode: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => joinTeamImpl(teamId, joinCode));
}

export async function requestToJoin(
  teamId: string,
  message?: string,
): Promise<TeamActionOutcome<string>> {
  return attempt(() => requestToJoinImpl(teamId, message));
}

export async function inviteToTeam(
  teamId: string,
  inviteeId: string,
): Promise<TeamActionOutcome<string>> {
  return attempt(() => inviteToTeamImpl(teamId, inviteeId));
}

export async function respondToMembership(
  requestId: string,
  accept: boolean,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => respondToMembershipImpl(requestId, accept));
}

export async function leaveTeam(
  teamId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => leaveTeamImpl(teamId));
}

export async function transferLead(
  teamId: string,
  newLeadId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => transferLeadImpl(teamId, newLeadId));
}

export async function disbandTeamAction(
  teamId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => disbandTeamImpl(teamId));
}
