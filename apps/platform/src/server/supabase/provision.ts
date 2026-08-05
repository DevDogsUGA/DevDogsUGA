import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "~/server/db";
import {
  sandboxEnvironmentsInPlatform as sandboxEnvironments,
  teamEnvironmentsInPlatform as teamEnvironments,
  teamMembersInPlatform as teamMembers,
  teamsInPlatform as teams,
} from "~/server/db/schema";
import { revokeAllCredentials } from "~/server/sandbox/credentials";
import { buildProxyHostname } from "~/server/sandbox/hostname";
import { deleteVaultSecret, storeVaultSecret } from "~/server/vault";
import {
  createProject,
  getProject,
  listProjects,
  pauseProject,
  restoreProject,
  retrieveKeys,
  runQuery,
  waitForReady,
  type ProjectSummary,
} from "./managementApi";
import { accessTokenFor } from "./oauth";
import { isGone, mapProjectStatus } from "./status";

/**
 * Provisioning, attaching, and tearing down sandbox environments.
 *
 * The orchestration layer: everything here composes the Management API client
 * with the platform's own tables, and every function is written so a failure
 * partway through leaves a state somebody can recover from rather than a
 * half-built environment nothing owns.
 */

/** The free plan grants two projects, counted across EVERY org where you are owner or admin. */
export const FREE_PLAN_PROJECT_LIMIT = 2;

export type ProvisionProblem =
  | "not_connected"
  | "at_capacity"
  | "not_the_lead"
  | "already_attached"
  | "environment_gone";

export class ProvisionError extends Error {
  constructor(readonly code: ProvisionProblem) {
    super(`Provisioning: ${code}`);
    this.name = "ProvisionError";
  }
}

export interface CapacityReport {
  owned: number;
  limit: number;
  hasCapacity: boolean;
  projects: ProjectSummary[];
}

/**
 * How many projects this member owns, and what they are.
 *
 * The list includes projects with nothing to do with DevDogs, which is what
 * makes presentation the careful part: the console must label which are ours by
 * matching `sandboxEnvironments.projectRef`, and never pre-select anything.
 */
export async function capacityFor(userId: string): Promise<CapacityReport> {
  const token = await accessTokenFor(userId);
  const projects = await listProjects(token);
  return {
    owned: projects.length,
    limit: FREE_PLAN_PROJECT_LIMIT,
    hasCapacity: projects.length < FREE_PLAN_PROJECT_LIMIT,
    projects,
  };
}

/**
 * Free a slot by pausing one of the owner's own projects.
 *
 * Two refusals are enforced rather than warned about, because both would let
 * one lead break somebody else's week:
 *
 *   - a DevDogs environment still attached to a team with an open competition;
 *   - the environment currently being provisioned into.
 *
 * Pausing is offered at all only because it is reversible: a paused project
 * restores in about three minutes and stops counting against the cap
 * immediately.
 */
export async function pauseOwnedProject(
  userId: string,
  projectRef: string,
): Promise<void> {
  const [ours] = await db
    .select({ id: sandboxEnvironments.id, status: sandboxEnvironments.status })
    .from(sandboxEnvironments)
    .where(eq(sandboxEnvironments.projectRef, projectRef));

  if (ours) {
    const [attached] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamEnvironments)
      .where(eq(teamEnvironments.environmentId, ours.id));
    if ((attached?.n ?? 0) > 0) {
      throw new ProvisionError("already_attached");
    }
  }

  const token = await accessTokenFor(userId);
  await pauseProject(token, projectRef);

  if (ours) {
    await db
      .update(sandboxEnvironments)
      .set({ status: "paused" })
      .where(eq(sandboxEnvironments.id, ours.id));
  }
}

/**
 * Every migration in `packages/sb/supabase/migrations`, concatenated in order.
 *
 * One payload rather than one call per file, because `database/query` is
 * atomic (measured): a multi-statement payload with an error in the middle
 * rolls back completely. So a failed migration leaves the schema untouched and
 * there is no repair path to write — which is only true if they go together.
 */
async function migrationBundle(): Promise<string> {
  const dir = join(process.cwd(), "../../packages/sb/supabase/migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const parts = await Promise.all(
    files.map(async (file) => {
      const body = await readFile(join(dir, file), "utf8");
      return `-- ${file}\n${body}`;
    }),
  );
  return parts.join("\n\n");
}

export async function applyMigrations(environmentId: string): Promise<void> {
  const [env] = await db
    .select()
    .from(sandboxEnvironments)
    .where(eq(sandboxEnvironments.id, environmentId));
  if (!env) throw new ProvisionError("environment_gone");

  const token = await accessTokenFor(env.ownerUserId);
  await runQuery(token, env.projectRef, await migrationBundle());
}

/**
 * Create a project, wait for it, take its keys, and record it.
 *
 * Ordering is the whole design here. The Vault writes and the row insert happen
 * only AFTER the project is confirmed healthy, so a failure during creation
 * leaves nothing behind in the platform — no orphan row pointing at a project
 * that never came up, no secrets nothing references.
 */
export async function provisionEnvironment(
  teamId: string,
  ownerUserId: string,
  opts: { name?: string; region?: string; organizationId: string },
): Promise<string> {
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId));
  if (!team) throw new ProvisionError("environment_gone");

  // The owner must already be the team's lead -- the composite FKs on
  // teamEnvironments enforce it at attach time, and finding out there rather
  // than here would mean a created project with nowhere to attach.
  const [lead] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, ownerUserId),
        eq(teamMembers.role, "lead"),
      ),
    );
  if (!lead) throw new ProvisionError("not_the_lead");

  const capacity = await capacityFor(ownerUserId);
  if (!capacity.hasCapacity) throw new ProvisionError("at_capacity");

  const token = await accessTokenFor(ownerUserId);
  const name = opts.name ?? `devdogs-${team.name}`.slice(0, 40);

  // Never stored: the platform reaches the database through the Management API
  // under the owner's token, so nothing needs this password afterwards. Keeping
  // it would be a credential with no reader.
  const dbPass = crypto.randomUUID() + crypto.randomUUID();

  const created = await createProject(token, {
    name,
    organizationId: opts.organizationId,
    region: opts.region ?? "us-east-1",
    dbPass,
  });

  // ~10s measured, but a poll rather than a sleep. ACTIVE_HEALTHY proved a real
  // readiness signal -- all 24 migrations applied immediately after the flip.
  await waitForReady(token, created.ref, { timeoutMs: 180_000 });

  const keys = await retrieveKeys(token, created.ref);

  const secretKeySecretId = await storeVaultSecret(
    keys.secret,
    `sandbox_secret_${created.ref}`,
  );
  const jwtSecretId = await storeVaultSecret(
    keys.secret,
    `sandbox_jwt_${created.ref}`,
  );

  const [row] = await db
    .insert(sandboxEnvironments)
    .values({
      name,
      kind: "owned",
      ownerUserId,
      projectRef: created.ref,
      apiUrl: `https://${created.ref}.supabase.co`,
      publishableKey: keys.publishable,
      secretKeySecretId,
      jwtSecretId,
      proxyHostname: buildProxyHostname(name),
      status: "active",
      provisionedAt: new Date(),
      lastSeenActiveAt: new Date(),
    })
    .returning({ id: sandboxEnvironments.id });

  const environmentId = row!.id;
  await applyMigrations(environmentId);
  await attachEnvironment(teamId, environmentId, ownerUserId);
  return environmentId;
}

/**
 * Point a team at an environment.
 *
 * The composite foreign keys do the real work: they refuse unless the
 * environment's owner is this team's lead, so the invariant is a constraint
 * rather than a check somebody has to remember to write.
 */
export async function attachEnvironment(
  teamId: string,
  environmentId: string,
  actorId: string,
): Promise<void> {
  const [env] = await db
    .select({ ownerUserId: sandboxEnvironments.ownerUserId })
    .from(sandboxEnvironments)
    .where(eq(sandboxEnvironments.id, environmentId));
  if (!env) throw new ProvisionError("environment_gone");

  await db.insert(teamEnvironments).values({
    teamId,
    environmentId,
    ownerUserId: env.ownerUserId,
    ownerRole: "lead",
    attachedBy: actorId,
  });
}

/**
 * Detach, which is NOT teardown.
 *
 * A detached environment keeps its project, hostname, Vault secrets and member
 * credentials, and simply auto-pauses. Deleting anything here would make
 * "attach the environment I used last month" mean full re-provisioning, which
 * is the friction this feature exists to remove.
 */
export async function detachEnvironment(teamId: string): Promise<void> {
  await db.delete(teamEnvironments).where(eq(teamEnvironments.teamId, teamId));
}

export async function restoreEnvironment(environmentId: string): Promise<void> {
  const [env] = await db
    .select()
    .from(sandboxEnvironments)
    .where(eq(sandboxEnvironments.id, environmentId));
  if (!env) throw new ProvisionError("environment_gone");

  const token = await accessTokenFor(env.ownerUserId);
  await restoreProject(token, env.projectRef);
  await db
    .update(sandboxEnvironments)
    .set({ status: "restoring" })
    .where(eq(sandboxEnvironments.id, environmentId));
}

/**
 * Terminal teardown, in the order the doc spells out.
 *
 *   1. Revoke credentials, so no new request can resolve.
 *   2. Delete the Vault secrets.
 *   3. Detach remaining teams; the row stays, retiring the hostname forever.
 *
 * Credentials first. Deleting the secrets first would leave live credentials
 * resolving against a half-dismantled environment, which fails in more
 * confusing ways than a clean rejection.
 *
 * The row is never deleted: 'revoked' and 'orphaned' are terminal statuses, and
 * the surviving row is what keeps the unique constraint reserving the hostname.
 * A recycled hostname means an old build silently reading somebody else's data.
 */
export async function tearDownEnvironment(
  environmentId: string,
  reason: "revoked" | "orphaned",
): Promise<void> {
  const [env] = await db
    .select()
    .from(sandboxEnvironments)
    .where(eq(sandboxEnvironments.id, environmentId));
  if (!env) return;

  await revokeAllCredentials(environmentId);
  await deleteVaultSecret(env.secretKeySecretId);
  await deleteVaultSecret(env.jwtSecretId);
  await db
    .delete(teamEnvironments)
    .where(eq(teamEnvironments.environmentId, environmentId));
  await db
    .update(sandboxEnvironments)
    .set({ status: reason, revokedAt: new Date() })
    .where(eq(sandboxEnvironments.id, environmentId));
}

// ── Cron passes ──────────────────────────────────────────────────────────────

/**
 * Environments attached to a team whose competition has not finished judging.
 *
 * One query feeding every pass, so pre-warm and auto-pause cannot disagree
 * about which environments are in play.
 */
function environmentsWithOpenCompetitions() {
  return db
    .selectDistinct({ environmentId: teamEnvironments.environmentId })
    .from(teamEnvironments)
    .innerJoin(teams, eq(teams.id, teamEnvironments.teamId))
    .innerJoin(sql`platform.competitions c`, sql`c.id = ${teams.competitionId}`)
    .where(
      or(sql`c."judgingStartsAt" is null`, sql`c."judgingStartsAt" > now()`),
    );
}

/**
 * Wake environments with a competition starting soon.
 *
 * Fifteen minutes of lead time against a measured 196-second restore. Tighter
 * would leave no room for a missed tick; the cadence is five minutes for the
 * same reason.
 */
export async function prewarmPass(): Promise<{ restored: number }> {
  const open = await environmentsWithOpenCompetitions();
  if (open.length === 0) return { restored: 0 };

  const candidates = await db
    .select({ id: sandboxEnvironments.id })
    .from(sandboxEnvironments)
    .where(
      and(
        inArray(
          sandboxEnvironments.id,
          open.map((o) => o.environmentId),
        ),
        eq(sandboxEnvironments.prewarmEnabled, true),
        eq(sandboxEnvironments.status, "paused"),
      ),
    );

  let restored = 0;
  for (const candidate of candidates) {
    try {
      await restoreEnvironment(candidate.id);
      restored += 1;
    } catch (error) {
      // One member's lapsed OAuth grant must not stop the pass for everybody.
      console.error(`[sandbox] pre-warm failed for ${candidate.id}:`, error);
    }
  }
  return { restored };
}

/**
 * Pause environments with no open competition left.
 *
 * Re-checks status rather than assuming: pausing itself takes ~80 seconds, so a
 * pass that assumed success would double-pause and miscount free slots.
 */
export async function autoPausePass(): Promise<{ paused: number }> {
  const open = await environmentsWithOpenCompetitions();
  const openIds = open.map((o) => o.environmentId);

  const candidates = await db
    .select({
      id: sandboxEnvironments.id,
      ownerUserId: sandboxEnvironments.ownerUserId,
      projectRef: sandboxEnvironments.projectRef,
    })
    .from(sandboxEnvironments)
    .where(
      and(
        eq(sandboxEnvironments.autoPauseEnabled, true),
        eq(sandboxEnvironments.status, "active"),
        // notInArray, not a string-built `<> all(array[...])`. The ids come
        // from a uuid column so interpolation could not actually inject, but a
        // parameterized predicate is the one that stays safe when somebody
        // later swaps in a value that is not a uuid.
        openIds.length > 0
          ? notInArray(sandboxEnvironments.id, openIds)
          : undefined,
      ),
    );

  let paused = 0;
  for (const candidate of candidates) {
    try {
      const token = await accessTokenFor(candidate.ownerUserId);
      const project = await getProject(token, candidate.projectRef);
      if (project?.status !== "ACTIVE_HEALTHY") continue;

      await pauseProject(token, candidate.projectRef);
      await db
        .update(sandboxEnvironments)
        .set({ status: "paused" })
        .where(eq(sandboxEnvironments.id, candidate.id));
      paused += 1;
    } catch (error) {
      console.error(`[sandbox] auto-pause failed for ${candidate.id}:`, error);
    }
  }
  return { paused };
}

/**
 * Nightly: does each project still exist, and is each status still true?
 *
 * **This pass is the sole authority on orphaning.** The proxy must never make
 * that call, because a transient upstream error would otherwise tear down a
 * healthy environment. Only a definite 404 — or absence from the owner's
 * project list — counts.
 */
export async function reconcilePass(): Promise<{
  orphaned: number;
  updated: number;
}> {
  const environments = await db
    .select()
    .from(sandboxEnvironments)
    .where(
      and(
        isNull(sandboxEnvironments.revokedAt),
        or(
          eq(sandboxEnvironments.status, "active"),
          eq(sandboxEnvironments.status, "paused"),
          eq(sandboxEnvironments.status, "restoring"),
          eq(sandboxEnvironments.status, "detached"),
        ),
      ),
    );

  let orphaned = 0;
  let updated = 0;

  for (const env of environments) {
    try {
      const token = await accessTokenFor(env.ownerUserId);
      const project = await getProject(token, env.projectRef);

      if (project === null || isGone(project.status)) {
        await tearDownEnvironment(env.id, "orphaned");
        orphaned += 1;
        continue;
      }

      const mapped = mapProjectStatus(project.status);
      if (mapped !== env.status) {
        await db
          .update(sandboxEnvironments)
          .set({
            status: mapped,
            lastSeenActiveAt:
              mapped === "active" ? new Date() : env.lastSeenActiveAt,
          })
          .where(eq(sandboxEnvironments.id, env.id));
        updated += 1;
      }
    } catch (error) {
      // Deliberately NOT orphaning on error. An expired grant or a Supabase
      // blip is not evidence a project is gone, and treating it as such would
      // delete a working environment's secrets.
      console.error(`[sandbox] reconcile skipped ${env.id}:`, error);
    }
  }

  return { orphaned, updated };
}

/**
 * A project paused past Supabase's 90-day restore window is effectively deleted.
 *
 * Marked orphaned pre-emptively rather than discovered at wake time, in front
 * of a team that expected to start working.
 */
export async function expirePausedPass(): Promise<{ expired: number }> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const stale = await db
    .select({ id: sandboxEnvironments.id })
    .from(sandboxEnvironments)
    .where(
      and(
        eq(sandboxEnvironments.status, "paused"),
        lt(sandboxEnvironments.lastSeenActiveAt, cutoff),
      ),
    );

  for (const env of stale) {
    await tearDownEnvironment(env.id, "orphaned");
  }
  return { expired: stale.length };
}
