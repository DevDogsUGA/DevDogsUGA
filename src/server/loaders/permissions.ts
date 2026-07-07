import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { APIRole } from "discord-api-types/v10";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { profiles, roles } from '~/server/db/schema';
import {
  getCallerContext,
  getRootHolderId,
  type ResolvedPermissions,
} from "~/server/actions/permissions";
import {
  getDiscordSyncCapability,
  type DiscordSyncCapability,
} from "~/server/discord/adminCapability";
import { reconcileRoleDefinitions } from "~/server/discord/reconcile";
import { fetchGuildRoles } from "~/server/discord/roleSync";
import { supabaseAdmin } from "~/supabase/admin";

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
  canManageFeedback: boolean | null;
  canCreateCredentials: boolean | null;
  canManageVerification: boolean | null;
  discordRoleId: string | null;
  discordSyncedName: string | null;
  discordRolePosition: number | null;
  createdAt: string;
};

export type RootHolder = {
  id: string;
  preferredName: string;
  email: string;
};

export type PermissionsPageData = {
  roles: RoleRow[];
  callerMinRank: number;
  callerPermissions: ResolvedPermissions;
  rootHolder: RootHolder | null;
  isRootHolder: boolean;
  discordSyncErrors: string[];
  callerCapability: DiscordSyncCapability;
};

export const getPermissionsPageData = cache(
  async (): Promise<PermissionsPageData> => {
    const userId = await expectSession().catch(() => redirect("/auth"));
    const ctx = await getCallerContext(userId);
    if (!ctx.resolvedPermissions.canManageRoles) redirect("/");

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

    const [roleRows, rootHolderId] = await Promise.all([
      db
        .select()
        .from(roles)
        .where(eq(roles.roleType, "custom"))
        .orderBy(asc(roles.rank)),
      getRootHolderId(),
    ]);

    let rootHolder: RootHolder | null = null;
    if (rootHolderId) {
      const [[profile], { data }] = await Promise.all([
        db
          .select({ preferredName: profiles.preferredName })
          .from(profiles)
          .where(eq(profiles.userId, rootHolderId))
          .limit(1),
        supabaseAdmin.auth.admin.getUserById(rootHolderId),
      ]);

      rootHolder = {
        id: rootHolderId,
        preferredName: profile?.preferredName ?? "",
        email: data.user?.email ?? "",
      };
    }

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
        canManageFeedback: r.canManageFeedback,
        canCreateCredentials: r.canCreateCredentials,
        canManageVerification: r.canManageVerification,
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
      rootHolder,
      isRootHolder: rootHolderId === userId,
      discordSyncErrors,
      callerCapability,
    };
  },
);
