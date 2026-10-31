"use server";

import { expectSession } from "~/server/auth";
import { authorize, rules } from "~/server/auth/access";
import {
  expected,
  ExpectedFailure,
  type ActionResult,
} from "~/lib/actionResult";

import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { roles } from "~/server/db/schema";
import { revalidateOfficers } from "~/server/loaders/officers";
import {
  requireCustomRole,
  requirePermissionGuard,
  requireRankGuard,
} from "~/server/auth/permissions";
import {
  canManageDiscordRolePosition,
  getDiscordSyncCapability,
} from "~/server/discord/adminCapability";
import {
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
  if (!target) throw new ExpectedFailure("Role not found");
  return target;
}

/**
 * Runs a step that talks to Discord. Discord being slow or refusing is not a
 * bug in this app and not something to hide, so its failure comes back as the
 * message the Command shows, in place of a thrown error.
 */
async function viaDiscord<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof ExpectedFailure) throw error;
    throw new ExpectedFailure(
      `Discord could not complete that: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function listImportableDiscordRoles(): Promise<
  ImportableDiscordRole[]
> {
  const access = await authorize(rules.manageRoles);
  if (!access.ok) {
    await expectSession();
    throw new Error("Not authorized: canManageRoles required");
  }

  return _listImportableDiscordRoles();
}

/**
 * Imports a Discord role as a new DevDogs role. The caller needs the Discord
 * role's position under their own, and every permission they grant must be one
 * they hold. Every refusal comes back as the message the dialog shows.
 */
export async function importRoleFromDiscord(
  discordRoleId: string,
  fields: ImportRoleInput,
): Promise<ActionResult<{ id: string }>> {
  const access = await authorize(rules.manageRoles);
  if (!access.ok) return access;

  const callerId = access.caller.userId;
  const ctx = {
    resolvedPermissions: access.caller.flags,
    minRank: access.caller.minRank,
  };
  return expected(async () => {
    requireRankGuard(fields.rank, ctx.minRank);
    await requirePermissionGuard(fields, ctx.resolvedPermissions);

    const guildRoles = await viaDiscord(fetchGuildRoles);
    const discordRole = guildRoles.find((r) => r.id === discordRoleId);
    if (!discordRole) throw new ExpectedFailure("Discord role not found");

    const capability = await viaDiscord(() =>
      getDiscordSyncCapability(callerId, guildRoles),
    );
    if (!canManageDiscordRolePosition(capability, discordRole.position)) {
      throw new ExpectedFailure(NO_PERMISSION_MESSAGE);
    }

    return viaDiscord(() => _importRoleFromDiscord(discordRoleId, fields));
  }, "Role imported from Discord.");
}

/** Links a DevDogs role to an existing Discord role; the DevDogs role wins the first sync. */
export async function linkRoleToDiscord(
  roleId: string,
  discordRoleId: string,
): Promise<ActionResult> {
  const access = await authorize(rules.manageRoles);
  if (!access.ok) return access;

  const callerId = access.caller.userId;
  const ctx = {
    resolvedPermissions: access.caller.flags,
    minRank: access.caller.minRank,
  };
  return expected(async (): Promise<undefined> => {
    const target = await getTargetRole(roleId);
    requireRankGuard(requireCustomRole(target), ctx.minRank);

    const guildRoles = await viaDiscord(fetchGuildRoles);
    const discordRole = guildRoles.find((r) => r.id === discordRoleId);
    if (!discordRole) throw new ExpectedFailure("Discord role not found");

    const capability = await viaDiscord(() =>
      getDiscordSyncCapability(callerId, guildRoles),
    );
    if (!canManageDiscordRolePosition(capability, discordRole.position)) {
      throw new ExpectedFailure(NO_PERMISSION_MESSAGE);
    }

    await viaDiscord(() => _linkRoleToDiscord(roleId, discordRoleId));
    // Linking strips the role from holders without a linked Discord account.
    revalidateOfficers();
  }, "Role linked to Discord.");
}

/** Creates a Discord role from a DevDogs role and links the two. */
export async function createDiscordRoleFromRole(
  roleId: string,
): Promise<ActionResult> {
  const access = await authorize(rules.manageRoles);
  if (!access.ok) return access;

  const callerId = access.caller.userId;
  const ctx = {
    resolvedPermissions: access.caller.flags,
    minRank: access.caller.minRank,
  };
  return expected(async (): Promise<undefined> => {
    const target = await getTargetRole(roleId);
    requireRankGuard(requireCustomRole(target), ctx.minRank);

    const guildRoles = await viaDiscord(fetchGuildRoles);
    const capability = await viaDiscord(() =>
      getDiscordSyncCapability(callerId, guildRoles),
    );
    if (!canManageDiscordRolePosition(capability, 0)) {
      throw new ExpectedFailure(
        "Your Discord account doesn't have permission to create Discord roles.",
      );
    }

    await viaDiscord(() => _createDiscordRoleFromRole(roleId));
    revalidateOfficers();
  }, "Created the Discord role and linked it.");
}

/** Clears a role's Discord link. The Discord role and its members are untouched. */
export async function unsyncRole(roleId: string): Promise<ActionResult> {
  const access = await authorize(rules.manageRoles);
  if (!access.ok) return access;

  const ctx = {
    resolvedPermissions: access.caller.flags,
    minRank: access.caller.minRank,
  };
  return expected(async (): Promise<undefined> => {
    const target = await getTargetRole(roleId);
    requireRankGuard(requireCustomRole(target), ctx.minRank);
    await _unsyncRole(roleId);
  }, "Role unsynced from Discord.");
}
