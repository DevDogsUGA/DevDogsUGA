import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
  sandboxEnvironmentsInPlatform as sandboxEnvironments,
  teamEnvironmentsInPlatform as teamEnvironments,
  teamMembersInPlatform as teamMembers,
  teamsInPlatform as teams,
} from "~/server/db/schema";
import { supabaseAdmin } from "~/supabase/admin";

/**
 * Authenticating `pnpm sb --team` calls.
 *
 * The CLI has no cookies, so these routes take a bearer token rather than a
 * session. It is the member's own Supabase access token — verified against
 * GoTrue on every call rather than decoded locally, so that a member who has
 * been signed out or suspended stops being able to reach their team's
 * environment immediately rather than until their JWT happens to expire.
 */

export type CliProblem =
  "no_token" | "invalid_token" | "not_a_member" | "no_environment";

export class CliAuthError extends Error {
  constructor(
    readonly code: CliProblem,
    readonly status: number,
  ) {
    super(code);
    this.name = "CliAuthError";
  }
}

export async function userFromBearer(request: Request): Promise<string> {
  const header = request.headers.get("authorization");
  const token = header?.replace(/^bearer\s+/i, "");
  if (!token || token === header) {
    throw new CliAuthError("no_token", 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new CliAuthError("invalid_token", 401);
  return data.user.id;
}

export interface ResolvedTarget {
  userId: string;
  teamId: string;
  environmentId: string;
  ownerUserId: string;
  projectRef: string;
  apiUrl: string;
  environmentName: string;
  status: string;
  proxyHostname: string;
}

/**
 * Resolve a team slug to the environment behind it, for this caller.
 *
 * Membership is checked here rather than in each route, because every `--team`
 * command needs the identical answer and a route that forgot would be a route
 * that let any signed-in member reset somebody else's database.
 */
export async function resolveTeamTarget(
  request: Request,
  slug: string,
): Promise<ResolvedTarget> {
  const userId = await userFromBearer(request);

  const [row] = await db
    .select({
      teamId: teams.id,
      environmentId: sandboxEnvironments.id,
      ownerUserId: sandboxEnvironments.ownerUserId,
      projectRef: sandboxEnvironments.projectRef,
      apiUrl: sandboxEnvironments.apiUrl,
      environmentName: sandboxEnvironments.name,
      status: sandboxEnvironments.status,
      proxyHostname: sandboxEnvironments.proxyHostname,
    })
    .from(teams)
    .innerJoin(
      teamMembers,
      and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId)),
    )
    .innerJoin(teamEnvironments, eq(teamEnvironments.teamId, teams.id))
    .innerJoin(
      sandboxEnvironments,
      eq(sandboxEnvironments.id, teamEnvironments.environmentId),
    )
    .where(eq(teams.slug, slug));

  // One answer for "no such team", "not your team" and "no environment
  // attached". A finer distinction would let anybody enumerate which teams
  // exist and which have environments.
  if (!row) throw new CliAuthError("no_environment", 404);

  return { userId, ...row };
}
