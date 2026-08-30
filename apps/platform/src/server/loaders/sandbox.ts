import { desc, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  sandboxCredentialsInPlatform as sandboxCredentials,
  sandboxEnvironmentsInPlatform as sandboxEnvironments,
  supabaseConnectionsInPlatform as supabaseConnections,
  teamEnvironmentsInPlatform as teamEnvironments,
  teamMembersInPlatform as teamMembers,
  teamsInPlatform as teams,
} from "~/server/db/schema";

/**
 * Reads for the sandbox console.
 *
 * Every one is scoped to what the caller can already reach: an environment is
 * visible to somebody on a team attached to it, the same reachability rule that
 * governs credentials. Nothing here returns a key, a token, or a Vault id.
 */

export interface SandboxConnection {
  connected: boolean;
  orgSlug: string | null;
  expiresAt: Date | null;
}

export async function getConnection(
  userId: string,
): Promise<SandboxConnection> {
  const [row] = await db
    .select({
      orgSlug: supabaseConnections.orgSlug,
      expiresAt: supabaseConnections.expiresAt,
    })
    .from(supabaseConnections)
    .where(eq(supabaseConnections.userId, userId));

  return {
    connected: Boolean(row),
    orgSlug: row?.orgSlug ?? null,
    expiresAt: row?.expiresAt ?? null,
  };
}

export interface EnvironmentCard {
  id: string;
  name: string;
  status: string;
  proxyHostname: string;
  isOwner: boolean;
  teamNames: string[];
  memberCount: number;
  lastSeenActiveAt: Date | null;
}

/**
 * Environments the caller can reach, with the teams attached to each.
 *
 * Reached through `teamMembers` rather than ownership, because a member who is
 * not the owner still needs to see the environment they build against. One
 * environment may serve several teams.
 */
export async function getEnvironmentsForMember(
  userId: string,
): Promise<EnvironmentCard[]> {
  const rows = await db
    .selectDistinct({
      id: sandboxEnvironments.id,
      name: sandboxEnvironments.name,
      status: sandboxEnvironments.status,
      proxyHostname: sandboxEnvironments.proxyHostname,
      ownerUserId: sandboxEnvironments.ownerUserId,
      lastSeenActiveAt: sandboxEnvironments.lastSeenActiveAt,
    })
    .from(sandboxEnvironments)
    .innerJoin(
      teamEnvironments,
      eq(teamEnvironments.environmentId, sandboxEnvironments.id),
    )
    .innerJoin(teamMembers, eq(teamMembers.teamId, teamEnvironments.teamId))
    .where(eq(teamMembers.userId, userId))
    .orderBy(desc(sandboxEnvironments.lastSeenActiveAt));

  return Promise.all(
    rows.map(async (row) => {
      const attached = await db
        .select({ name: teams.name })
        .from(teamEnvironments)
        .innerJoin(teams, eq(teams.id, teamEnvironments.teamId))
        .where(eq(teamEnvironments.environmentId, row.id));

      const [counted] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sandboxCredentials)
        .where(
          sql`${sandboxCredentials.environmentId} = ${row.id}
              and ${sandboxCredentials.status} = 'active'
              and ${sandboxCredentials.scope} = 'publishable'`,
        );

      return {
        id: row.id,
        name: row.name,
        status: row.status,
        proxyHostname: row.proxyHostname,
        isOwner: row.ownerUserId === userId,
        teamNames: attached.map((a) => a.name),
        // Counted on the publishable credential only, so a member with both
        // tokens is one person rather than two.
        memberCount: counted?.n ?? 0,
        lastSeenActiveAt: row.lastSeenActiveAt,
      };
    }),
  );
}

/** Teams the caller leads that have no environment attached yet. */
export async function getTeamsAwaitingEnvironment(userId: string) {
  return db
    .select({ id: teams.id, name: teams.name, slug: teams.slug })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .leftJoin(teamEnvironments, eq(teamEnvironments.teamId, teams.id))
    .where(
      sql`${teamMembers.userId} = ${userId}
          and ${teamMembers.role} = 'lead'
          and ${teamEnvironments.teamId} is null`,
    );
}
