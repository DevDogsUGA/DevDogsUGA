import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  sandboxCredentialsInPlatform as sandboxCredentials,
  sandboxEnvironmentsInPlatform as sandboxEnvironments,
  teamEnvironmentsInPlatform as teamEnvironments,
  teamMembersInPlatform as teamMembers,
} from "~/server/db/schema";
import { generateToken, hashToken, type ProxyScope } from "./tokens";

/**
 * Issuing, disabling and reinstating member credentials.
 *
 * **Access is a reachability question, not a lookup.** One environment can
 * serve several teams, so "may this member use it?" is not a row to read. It is
 * "are they an active member of ANY team currently attached to it?".
 */

export interface IssuedToken {
  scope: ProxyScope;
  /** Plaintext. Shown once, never stored, never recoverable. */
  token: string;
}

/**
 * May this member hold a credential for this environment?
 *
 * The whole rule in one query. Deliberately not "is this member on the team
 * that owns it": an environment has no team, it has an owner, and teams attach
 * to it.
 */
export async function isReachable(
  environmentId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamEnvironments)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teamEnvironments.teamId))
    .where(
      and(
        eq(teamEnvironments.environmentId, environmentId),
        eq(teamMembers.userId, userId),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Give a member both tokens for an environment, or reinstate the ones they had.
 *
 * Both scopes, always, and in one call. Issuing them separately would invite a
 * state where somebody holds a secret token and no publishable one, which reads
 * as "elevated by default", the exact posture the scoped-token design exists to
 * avoid.
 *
 * Returns plaintext ONCE. The caller shows it and forgets it; only hashes are
 * stored, following `reportApiKeyHash` in `oauthRegistrations`.
 */
export async function issueCredentials(
  environmentId: string,
  userId: string,
): Promise<IssuedToken[]> {
  if (!(await isReachable(environmentId, userId))) {
    throw new Error(
      `Refusing to issue: user ${userId} is not on any team attached to ${environmentId}`,
    );
  }

  const issued: IssuedToken[] = [];

  for (const scope of ["publishable", "secret"] as const) {
    const token = generateToken(scope);
    const tokenHash = await hashToken(token);

    // Re-granting access REACTIVATES the same row rather than adding a second.
    // The unique constraint is (environment, user, scope) and unconditional, so
    // history, `lastUsedAt` and the audit trail survive somebody leaving a team
    // and coming back for the next event.
    await db
      .insert(sandboxCredentials)
      .values({ environmentId, userId, tokenHash, scope, status: "active" })
      .onConflictDoUpdate({
        target: [
          sandboxCredentials.environmentId,
          sandboxCredentials.userId,
          sandboxCredentials.scope,
        ],
        set: {
          tokenHash,
          status: "active",
          disabledAt: null,
          rotatedAt: new Date(),
        },
      });

    issued.push({ scope, token });
  }

  return issued;
}

/**
 * Withdraw access, reversibly.
 *
 * **Disabled, not revoked.** Access is usually not permanent. People leave a
 * team and rejoin, or return for the next event on the same environment, and
 * revoking is terminal. Revocation is reserved for the environment itself
 * ending.
 */
export async function disableCredentials(
  environmentId: string,
  userId: string,
): Promise<void> {
  await db
    .update(sandboxCredentials)
    .set({ status: "disabled", disabledAt: new Date() })
    .where(
      and(
        eq(sandboxCredentials.environmentId, environmentId),
        eq(sandboxCredentials.userId, userId),
        eq(sandboxCredentials.status, "active"),
      ),
    );
}

/**
 * Re-check every credential on an environment against the reachability rule.
 *
 * Called when a roster changes and nightly. A sweep rather than a targeted
 * update at the moment of removal, because that is what makes the shared
 * environment case correct: removing somebody from ONE of two teams that share
 * an environment must leave their credential active, and only removal from BOTH
 * takes it away. A per-removal handler would have to know about the other team.
 */
export async function reconcileEnvironmentAccess(
  environmentId: string,
): Promise<{ disabled: number; reinstated: number }> {
  const reachable = await db
    .selectDistinct({ userId: teamMembers.userId })
    .from(teamEnvironments)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teamEnvironments.teamId))
    .where(eq(teamEnvironments.environmentId, environmentId));

  const reachableIds = reachable.map((r) => r.userId);

  const disabled = await db
    .update(sandboxCredentials)
    .set({ status: "disabled", disabledAt: new Date() })
    .where(
      and(
        eq(sandboxCredentials.environmentId, environmentId),
        eq(sandboxCredentials.status, "active"),
        // Parameterized rather than string-built. See the note in
        // supabase/provision.ts. Uuids cannot inject, but the predicate that
        // stays correct under a future change is the one to write now.
        reachableIds.length > 0
          ? notInArray(sandboxCredentials.userId, reachableIds)
          : undefined,
      ),
    )
    .returning({ id: sandboxCredentials.id });

  // Somebody who rejoined gets the row they already had back, still carrying
  // their history, but NOT a new token, because the old one is unrecoverable.
  // The console re-issues on request; silently minting one here would mean a
  // credential exists that nobody was ever shown.
  const reinstated =
    reachableIds.length === 0
      ? []
      : await db
          .update(sandboxCredentials)
          .set({ status: "active", disabledAt: null })
          .where(
            and(
              eq(sandboxCredentials.environmentId, environmentId),
              eq(sandboxCredentials.status, "disabled"),
              inArray(sandboxCredentials.userId, reachableIds),
            ),
          )
          .returning({ id: sandboxCredentials.id });

  return { disabled: disabled.length, reinstated: reinstated.length };
}

/**
 * Terminal teardown, in the order that matters.
 *
 * Credentials first, so no new request can resolve while the environment is
 * being dismantled. Deleting the Vault secrets first would leave live
 * credentials resolving against a half-torn-down environment, which fails in
 * stranger ways than a clean rejection.
 */
export async function revokeAllCredentials(
  environmentId: string,
): Promise<number> {
  const rows = await db
    .update(sandboxCredentials)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(sandboxCredentials.environmentId, environmentId))
    .returning({ id: sandboxCredentials.id });
  return rows.length;
}

/** Environments a member can currently reach, for the console. */
export async function environmentsForMember(userId: string) {
  return db
    .selectDistinct({
      id: sandboxEnvironments.id,
      name: sandboxEnvironments.name,
      status: sandboxEnvironments.status,
      proxyHostname: sandboxEnvironments.proxyHostname,
      ownerUserId: sandboxEnvironments.ownerUserId,
    })
    .from(sandboxEnvironments)
    .innerJoin(
      teamEnvironments,
      eq(teamEnvironments.environmentId, sandboxEnvironments.id),
    )
    .innerJoin(teamMembers, eq(teamMembers.teamId, teamEnvironments.teamId))
    .where(eq(teamMembers.userId, userId));
}
