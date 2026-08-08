"use server";

import { and, eq, ne } from "drizzle-orm";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  competitions,
  teamMembers,
  teamMembershipRequests,
  teams,
} from "~/server/db/schema";
import {
  TeamActionError,
  isUniqueViolation,
  type TeamActionOutcome,
} from "~/server/teams/errors";
import { isLocked } from "~/server/teams/lockState";
import {
  addMember,
  provisionTeam,
  removeMember,
} from "~/server/github/teamSync";
import {
  insertMembership,
  requireCanJoin,
  type Tx,
} from "~/server/teams/requireCanJoin";

/**
 * Team membership actions.
 *
 * Writes are server actions over Drizzle rather than `security definer` RPCs.
 * Meetings and teams are consumed by the platform and nothing else, so routing
 * them through RPCs would buy an independence no caller wants and pay for it
 * by splitting logic that belongs together: a join is a database write, a
 * GitHub API call and an email, and only the first can live in Postgres.
 *
 * Drizzle connects as the owning role, so RLS does not apply to anything here.
 * The authorization checks at the top of each action are the whole boundary.
 */

/**
 * Runs a GitHub side effect after the transaction has committed.
 *
 * Never inside. The membership row is the source of truth and repository
 * access is a consequence of it — so a failed API call must leave somebody on
 * the roster without push, which the nightly reconcile repairs, rather than
 * rolling back a join that already succeeded. Rolling back would mean GitHub
 * being down stops people from forming teams at all.
 *
 * Swallowing the error is therefore deliberate and not laziness: there is no
 * caller-visible action to take, and the repair path already exists.
 */
async function afterCommit(
  what: string,
  effect: () => Promise<{ ok: boolean; detail?: string; skipped?: string }>,
): Promise<void> {
  try {
    const result = await effect();
    if (!result.ok) {
      console.warn(`[github] ${what}: ${result.detail ?? result.skipped}`);
    }
  } catch (error) {
    console.warn(`[github] ${what}:`, error);
  }
}

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

async function requireOpenCompetition(tx: Tx, competitionId: string) {
  const [row] = await tx
    .select({
      id: competitions.id,
      judgingStartsAt: competitions.judgingStartsAt,
    })
    .from(competitions)
    .where(eq(competitions.id, competitionId))
    .limit(1);

  if (!row) throw new TeamActionError("not_found");
  if (
    row.judgingStartsAt !== null &&
    new Date(row.judgingStartsAt).getTime() <= Date.now()
  ) {
    throw new TeamActionError("competition_closed");
  }
  return row;
}

/** Loads a team with the competition fields the lock predicate needs. */
async function loadTeamForLock(tx: Tx, teamId: string) {
  const [row] = await tx
    .select({
      id: teams.id,
      competitionId: teams.competitionId,
      submissionState: teams.submissionState,
      lockedManuallyAt: teams.lockedManuallyAt,
      judgingStartsAt: competitions.judgingStartsAt,
    })
    .from(teams)
    .innerJoin(competitions, eq(competitions.id, teams.competitionId))
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!row) throw new TeamActionError("not_found");
  return row;
}

async function requireLead(tx: Tx, teamId: string, userId: string) {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!row) throw new TeamActionError("not_a_member");
  if (row.role !== "lead") throw new TeamActionError("not_the_lead");
}

/**
 * The created team, identified the way the routes are.
 *
 * Both the id and the slug: the id is what the GitHub provisioning needs, and
 * the slug is what `/competitions/[slug]/teams/[team]` is keyed on — so
 * returning only the id leaves a form with nowhere to navigate after a
 * successful create.
 */
export interface CreatedTeam {
  id: string;
  slug: string;
}

async function createTeamImpl(
  competitionId: string,
  name: string,
): Promise<CreatedTeam> {
  const userId = await expectSession();

  const created = await db.transaction(async (tx) => {
    await requireOpenCompetition(tx, competitionId);

    let team: CreatedTeam | undefined;
    try {
      [team] = await tx
        .insert(teams)
        .values({
          competitionId,
          slug: slugify(name),
          name,
          joinCode: generateJoinCode(),
          createdBy: userId,
        })
        .returning({ id: teams.id, slug: teams.slug });
    } catch (error) {
      // Two teams named the same thing in one competition. Translated here
      // because the untranslated 23505 reaches the member as "something went
      // wrong on our side" — which sends them to ask an officer about a
      // problem they could have solved by picking another name.
      if (isUniqueViolation(error, "teams_competitionId_slug_key")) {
        throw new TeamActionError("name_taken");
      }
      throw error;
    }

    if (!team) throw new TeamActionError("not_found");

    // The creator is the lead. Inserted directly rather than through
    // requireCanJoin: the team is empty and unlocked by construction, so the
    // only check that could fire is "already on a team", which the constraint
    // catches below with the right message.
    try {
      await tx.insert(teamMembers).values({
        teamId: team.id,
        competitionId,
        userId,
        role: "lead",
      });
    } catch (error) {
      if (isUniqueViolation(error, "teamMembers_userId_competitionId_key")) {
        throw new TeamActionError("already_on_team");
      }
      throw error;
    }

    return team;
  });

  // The team, its push grant and its branch. The lead is added to the GitHub
  // team by the same call chain a join would make.
  await afterCommit(`provision ${created.id}`, () => provisionTeam(created.id));
  await afterCommit(`add lead to ${created.id}`, () =>
    addMember(created.id, userId),
  );

  return created;
}

async function joinTeamImpl(teamId: string, joinCode: string): Promise<void> {
  const userId = await expectSession();

  await db.transaction(async (tx) => {
    const { competitionId } = await requireCanJoin(tx, { teamId, userId });

    const [team] = await tx
      .select({ joinCode: teams.joinCode })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    // Checked after requireCanJoin so a closed competition or a locked roster
    // reports itself rather than looking like a bad code.
    if (team?.joinCode !== joinCode.trim().toUpperCase()) {
      throw new TeamActionError("bad_join_code");
    }

    await insertMembership(tx, { teamId, competitionId, userId });
  });

  await afterCommit(`add ${userId} to ${teamId}`, () =>
    addMember(teamId, userId),
  );
}

async function requestToJoinImpl(
  teamId: string,
  rawMessage?: string,
): Promise<string> {
  // An all-whitespace note is no note. Normalized here rather than in a form,
  // because it is a fact about the value rather than about one screen.
  //
  // `||` is load-bearing and must NOT become `??`. Trimming produces `""` for
  // an all-whitespace note, and `""` is not nullish — `??` would keep it and
  // store an empty string as if it were a real message, which is the exact
  // thing this line exists to prevent.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const message = rawMessage?.trim() || undefined;
  const userId = await expectSession();

  return db.transaction(async (tx) => {
    const team = await loadTeamForLock(tx, teamId);
    if (isLocked(team)) throw new TeamActionError("roster_locked");

    const [existing] = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.competitionId, team.competitionId),
        ),
      )
      .limit(1);
    if (existing) throw new TeamActionError("already_on_team");

    return insertRequest(tx, {
      teamId,
      competitionId: team.competitionId,
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

    const team = await loadTeamForLock(tx, teamId);
    if (isLocked(team)) throw new TeamActionError("roster_locked");

    return insertRequest(tx, {
      teamId,
      competitionId: team.competitionId,
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
    competitionId: string;
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

  // Returned from the transaction rather than assigned to a captured `let`.
  // TypeScript does not track an assignment made inside the callback, so the
  // old shape still read as `null` after the await: `joined !== null` narrowed
  // to `never`, and the two fields destructured out of it were `never` too —
  // which is what the template literal below was reporting. Returning the value
  // keeps the type and removes the mutable at the same time.
  const joined = await db.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        competitionId: teamMembershipRequests.competitionId,
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

    await tx
      .update(teamMembershipRequests)
      .set({
        status: accept ? "accepted" : "declined",
        respondedAt: new Date(),
        respondedBy: callerId,
      })
      .where(eq(teamMembershipRequests.id, requestId));

    if (!accept) return null;

    await requireCanJoin(tx, {
      teamId: request.teamId,
      userId: request.userId,
    });
    await insertMembership(tx, {
      teamId: request.teamId,
      competitionId: request.competitionId,
      userId: request.userId,
    });

    // Accepting one withdraws the rest for that competition.
    //
    // Applying to a few teams and joining whichever answers first is the
    // intended use, so the leftovers are not a mistake — but the
    // one-team-per-competition constraint would reject every one of them
    // anyway, and leaving them pending strands leads waiting on somebody who
    // is no longer available. Withdrawn rather than declined: the member did
    // not turn these down, their situation changed.
    //
    // Both directions, not just invitations. A join request this member sent
    // to another team is exactly as stale as an invitation they received.
    await tx
      .update(teamMembershipRequests)
      .set({
        status: "withdrawn",
        respondedAt: new Date(),
        respondedBy: callerId,
      })
      .where(
        and(
          eq(teamMembershipRequests.competitionId, request.competitionId),
          eq(teamMembershipRequests.userId, request.userId),
          eq(teamMembershipRequests.status, "pending"),
          ne(teamMembershipRequests.id, requestId),
        ),
      );

    return { teamId: request.teamId, userId: request.userId };
  });

  if (joined !== null) {
    const { teamId, userId } = joined;
    await afterCommit(`add ${userId} to ${teamId}`, () =>
      addMember(teamId, userId),
    );
  }
}

async function leaveTeamImpl(teamId: string): Promise<void> {
  const userId = await expectSession();

  await db.transaction(async (tx) => {
    const team = await loadTeamForLock(tx, teamId);
    if (isLocked(team)) throw new TeamActionError("roster_locked");

    const [membership] = await tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      )
      .limit(1);

    if (!membership) throw new TeamActionError("not_a_member");

    if (membership.role === "lead") {
      const [other] = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(
          and(eq(teamMembers.teamId, teamId), ne(teamMembers.userId, userId)),
        )
        .limit(1);

      // A team with no lead has nobody who can invite, respond or transfer,
      // and the partial unique index means one cannot simply be promoted by a
      // second writer. Leaving last is fine — the row goes with the member.
      if (other) throw new TeamActionError("lead_must_transfer_first");
    }

    await tx
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
      );
  });

  await afterCommit(`remove ${userId} from ${teamId}`, () =>
    removeMember(teamId, userId),
  );
}

async function transferLeadImpl(
  teamId: string,
  newLeadId: string,
): Promise<void> {
  const callerId = await expectSession();

  await db.transaction(async (tx) => {
    await requireLead(tx, teamId, callerId);

    const [target] = await tx
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newLeadId)),
      )
      .limit(1);

    if (!target) throw new TeamActionError("not_a_member");

    // Demote first. The partial unique index permits exactly one lead per
    // team, so promoting before demoting violates it — within one transaction
    // the order is the whole difference between working and 23505.
    await tx
      .update(teamMembers)
      .set({ role: "member" })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, callerId)),
      );

    await tx
      .update(teamMembers)
      .set({ role: "lead" })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newLeadId)),
      );
  });
}

export interface ReformReport {
  teamId: string;
  invited: string[];
  skipped: { userId: string; reason: string }[];
}

/**
 * Re-forms a team for a later competition.
 *
 * Returns a structured report rather than an id because the caller needs the
 * skipped list — somebody who already joined another team this week cannot be
 * carried over, and the lead has to be told which of their teammates that was.
 * This is where dropping RPCs pays immediately: the shape was `jsonb` before,
 * typed by hand on both sides.
 *
 * The previous roster is INVITED rather than inserted. Membership is a choice
 * every week, and silently re-adding people would make "I am not doing this
 * one" require an opt-out nobody would find.
 */
async function reformTeamImpl(
  sourceTeamId: string,
  targetCompetitionId: string,
): Promise<ReformReport> {
  const callerId = await expectSession();

  return db.transaction(async (tx) => {
    await requireLead(tx, sourceTeamId, callerId);
    await requireOpenCompetition(tx, targetCompetitionId);

    const [source] = await tx
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, sourceTeamId))
      .limit(1);
    if (!source) throw new TeamActionError("not_found");

    const [team] = await tx
      .insert(teams)
      .values({
        competitionId: targetCompetitionId,
        slug: slugify(source.name),
        name: source.name,
        joinCode: generateJoinCode(),
        createdBy: callerId,
        clonedFromTeamId: sourceTeamId,
      })
      .returning({ id: teams.id });
    if (!team) throw new TeamActionError("not_found");

    await insertMembership(tx, {
      teamId: team.id,
      competitionId: targetCompetitionId,
      userId: callerId,
      role: "lead",
    });

    const roster = await tx
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, sourceTeamId));

    const invited: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];

    for (const { userId } of roster) {
      if (userId === callerId) continue;

      const [existing] = await tx
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, userId),
            eq(teamMembers.competitionId, targetCompetitionId),
          ),
        )
        .limit(1);

      if (existing) {
        skipped.push({ userId, reason: "already_on_team" });
        continue;
      }

      try {
        await insertRequest(tx, {
          teamId: team.id,
          competitionId: targetCompetitionId,
          userId,
          direction: "invite",
          createdBy: callerId,
        });
        invited.push(userId);
      } catch (error) {
        if (error instanceof TeamActionError) {
          skipped.push({ userId, reason: error.code });
          continue;
        }
        throw error;
      }
    }

    return { teamId: team.id, invited, skipped };
  });
}

// ── The boundary ─────────────────────────────────────────────────────────────

/**
 * Every action returns an outcome; none of them throws across the wire.
 *
 * The implementations above throw `TeamActionError`, which is the right shape
 * for them — the six join checks read as a chain of guards rather than as a
 * result being threaded through by hand. But a thrown error does not survive
 * the trip to a client component: Next redacts an uncaught server-action error
 * in production and hands the browser an opaque digest, so `error.code` — the
 * thing every one of these screens branches on — reads correctly in
 * development and is GONE in the deployed build.
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
    // Anything else is a fault rather than a refusal — a dropped connection, a
    // constraint nothing translated. Logged so the server keeps it, and
    // reported as "unknown" so a member is not told they did something wrong.
    console.error("[teams] unexpected action failure:", error);
    return { ok: false, code: "unknown" };
  }
}

export async function createTeam(
  competitionId: string,
  name: string,
): Promise<TeamActionOutcome<CreatedTeam>> {
  return attempt(() => createTeamImpl(competitionId, name));
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

export async function reformTeam(
  sourceTeamId: string,
  targetCompetitionId: string,
): Promise<TeamActionOutcome<ReformReport>> {
  return attempt(() => reformTeamImpl(sourceTeamId, targetCompetitionId));
}
