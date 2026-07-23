import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { DiscordAPIError } from "@discordjs/rest";
import { Routes, type APIGuildMember } from "discord-api-types/v10";
import { asBot } from "./api";
import { env } from "~/env";
import { db } from "~/server/db";
import { roles, userRoles } from '~/server/db/schema';
import { refreshUserPermissions } from "~/server/db/refreshPermissions";
import { identitiesInAuth } from "~/supabase/drizzle/schema";

/** Returns the Discord snowflake linked to a DevDogs user, or null if unlinked. */
export async function getDiscordUserId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ providerId: identitiesInAuth.providerId })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.userId, userId),
        eq(identitiesInAuth.provider, "discord"),
      ),
    )
    .limit(1);
  return row?.providerId ?? null;
}

/** Adds or removes a single Discord role from a guild member. */
export async function pushMemberRoleChange(
  discordUserId: string,
  discordRoleId: string,
  action: "add" | "remove",
): Promise<void> {
  const route = Routes.guildMemberRole(
    env.DISCORD_GUILD_ID,
    discordUserId,
    discordRoleId,
  );
  if (action === "add") {
    await asBot().put(route);
  } else {
    await asBot().delete(route);
  }
}

/**
 * Run when a user links their Discord account. Grants any synced DevDogs
 * roles whose linked Discord role the user already holds on Discord.
 * Soft-fails (returns without throwing) if the member can't be fetched —
 * this must never block the link flow.
 */
export async function syncRolesOnLink(
  userId: string,
  discordUserId: string,
): Promise<void> {
  const member = (await asBot()
    .get(Routes.guildMember(env.DISCORD_GUILD_ID, discordUserId))
    .catch((err: unknown) => {
      if (err instanceof DiscordAPIError && err.status === 404) return null;
      throw err;
    })) as APIGuildMember | null;
  if (!member) return;

  const memberRoleIds = new Set(member.roles);

  const syncedRoles = await db
    .select({ id: roles.id, discordRoleId: roles.discordRoleId })
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  const toGrant = syncedRoles.filter(
    (r) => r.discordRoleId !== null && memberRoleIds.has(r.discordRoleId),
  );
  if (toGrant.length === 0) return;

  await db
    .insert(userRoles)
    .values(toGrant.map((r) => ({ userId, roleId: r.id })))
    .onConflictDoNothing();
  await refreshUserPermissions();
}

/** Run when a user unlinks Discord. Strips every synced DevDogs role. */
export async function removeSyncedRolesOnUnlink(userId: string): Promise<void> {
  const syncedRoleIds = db
    .select({ id: roles.id })
    .from(roles)
    .where(isNotNull(roles.discordRoleId));

  await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        inArray(userRoles.roleId, syncedRoleIds),
      ),
    );
  await refreshUserPermissions();
}
