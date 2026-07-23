"use server";

import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { roles } from '~/server/db/schema';
import { requireManageRoles, requirePermissionGuard } from "./permissions";
import { requireCustomRole, requireRankGuard } from "./permissionGuards";
import {
  canManageDiscordRolePosition,
  getDiscordSyncCapability,
} from "~/server/discord/adminCapability";
import {
  countUsersWithoutLinkedDiscord as _countUsersWithoutLinkedDiscord,
  createDiscordRoleFromRole as _createDiscordRoleFromRole,
  fetchGuildRoles,
  importRoleFromDiscord as _importRoleFromDiscord,
  linkRoleToDiscord as _linkRoleToDiscord,
  listImportableDiscordRoles as _listImportableDiscordRoles,
  unsyncRole as _unsyncRole,
  type ImportableDiscordRole,
  type ImportRoleInput,
} from "~/server/discord/roleSync";

const NO_PERMISSION_MESSAGE =
  "Your Discord account doesn't have permission to manage this role.";

async function getTargetRole(
  roleId: string,
): Promise<{ rank: number | null; roleType: string }> {
  const [target] = await db
    .select({ rank: roles.rank, roleType: roles.roleType })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");
  return target;
}

export async function listImportableDiscordRoles(): Promise<
  ImportableDiscordRole[]
> {
  await requireManageRoles();
  return _listImportableDiscordRoles();
}

export async function importRoleFromDiscord(
  discordRoleId: string,
  fields: ImportRoleInput,
): Promise<{ id: string }> {
  const { callerId, ctx } = await requireManageRoles();
  requireRankGuard(fields.rank, ctx.minRank);
  await requirePermissionGuard(fields, ctx.resolvedPermissions);

  const guildRoles = await fetchGuildRoles();
  const discordRole = guildRoles.find((r) => r.id === discordRoleId);
  if (!discordRole) throw new Error("Discord role not found");

  const capability = await getDiscordSyncCapability(callerId, guildRoles);
  if (!canManageDiscordRolePosition(capability, discordRole.position)) {
    throw new Error(NO_PERMISSION_MESSAGE);
  }

  return _importRoleFromDiscord(discordRoleId, fields);
}

/** Number of users who would lose `roleId` if it were linked to Discord. */
export async function countUsersWithoutLinkedDiscord(
  roleId: string,
): Promise<number> {
  const { ctx } = await requireManageRoles();
  const target = await getTargetRole(roleId);
  requireRankGuard(requireCustomRole(target), ctx.minRank);
  return _countUsersWithoutLinkedDiscord(roleId);
}

export async function linkRoleToDiscord(
  roleId: string,
  discordRoleId: string,
): Promise<void> {
  const { callerId, ctx } = await requireManageRoles();
  const target = await getTargetRole(roleId);
  requireRankGuard(requireCustomRole(target), ctx.minRank);

  const guildRoles = await fetchGuildRoles();
  const discordRole = guildRoles.find((r) => r.id === discordRoleId);
  if (!discordRole) throw new Error("Discord role not found");

  const capability = await getDiscordSyncCapability(callerId, guildRoles);
  if (!canManageDiscordRolePosition(capability, discordRole.position)) {
    throw new Error(NO_PERMISSION_MESSAGE);
  }

  await _linkRoleToDiscord(roleId, discordRoleId);
}

export async function createDiscordRoleFromRole(roleId: string): Promise<void> {
  const { callerId, ctx } = await requireManageRoles();
  const target = await getTargetRole(roleId);
  requireRankGuard(requireCustomRole(target), ctx.minRank);

  const guildRoles = await fetchGuildRoles();
  const capability = await getDiscordSyncCapability(callerId, guildRoles);
  if (!canManageDiscordRolePosition(capability, 0)) {
    throw new Error(
      "Your Discord account doesn't have permission to create Discord roles.",
    );
  }

  await _createDiscordRoleFromRole(roleId);
}

export async function unsyncRole(roleId: string): Promise<void> {
  const { ctx } = await requireManageRoles();
  const target = await getTargetRole(roleId);
  requireRankGuard(requireCustomRole(target), ctx.minRank);
  await _unsyncRole(roleId);
}
