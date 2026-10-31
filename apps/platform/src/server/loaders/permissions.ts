import { asc, eq } from "drizzle-orm";
import { cache } from "react";

import type { APIRole } from "discord-api-types/v10";
import { requireAccess, rules } from "~/server/auth/access";
import { db } from "~/server/db";
import { roles } from "~/server/db/schema";
import { type ResolvedPermissions } from "~/server/auth/permissions";
import {
  getDiscordSyncCapability,
  type DiscordSyncCapability,
} from "~/server/discord/adminCapability";
import { reconcileRoleDefinitions } from "~/server/discord/reconcile";
import { fetchGuildRoles } from "~/server/discord/roleSync";

export type RoleRow = {
  id: string;
  title: string;
  description: string;
  rank: number;
  color: string | null;
  showOnProfile: boolean;
  isLeadership: boolean;
  canModerate: boolean | null;
  canManageRoles: boolean | null;
  canManageSuspensions: boolean | null;
  canViewAuditLog: boolean | null;
  canManageAttendance: boolean | null;
  canPreviewDocs: boolean | null;
  canManageOAuthApps: boolean | null;
  canDeleteAccounts: boolean | null;
  canReviewProjectReports: boolean | null;
  discordRoleId: string | null;
  discordSyncedName: string | null;
  discordRolePosition: number | null;
  createdAt: string;
};

export type PermissionsPageData = {
  roles: RoleRow[];
  callerMinRank: number;
  callerPermissions: ResolvedPermissions;
  discordSyncErrors: string[];
  callerCapability: DiscordSyncCapability;
};

export const getPermissionsPageData = cache(
  async (): Promise<PermissionsPageData> => {
    const caller = await requireAccess(rules.manageRoles);
    const userId = caller.userId;
    const ctx = { resolvedPermissions: caller.flags, minRank: caller.minRank };

    const discordSyncErrors: string[] = [];

    let guildRoles: APIRole[] | null = null;
    try {
      guildRoles = await fetchGuildRoles();
    } catch (err) {
      discordSyncErrors.push(
        `Failed to fetch Discord guild roles: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (guildRoles) {
      const { errors } = await reconcileRoleDefinitions(guildRoles).catch(
        (err: unknown) => ({
          changes: 0,
          errors: [
            `Failed to sync role definitions with Discord: ${err instanceof Error ? err.message : String(err)}`,
          ],
        }),
      );
      discordSyncErrors.push(...errors);
    }

    const callerCapability: DiscordSyncCapability = guildRoles
      ? await getDiscordSyncCapability(userId, guildRoles)
      : { linked: false };

    const guildRolesById = new Map((guildRoles ?? []).map((r) => [r.id, r]));

    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.roleType, "custom"))
      .orderBy(asc(roles.rank));

    return {
      roles: roleRows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        rank: r.rank ?? 0,
        color: r.color,
        showOnProfile: r.showOnProfile,
        isLeadership: r.isLeadership,
        canModerate: r.canModerate,
        canManageRoles: r.canManageRoles,
        canManageSuspensions: r.canManageSuspensions,
        canViewAuditLog: r.canViewAuditLog,
        canManageAttendance: r.canManageAttendance,
        canPreviewDocs: r.canPreviewDocs,
        canManageOAuthApps: r.canManageOAuthApps,
        canDeleteAccounts: r.canDeleteAccounts,
        canReviewProjectReports: r.canReviewProjectReports,
        discordRoleId: r.discordRoleId,
        discordSyncedName: r.discordSyncedName,
        discordRolePosition:
          r.discordRoleId !== null
            ? (guildRolesById.get(r.discordRoleId)?.position ?? null)
            : null,
        createdAt: r.createdAt.toISOString(),
      })),
      callerMinRank: ctx.minRank,
      callerPermissions: ctx.resolvedPermissions,
      discordSyncErrors,
      callerCapability,
    };
  },
);
