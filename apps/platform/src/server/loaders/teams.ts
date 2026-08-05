import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  competitions,
  competitionStandings,
  profiles,
  teamMembers,
  teamMembershipRequests,
  teams,
} from "~/server/db/schema";
import { lockReason, type LockReason } from "~/server/teams/lockState";

/**
 * Reads for the team pages.
 *
 * The lock state is computed here rather than selected, through the same
 * `lockReason` the join checks use. One definition: a screen saying a roster
 * is open while the action rejects the join is exactly the drift that having
 * four copies of a three-term boolean produces.
 */

export interface TeamMemberRow {
  userId: string;
  preferredName: string | null;
  role: "lead" | "member";
  joinedAt: Date;
}

export interface TeamDetail {
  id: string;
  slug: string;
  name: string;
  competitionId: string;
  competitionSlug: string;
  submissionState: "open" | "closed" | "merged" | null;
  submissionUrl: string | null;
  competedAt: Date | null;
  acceptingRequests: boolean;
  requirementsMet: number | null;
  maxTeamSize: number | null;
  members: TeamMemberRow[];
  /** Null when the roster is open. */
  lock: LockReason | null;
  /** Only ever sent to a member of this team. See `getTeamDetail`. */
  joinCode: string | null;
  standing: {
    requirementPoints: number;
    electionPoints: number;
    totalPoints: number;
    placement: number;
  } | null;
}

/**
 * A team, with its roster.
 *
 * `joinCode` is returned ONLY to a member. It is the credential that lets
 * somebody join, so a team page rendered for a stranger must not carry it —
 * the column grants exclude it from the client-readable set for the same
 * reason, and this is the server-side half of that.
 */
export const getTeamDetail = cache(
  async (
    competitionSlug: string,
    teamSlug: string,
    viewerId: string | null,
  ): Promise<TeamDetail | null> => {
    const [row] = await db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        joinCode: teams.joinCode,
        competitionId: teams.competitionId,
        competitionSlug: competitions.slug,
        submissionState: teams.submissionState,
        submissionUrl: teams.submissionUrl,
        competedAt: teams.competedAt,
        lockedManuallyAt: teams.lockedManuallyAt,
        acceptingRequests: teams.acceptingRequests,
        requirementsMet: teams.requirementsMet,
        maxTeamSize: competitions.maxTeamSize,
        judgingStartsAt: competitions.judgingStartsAt,
      })
      .from(teams)
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .where(
        and(eq(teams.slug, teamSlug), eq(competitions.slug, competitionSlug)),
      );

    if (!row) return null;

    const members = await db
      .select({
        userId: teamMembers.userId,
        preferredName: profiles.preferredName,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .leftJoin(profiles, eq(profiles.userId, teamMembers.userId))
      .where(eq(teamMembers.teamId, row.id))
      // Lead first, then join order — the roster reads as "who runs this, and
      // who arrived when", which is the order somebody scanning it expects.
      .orderBy(desc(teamMembers.role), asc(teamMembers.joinedAt));

    const [standing] = await db
      .select({
        requirementPoints: competitionStandings.requirementPoints,
        electionPoints: competitionStandings.electionPoints,
        totalPoints: competitionStandings.totalPoints,
        placement: competitionStandings.placement,
      })
      .from(competitionStandings)
      .where(eq(competitionStandings.teamId, row.id));

    const isMember =
      viewerId !== null && members.some((m) => m.userId === viewerId);

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      competitionId: row.competitionId,
      competitionSlug: row.competitionSlug,
      submissionState: row.submissionState,
      submissionUrl: row.submissionUrl,
      competedAt: row.competedAt,
      acceptingRequests: row.acceptingRequests,
      requirementsMet: row.requirementsMet,
      maxTeamSize: row.maxTeamSize,
      members: members as TeamMemberRow[],
      lock: lockReason({
        submissionState: row.submissionState,
        lockedManuallyAt: row.lockedManuallyAt,
        judgingStartsAt: row.judgingStartsAt,
      }),
      joinCode: isMember ? row.joinCode : null,
      standing:
        standing === undefined
          ? null
          : {
              requirementPoints: standing.requirementPoints,
              electionPoints: standing.electionPoints,
              totalPoints: standing.totalPoints ?? 0,
              placement: standing.placement,
            },
    };
  },
);

export interface TeamCard {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  acceptingRequests: boolean;
  lock: LockReason | null;
}

/** Every team in a competition, for the "find a team" list. */
export const getTeamsForCompetition = cache(
  async (competitionSlug: string): Promise<TeamCard[]> => {
    const rows = await db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        submissionState: teams.submissionState,
        competedAt: teams.competedAt,
        lockedManuallyAt: teams.lockedManuallyAt,
        acceptingRequests: teams.acceptingRequests,
        judgingStartsAt: competitions.judgingStartsAt,
        memberCount: sql<number>`(
          select count(*)::int from ${teamMembers}
          where ${teamMembers.teamId} = ${teams.id}
        )`,
      })
      .from(teams)
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .where(eq(competitions.slug, competitionSlug))
      .orderBy(asc(teams.name));

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      memberCount: row.memberCount,
      acceptingRequests: row.acceptingRequests,
      lock: lockReason({
        submissionState: row.submissionState,
        lockedManuallyAt: row.lockedManuallyAt,
        judgingStartsAt: row.judgingStartsAt,
      }),
    }));
  },
);

export interface PendingRequest {
  id: string;
  teamId: string;
  teamName: string;
  competitionSlug: string;
  userId: string;
  preferredName: string | null;
  direction: "invite" | "request";
  message: string | null;
  createdAt: Date;
}

/**
 * Everything awaiting the viewer's answer.
 *
 * Both halves of the shared table in one list: invitations addressed to them,
 * and join requests on teams they lead. They are the same screen — "things
 * you have to decide about" — and splitting them would mean somebody has to
 * check two places.
 */
export const getPendingForUser = cache(
  async (userId: string): Promise<PendingRequest[]> => {
    return db
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        teamName: teams.name,
        competitionSlug: competitions.slug,
        userId: teamMembershipRequests.userId,
        preferredName: profiles.preferredName,
        direction: teamMembershipRequests.direction,
        message: teamMembershipRequests.message,
        createdAt: teamMembershipRequests.createdAt,
      })
      .from(teamMembershipRequests)
      .innerJoin(teams, eq(teams.id, teamMembershipRequests.teamId))
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .leftJoin(profiles, eq(profiles.userId, teamMembershipRequests.userId))
      .where(
        and(
          eq(teamMembershipRequests.status, "pending"),
          sql`(
            (${teamMembershipRequests.direction} = 'invite'
              and ${teamMembershipRequests.userId} = ${userId})
            or (${teamMembershipRequests.direction} = 'request'
              and exists (
                select 1 from ${teamMembers} tm
                where tm."teamId" = ${teamMembershipRequests.teamId}
                  and tm."userId" = ${userId}
                  and tm."role" = 'lead'
              ))
          )`,
        ),
      )
      .orderBy(desc(teamMembershipRequests.createdAt)) as Promise<
      PendingRequest[]
    >;
  },
);

/** The viewer's team in one competition, if they are on one. */
export const getMyTeam = cache(
  async (
    competitionSlug: string,
    userId: string,
  ): Promise<{ teamSlug: string; role: "lead" | "member" } | null> => {
    const [row] = await db
      .select({ teamSlug: teams.slug, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(competitions.slug, competitionSlug),
        ),
      );

    return (row as { teamSlug: string; role: "lead" | "member" }) ?? null;
  },
);
