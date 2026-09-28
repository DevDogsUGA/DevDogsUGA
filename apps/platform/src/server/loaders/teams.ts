import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  competitionEntries,
  competitions,
  profiles,
  teamMembers,
  teamMembershipRequests,
  teams,
} from "~/server/db/schema";
import { teamBranch } from "~/server/github/naming";

/**
 * The GitHub URL for a team's branch -- what the dashboard links "the team
 * on GitHub" to, since the branch IS the team.
 */
function teamBranchUrl(teamSlug: string): string {
  return `https://github.com/${env.GITHUB_ORG}/${env.GITHUB_COMPETITION_REPO}/tree/${teamBranch(teamSlug)}`;
}

/** What `git clone` takes for the competition repo every team branch is on. */
function competitionRepoCloneUrl(): string {
  return `https://github.com/${env.GITHUB_ORG}/${env.GITHUB_COMPETITION_REPO}.git`;
}

/**
 * Reads for the team pages.
 *
 * A team is not scoped to a competition, so nothing here takes a
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
  /** Where the team actually lives -- the branch, on GitHub. */
  branchUrl: string;
  /** The branch's name, for the checkout commands the page prints. */
  branch: string;
  /** The competition repo's clone URL, for the same. */
  cloneUrl: string;
  /** Last time something confirmed this row against GitHub. Null only for a
   *  row that predates the mirror's freshness column, which should not
   *  exist outside a bug -- see the migration comment on `githubSyncedAt`. */
  githubSyncedAt: Date | null;
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
        githubSyncedAt: teams.githubSyncedAt,
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
      branchUrl: teamBranchUrl(row.slug),
      branch: teamBranch(row.slug),
      cloneUrl: competitionRepoCloneUrl(),
      githubSyncedAt: row.githubSyncedAt,
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
  branchUrl: string;
  githubSyncedAt: Date | null;
}

/**
 * Every team the viewer is ACTIVELY on -- up to
 * `MAX_CONCURRENT_TEAMS_PER_USER`, unlike the old one-per-competition
 * `getMyTeam`, which returned at most one. Backs both `/teams` and the
 * attendance passport's teams section.
 */
export const getMyTeams = cache(async (userId: string): Promise<MyTeam[]> => {
  const rows = await db
    .select({
      teamId: teams.id,
      teamSlug: teams.slug,
      teamName: teams.name,
      role: teamMembers.role,
      githubSyncedAt: teams.githubSyncedAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)))
    .orderBy(asc(teams.name));

  return rows.map((row) => ({
    ...row,
    branchUrl: teamBranchUrl(row.teamSlug),
  }));
});

/** One PR a team entered a competition with. A team can carry more than one
 *  -- reopening after a close, or two open at once -- so this is a list on
 *  `EntrantRow`, not a single link. */
export interface EntryLink {
  prNumber: number;
  url: string;
  merged: boolean;
}

export interface EntrantRow {
  teamId: string;
  teamSlug: string;
  teamName: string;
  memberCount: number;
  /** True the moment any of this team's entries has `mergedAt` set --
   *  merging IS winning, see `pullRequest.ts`'s module doc. */
  won: boolean;
  /** Oldest first, so the page can read top-to-bottom as the entry history. */
  entries: EntryLink[];
}

/**
 * A competition's entrants, for the results page.
 *
 * Reads `competitionEntries` (the mirror `server/github/prEvent.ts` keeps),
 * grouped by team: a team's rows collapse to one `EntrantRow` with every PR
 * it entered with, because the results page answers "who entered, and who
 * won" per TEAM, not per pull request. `won` is true the instant any one of
 * a team's entries merged -- see `pullRequest.ts`'s module doc on why there
 * is no separate award to read instead.
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
          where ${teamMembers.teamId} = ${teams.id} and ${teamMembers.leftAt} is null
        )`,
        prNumber: competitionEntries.prNumber,
        url: competitionEntries.url,
        mergedAt: competitionEntries.mergedAt,
        openedAt: competitionEntries.openedAt,
      })
      .from(competitionEntries)
      .innerJoin(
        competitions,
        eq(competitions.id, competitionEntries.competitionId),
      )
      .innerJoin(teams, eq(teams.id, competitionEntries.teamId))
      .where(eq(competitions.slug, competitionSlug))
      .orderBy(asc(competitionEntries.openedAt));

    const byTeam = new Map<string, EntrantRow>();
    for (const row of rows) {
      let entrant = byTeam.get(row.teamId);
      if (!entrant) {
        entrant = {
          teamId: row.teamId,
          teamSlug: row.teamSlug,
          teamName: row.teamName,
          memberCount: row.memberCount,
          won: false,
          entries: [],
        };
        byTeam.set(row.teamId, entrant);
      }
      const merged = row.mergedAt !== null;
      entrant.entries.push({ prNumber: row.prNumber, url: row.url, merged });
      if (merged) entrant.won = true;
    }

    // Winner(s) first. `Array.prototype.sort` is stable, and `byTeam`'s
    // insertion order already follows the query's `openedAt` ascending, so
    // a tie (every non-winner) keeps "whichever team entered first" without
    // this comparator saying so a second time.
    return [...byTeam.values()].sort((a, b) => {
      if (a.won !== b.won) return a.won ? -1 : 1;
      return 0;
    });
  },
);

export interface TeamEntryRow {
  competitionId: string;
  competitionSlug: string;
  competitionTitle: string;
  prNumber: number;
  url: string;
  openedAt: Date;
  won: boolean;
}

/**
 * A team's own competition history, newest first, for the team page.
 *
 * One row per pull request rather than collapsed per competition, unlike
 * `getEntrants` above -- a team looking at its own page wants to see every
 * PR it opened, not just a rollup, and a team rarely enters the same
 * competition more than once or twice.
 */
export const getTeamEntries = cache(
  async (teamId: string): Promise<TeamEntryRow[]> => {
    const rows = await db
      .select({
        competitionId: competitions.id,
        competitionSlug: competitions.slug,
        competitionTitle: competitions.title,
        prNumber: competitionEntries.prNumber,
        url: competitionEntries.url,
        openedAt: competitionEntries.openedAt,
        mergedAt: competitionEntries.mergedAt,
      })
      .from(competitionEntries)
      .innerJoin(
        competitions,
        eq(competitions.id, competitionEntries.competitionId),
      )
      .where(eq(competitionEntries.teamId, teamId))
      .orderBy(desc(competitionEntries.openedAt));

    return rows.map(({ mergedAt, ...row }) => ({
      ...row,
      won: mergedAt !== null,
    }));
  },
);
