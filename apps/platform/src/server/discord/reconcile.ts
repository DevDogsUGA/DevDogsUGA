import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  Routes,
  type APIGuildMember,
  type APIRole,
  type RESTGetAPIGuildMembersQuery,
  type RESTPatchAPIGuildRoleJSONBody,
} from "discord-api-types/v10";
import { makeURLSearchParams } from "@discordjs/rest";
import { asBot } from "./api";
import { decimalToHex, hexToDecimal } from "./permissions";
import { fetchGuildRoles } from "./roleSync";
import { env } from "~/env";
import { db } from "~/server/db";
import { roles, userRoles } from '~/server/db/schema';
import { refreshUserPermissions } from "~/server/db/refreshPermissions";
import { identitiesInAuth } from "~/supabase/drizzle/schema";

type FieldSync<T> =
  | { action: "none"; snapshot: T }
  | { action: "push"; snapshot: T; discordValue: T }
  | { action: "pull"; snapshot: T; dbValue: T };

/**
 * Diffs one field (name or color) across DB / live Discord / last-synced
 * snapshot. Per-field, DB wins on conflict — see `reconcileRoleDefinitions`.
 */
function reconcileField<T>(
  dbValue: T,
  liveValue: T,
  snapValue: T,
): FieldSync<T> {
  const dbChanged = dbValue !== snapValue;
  const liveChanged = liveValue !== snapValue;

  if (!dbChanged && !liveChanged)
    return { action: "none", snapshot: snapValue };
  if (dbChanged && !liveChanged)
    return { action: "push", snapshot: dbValue, discordValue: dbValue };
  if (!dbChanged && liveChanged)
    return { action: "pull", snapshot: liveValue, dbValue: liveValue };
  // conflict: both sides changed since the last sync — DB wins
  return { action: "push", snapshot: dbValue, discordValue: dbValue };
}

/**
 * Cheap reconciliation of synced roles' name/color, run on every Permissions
 * page load and on Discord account link. For each synced role, diffs `name`
 * and `color` independently against the live Discord role and the
 * last-synced snapshot; pushes, pulls, or (on a same-field conflict) pushes
 * DB's value to Discord. If a synced role's Discord role no longer exists,
 * records an error and skips it (never auto-unsyncs).
 *
 * Failed Discord pushes leave the snapshot stale, so the next run retries
 * automatically.
 */
export async function reconcileRoleDefinitions(
  guildRoles?: APIRole[],
): Promise<{
  changes: number;
  errors: string[];
}> {
  const syncedRoles = await db
    .select()
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  if (syncedRoles.length === 0) return { changes: 0, errors: [] };

  const resolvedGuildRoles = guildRoles ?? (await fetchGuildRoles());
  const guildRolesById = new Map(resolvedGuildRoles.map((r) => [r.id, r]));

  let changes = 0;
  const errors: string[] = [];

  for (const role of syncedRoles) {
    const discordRole = guildRolesById.get(role.discordRoleId!);
    if (!discordRole) {
      errors.push(
        `Discord role for "${role.title}" no longer exists (id ${role.discordRoleId}).`,
      );
      continue;
    }

    const nameSync = reconcileField(
      role.title,
      discordRole.name,
      role.discordSyncedName ?? "",
    );
    const colorSync = reconcileField(
      hexToDecimal(role.color),
      discordRole.color,
      role.discordSyncedColor ?? 0,
    );

    if (nameSync.action === "none" && colorSync.action === "none") continue;

    const discordPatch: RESTPatchAPIGuildRoleJSONBody = {};
    if (nameSync.action === "push") discordPatch.name = nameSync.discordValue;
    if (colorSync.action === "push")
      discordPatch.color = colorSync.discordValue;

    if (Object.keys(discordPatch).length > 0) {
      try {
        await asBot().patch(
          Routes.guildRole(env.DISCORD_GUILD_ID, role.discordRoleId!),
          { body: discordPatch },
        );
      } catch (err) {
        errors.push(
          `Failed to push role "${role.title}" to Discord: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Leave the snapshot stale so this role is retried next time.
        continue;
      }
    }

    const dbUpdate: { title?: string; color?: string | null } = {};
    if (nameSync.action === "pull") dbUpdate.title = nameSync.dbValue;
    if (colorSync.action === "pull")
      dbUpdate.color = decimalToHex(colorSync.dbValue);

    await db
      .update(roles)
      .set({
        ...dbUpdate,
        discordSyncedName: nameSync.snapshot,
        discordSyncedColor: colorSync.snapshot,
      })
      .where(eq(roles.id, role.id));
    changes++;
  }

  return { changes, errors };
}

/**
 * Expensive reconciliation of guild membership for synced roles, run only
 * by the cron backstop. Paginates `GET /guilds/{id}/members` and, for every
 * linked user, additively grants synced DevDogs roles they hold on Discord
 * but not in the DB, and removes synced DevDogs roles the DB has but Discord
 * doesn't.
 */
export async function reconcileMembership(): Promise<{
  changes: number;
  errors: string[];
}> {
  const errors: string[] = [];

  const syncedRoles = await db
    .select({ id: roles.id, discordRoleId: roles.discordRoleId })
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  if (syncedRoles.length === 0) return { changes: 0, errors };

  const discordRoleIdToRoleId = new Map(
    syncedRoles.map((r) => [r.discordRoleId!, r.id]),
  );
  const syncedRoleIds = syncedRoles.map((r) => r.id);

  const identityRows = await db
    .select({
      userId: identitiesInAuth.userId,
      discordUserId: identitiesInAuth.providerId,
    })
    .from(identitiesInAuth)
    .where(eq(identitiesInAuth.provider, "discord"));

  if (identityRows.length === 0) return { changes: 0, errors };

  const discordToUser = new Map(
    identityRows.map((r) => [r.discordUserId, r.userId]),
  );

  const members: APIGuildMember[] = [];
  let after: string | undefined;
  for (;;) {
    const query: RESTGetAPIGuildMembersQuery = {
      limit: 1000,
      ...(after !== undefined && { after }),
    };
    const page = (await asBot().get(Routes.guildMembers(env.DISCORD_GUILD_ID), {
      query: makeURLSearchParams(query),
    })) as APIGuildMember[];
    members.push(...page);
    if (page.length < 1000) break;
    after = page[page.length - 1]!.user.id;
  }

  const memberRolesByDiscordId = new Map<string, Set<string>>();
  for (const member of members) {
    memberRolesByDiscordId.set(member.user.id, new Set(member.roles));
  }

  const existing = await db
    .select({ userId: userRoles.userId, roleId: userRoles.roleId })
    .from(userRoles)
    .where(inArray(userRoles.roleId, syncedRoleIds));
  const existingSet = new Set(existing.map((r) => `${r.userId}:${r.roleId}`));

  const toInsert: { userId: string; roleId: string }[] = [];
  const toDelete: { userId: string; roleId: string }[] = [];

  for (const [discordUserId, userId] of discordToUser) {
    const memberRoleIds = memberRolesByDiscordId.get(discordUserId);
    if (!memberRoleIds) continue;

    for (const [discordRoleId, roleId] of discordRoleIdToRoleId) {
      const hasOnDiscord = memberRoleIds.has(discordRoleId);
      const hasInDb = existingSet.has(`${userId}:${roleId}`);
      if (hasOnDiscord && !hasInDb) toInsert.push({ userId, roleId });
      else if (!hasOnDiscord && hasInDb) toDelete.push({ userId, roleId });
    }
  }

  if (toInsert.length > 0) {
    await db.insert(userRoles).values(toInsert).onConflictDoNothing();
  }
  for (const { userId, roleId } of toDelete) {
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  if (toInsert.length > 0 || toDelete.length > 0) {
    await refreshUserPermissions();
  }

  return { changes: toInsert.length + toDelete.length, errors };
}
