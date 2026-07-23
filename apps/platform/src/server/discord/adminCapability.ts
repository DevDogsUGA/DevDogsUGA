import { DiscordAPIError } from "@discordjs/rest";
import {
  PermissionFlagsBits,
  Routes,
  type APIGuild,
  type APIGuildMember,
  type APIRole,
} from "discord-api-types/v10";
import { asBot } from "./api";
import { getDiscordUserId } from "./memberSync";
import { fetchGuildRoles } from "./roleSync";
import { env } from "~/env";
import type { DiscordSyncCapability } from "~/lib/discordCapability";

export {
  type DiscordSyncCapability,
  canManageDiscordRolePosition,
} from "~/lib/discordCapability";

/**
 * What `userId` could do themselves on Discord, based on their linked
 * Discord account's current guild roles + the guild's role hierarchy.
 * `guildRoles` may be passed in (e.g. from the Permissions loader's
 * `fetchGuildRoles()`) to avoid a duplicate fetch.
 */
export async function getDiscordSyncCapability(
  userId: string,
  guildRoles?: APIRole[],
): Promise<DiscordSyncCapability> {
  const discordUserId = await getDiscordUserId(userId);
  if (!discordUserId) return { linked: false };

  const [guild, member, roles] = await Promise.all([
    asBot().get(Routes.guild(env.DISCORD_GUILD_ID)) as Promise<APIGuild>,
    asBot()
      .get(Routes.guildMember(env.DISCORD_GUILD_ID, discordUserId))
      .catch((err) => {
        if (err instanceof DiscordAPIError && err.status === 404)
          return { roles: [] } as Pick<APIGuildMember, "roles">;
        throw err;
      }) as Promise<Pick<APIGuildMember, "roles">>,
    guildRoles ? Promise.resolve(guildRoles) : fetchGuildRoles(),
  ]);

  const isOwner = guild.owner_id === discordUserId;
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const everyone = rolesById.get(env.DISCORD_GUILD_ID);
  const memberRoles = member.roles
    .map((id) => rolesById.get(id))
    .filter((r): r is APIRole => r !== undefined);

  const combinedPerms = [everyone, ...memberRoles]
    .filter((r): r is APIRole => r !== undefined)
    .reduce((acc, r) => acc | BigInt(r.permissions), 0n);

  const hasManageRoles =
    (combinedPerms & PermissionFlagsBits.Administrator) !== 0n ||
    (combinedPerms & PermissionFlagsBits.ManageRoles) !== 0n;

  const highestPosition = memberRoles.reduce(
    (max, r) => Math.max(max, r.position),
    0,
  );

  return { linked: true, isOwner, hasManageRoles, highestPosition };
}
