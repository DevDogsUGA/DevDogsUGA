import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  profiles,
  teamMembers,
  teamMembershipRequests,
  teams,
} from "~/server/db/schema";

/**
 * Reads for the team pages.
 *
 * A team is no longer scoped to a competition, so nothing here takes a
 * competition slug. "Active" means `teamMembers."leftAt" is null` throughout
 * -- a departed member's row survives (see the teams-core migration) but is
 * not part of the roster any page renders.
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
  acceptingRequests: boolean;
  members: TeamMemberRow[];
  /** Only ever sent to an active member of this team. See `getTeamDetail`. */
  joinCode: string | null;
}

/**
 * A team, with its active roster.
 *
 * `joinCode` is returned ONLY to an active member. It is the credential that
 * lets somebody join, so a team page rendered for a stranger must not carry
 * it. The column grants exclude it from the client-readable set for the same
 * reason; this is the server-side half.
 */
export const getTeamDetail = cache(
  async (
    teamSlug: string,
    viewerId: string | null,
  ): Promise<TeamDetail | null> => {
    const [row] = await db
      .select({
        id: teams.id,
        slug: teams.slug,
        name: teams.name,
        joinCode: teams.joinCode,
        acceptingRequests: teams.acceptingRequests,
      })
      .from(teams)
      .where(eq(teams.slug, teamSlug));

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
      .where(and(eq(teamMembers.teamId, row.id), isNull(teamMembers.leftAt)))
      // Lead first, then join order, so the roster reads as "who runs this,
      // and who arrived when".
      .orderBy(desc(teamMembers.role), asc(teamMembers.joinedAt));

    const isMember =
      viewerId !== null && members.some((m) => m.userId === viewerId);

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      acceptingRequests: row.acceptingRequests,
      members,
      joinCode: isMember ? row.joinCode : null,
    };
  },
);

export interface TeamCard {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
  acceptingRequests: boolean;
}

/** Every team, for the "find a team" list. */
export const getAllTeams = cache(async (): Promise<TeamCard[]> => {
  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      acceptingRequests: teams.acceptingRequests,
      memberCount: sql<number>`(
        select count(*)::int from ${teamMembers}
        where ${teamMembers.teamId} = ${teams.id} and ${teamMembers.leftAt} is null
      )`,
    })
    .from(teams)
    .orderBy(asc(teams.name));

  return rows;
});

export interface PendingRequest {
  id: string;
  teamId: string;
  teamName: string;
  /** So a row can link to the team without a second lookup. */
  teamSlug: string;
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
 * and join requests on teams they lead (where "lead" means active lead). They
 * are one screen, "things you have to decide about", and splitting them would
 * make somebody check two places.
 */
export const getPendingForUser = cache(
  async (userId: string): Promise<PendingRequest[]> => {
    return db
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        teamName: teams.name,
        teamSlug: teams.slug,
        userId: teamMembershipRequests.userId,
        preferredName: profiles.preferredName,
        direction: teamMembershipRequests.direction,
        message: teamMembershipRequests.message,
        createdAt: teamMembershipRequests.createdAt,
      })
      .from(teamMembershipRequests)
      .innerJoin(teams, eq(teams.id, teamMembershipRequests.teamId))
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
                  and tm."leftAt" is null
              ))
          )`,
        ),
      )
      .orderBy(desc(teamMembershipRequests.createdAt));
  },
);

export interface MyTeam {
  teamId: string;
  teamSlug: string;
  teamName: string;
  role: "lead" | "member";
}

/**
 * Every team the viewer is ACTIVELY on -- up to
 * `MAX_CONCURRENT_TEAMS_PER_USER`, unlike the old one-per-competition
 * `getMyTeam`, which returned at most one.
 */
export const getMyTeams = cache(async (userId: string): Promise<MyTeam[]> => {
  return db
    .select({
      teamId: teams.id,
      teamSlug: teams.slug,
      teamName: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)))
    .orderBy(asc(teams.name));
});

export interface EntrantRow {
  teamId: string;
  teamSlug: string;
  teamName: string;
  memberCount: number;
  won: boolean;
}

/**
 * A competition's entrants, winner first, for the results page.
 *
 * ⚠️ STUB. The platform redesign's teams-core step dropped
 * `teams."competitionId"`/`"submissionState"`/`"competedAt"`, so "which teams
 * entered this competition" is no longer a question team rows can answer --
 * that becomes the competitions step's job, reading the competition-entry
 * mirror (a team-branch PR linking the competition's issue) instead. Kept
 * with its old signature, returning nothing, so `results/page.tsx` keeps
 * compiling and rendering "nobody has entered yet" rather than erroring.
 */
export const getEntrants = cache(
  async (_competitionSlug: string): Promise<EntrantRow[]> => {
    return [];
  },
);
