import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  competitions,
  profiles,
  projects,
  teamAwards,
  teamMembers,
  teamMembershipRequests,
  teams,
  workshops,
} from "~/server/db/schema";
import { lockReason, type LockReason } from "~/server/teams/lockState";

/**
 * Reads for the team pages.
 *
 * The lock state is computed here rather than selected, through the same
 * `lockReason` the join checks use. One definition: a screen saying a roster is
 * open while the action rejects the join is the drift four copies of a
 * three-term boolean produce.
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
  maxTeamSize: number | null;
  members: TeamMemberRow[];
  /** Null when the roster is open. */
  lock: LockReason | null;
  /** Only ever sent to a member of this team. See `getTeamDetail`. */
  joinCode: string | null;
  /** Whether `teamAwards` carries a `category = 'winner'` row for this team. */
  won: boolean;
}

/**
 * A team, with its roster.
 *
 * `joinCode` is returned ONLY to a member. It is the credential that lets
 * somebody join, so a team page rendered for a stranger must not carry it. The
 * column grants exclude it from the client-readable set for the same reason;
 * this is the server-side half.
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
      // Lead first, then join order, so the roster reads as "who runs this,
      // and who arrived when".
      .orderBy(desc(teamMembers.role), asc(teamMembers.joinedAt));

    const [award] = await db
      .select({ id: teamAwards.id })
      .from(teamAwards)
      .where(
        and(eq(teamAwards.teamId, row.id), eq(teamAwards.category, "winner")),
      );

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
      maxTeamSize: row.maxTeamSize,
      members: members,
      lock: lockReason({
        submissionState: row.submissionState,
        lockedManuallyAt: row.lockedManuallyAt,
        judgingStartsAt: row.judgingStartsAt,
      }),
      joinCode: isMember ? row.joinCode : null,
      won: award !== undefined,
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
 * "Entered" is a team that has opened a PR at any point (`submissionState is
 * not null`) or was frozen at judging (`competedAt is not null`) -- the same
 * fact `memberStars` reads to award the competition star. All scoring is
 * off-platform now; the only per-competition state the platform persists is
 * who won, in `teamAwards`.
 */
export const getEntrants = cache(
  async (competitionSlug: string): Promise<EntrantRow[]> => {
    const rows = await db
      .select({
        teamId: teams.id,
        teamSlug: teams.slug,
        teamName: teams.name,
        memberCount: sql<number>`(
          select count(*)::int from ${teamMembers}
          where ${teamMembers.teamId} = ${teams.id}
        )`,
        won: sql<boolean>`exists (
          select 1 from ${teamAwards}
          where ${teamAwards.teamId} = ${teams.id}
            and ${teamAwards.category} = 'winner'
        )`,
      })
      .from(teams)
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .where(
        and(
          eq(competitions.slug, competitionSlug),
          or(isNotNull(teams.submissionState), isNotNull(teams.competedAt)),
        ),
      )
      // Winner first, then alphabetical: there is nothing else to rank by.
      .orderBy(
        sql`(exists (
          select 1 from ${teamAwards}
          where ${teamAwards.teamId} = ${teams.id}
            and ${teamAwards.category} = 'winner'
        )) desc`,
        asc(teams.name),
      );

    return rows;
  },
);

export interface PendingRequest {
  id: string;
  teamId: string;
  teamName: string;
  /** So a row can link to the team without a second lookup per competition. */
  teamSlug: string;
  competitionSlug: string;
  competitionName: string;
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
 * and join requests on teams they lead. They are one screen, "things you have
 * to decide about", and splitting them would make somebody check two places.
 */
export const getPendingForUser = cache(
  async (userId: string): Promise<PendingRequest[]> => {
    return db
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        teamName: teams.name,
        teamSlug: teams.slug,
        competitionSlug: competitions.slug,
        // The competition's own title first, then the old chain: it is called
        // after its project, `projectId` is nullable, so fall back to the
        // workshop's title and then to the competition's slug, which is
        // `not null` and already user-visible in git as the integration branch.
        competitionName: sql<string>`coalesce(
          ${competitions.title},
          ${projects.displayName},
          ${workshops.title},
          ${competitions.slug}
        )`,
        userId: teamMembershipRequests.userId,
        preferredName: profiles.preferredName,
        direction: teamMembershipRequests.direction,
        message: teamMembershipRequests.message,
        createdAt: teamMembershipRequests.createdAt,
      })
      .from(teamMembershipRequests)
      .innerJoin(teams, eq(teams.id, teamMembershipRequests.teamId))
      .innerJoin(competitions, eq(competitions.id, teams.competitionId))
      .innerJoin(workshops, eq(workshops.id, competitions.workshopId))
      .leftJoin(projects, eq(projects.id, workshops.projectId))
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
      .orderBy(desc(teamMembershipRequests.createdAt));
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
