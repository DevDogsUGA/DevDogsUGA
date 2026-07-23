"use server";

import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "~/server/db";
import {
  ROOT_ROLE_ID,
  profiles,
  resolvedUserPermissions,
  roles,
  userRoles,
} from '~/server/db/schema';
import { refreshUserPermissions } from "~/server/db/refreshPermissions";
import { expectSession } from "~/server/auth";
import { supabaseAdmin } from "~/supabase/admin";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import {
  canManageDiscordRolePosition,
  getDiscordSyncCapability,
} from "~/server/discord/adminCapability";
import {
  getDiscordUserId,
  pushMemberRoleChange,
} from "~/server/discord/memberSync";
import { fetchGuildRoles, pushRoleToDiscord } from "~/server/discord/roleSync";
import { requireCustomRole, requireRankGuard } from "./permissionGuards";

// ── Types ─────────────────────────────────────────────────────────────────────

type RoleRow = typeof roles.$inferSelect;

/**
 * Every nullable-boolean column on `roles` is a rank-inherited permission
 * flag. `isLeadership`/`showOnProfile` are `notNull` and are excluded
 * automatically — see the comment above the `roles` table definition.
 */
type PermissionKey = {
  [K in keyof RoleRow]: null extends RoleRow[K]
    ? RoleRow[K] extends boolean | null
      ? K
      : never
    : never;
}[keyof RoleRow];

const PERMISSION_KEYS = [
  "canModerate",
  "canManageRoles",
  "canManageSuspensions",
  "canViewAuditLog",
  "canManageFeedback",
  "canCreateCredentials",
  "canManageVerification",
] as const satisfies readonly PermissionKey[];

// Two-way exhaustiveness check: fails to compile if a nullable-boolean
// column is added to `roles` but missing from PERMISSION_KEYS, or if
// PERMISSION_KEYS contains a key that's no longer a nullable-boolean column.
type _MissingFromList = Exclude<
  PermissionKey,
  (typeof PERMISSION_KEYS)[number]
>;
type _ExtraInList = Exclude<(typeof PERMISSION_KEYS)[number], PermissionKey>;
const _checkComplete: _MissingFromList extends never
  ? true
  : ["PERMISSION_KEYS is missing", _MissingFromList] = true;
const _checkNoExtra: _ExtraInList extends never
  ? true
  : ["PERMISSION_KEYS has a stale entry", _ExtraInList] = true;
void _checkComplete;
void _checkNoExtra;

export type ResolvedPermissions = Record<PermissionKey, boolean>;

export type RoleSummary = {
  id: string;
  title: string;
  color: string | null;
  rank: number;
  discordRoleId: string | null;
};

export type UserSearchResult = {
  id: string;
  preferredName: string;
  email: string;
  roles: RoleSummary[];
  hasDiscordLinked: boolean;
};

// ── Permission resolution ──────────────────────────────────────────────────────

const ALL_PERMISSIONS_FALSE: ResolvedPermissions = {
  canModerate: false,
  canManageRoles: false,
  canManageSuspensions: false,
  canViewAuditLog: false,
  canManageFeedback: false,
  canCreateCredentials: false,
  canManageVerification: false,
};

/** Returns the userId of the current Root holder, or null if unassigned. */
export async function getRootHolderId(): Promise<string | null> {
  const [row] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, ROOT_ROLE_ID))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Resolves all 7 permission flags for a user from the
 * `resolvedUserPermissions` materialized view. The view already handles the
 * Root role (all-true override) and rank-inherited permission resolution.
 * Users with no role assignments won't appear in the view and get all-false.
 */
export async function resolveUserPermissions(
  userId: string,
): Promise<ResolvedPermissions> {
  const [row] = await db
    .select({
      canModerate: resolvedUserPermissions.canModerate,
      canManageRoles: resolvedUserPermissions.canManageRoles,
      canManageSuspensions: resolvedUserPermissions.canManageSuspensions,
      canViewAuditLog: resolvedUserPermissions.canViewAuditLog,
      canManageFeedback: resolvedUserPermissions.canManageFeedback,
      canCreateCredentials: resolvedUserPermissions.canCreateCredentials,
      canManageVerification: resolvedUserPermissions.canManageVerification,
    })
    .from(resolvedUserPermissions)
    .where(eq(resolvedUserPermissions.userId, userId))
    .limit(1);

  return row ?? ALL_PERMISSIONS_FALSE;
}

/**
 * Returns the caller's resolved permissions, minimum rank (highest authority
 * role), and `isLeader` trait from the `resolvedUserPermissions` materialized
 * view.
 */
export async function getCallerContext(userId: string): Promise<{
  resolvedPermissions: ResolvedPermissions;
  minRank: number;
  isLeader: boolean;
}> {
  const [row] = await db
    .select()
    .from(resolvedUserPermissions)
    .where(eq(resolvedUserPermissions.userId, userId))
    .limit(1);

  if (!row) {
    return {
      resolvedPermissions: ALL_PERMISSIONS_FALSE,
      minRank: Infinity,
      isLeader: false,
    };
  }

  return {
    resolvedPermissions: {
      canModerate: row.canModerate,
      canManageRoles: row.canManageRoles,
      canManageSuspensions: row.canManageSuspensions,
      canViewAuditLog: row.canViewAuditLog,
      canManageFeedback: row.canManageFeedback,
      canCreateCredentials: row.canCreateCredentials,
      canManageVerification: row.canManageVerification,
    },
    minRank: row.minRank,
    isLeader: row.isLeader,
  };
}

// ── Per-flag helpers (thin wrappers consumed by loaders and action files) ──────

export async function canUserModerate(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canModerate);
}
export async function canUserManageRoles(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageRoles);
}
export async function canUserManageSuspensions(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageSuspensions);
}
export async function canUserViewAuditLog(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canViewAuditLog);
}
export async function canUserManageFeedback(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageFeedback);
}
export async function canUserCreateCredentials(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canCreateCredentials);
}
export async function canUserManageVerification(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageVerification);
}

// ── Shared guards ─────────────────────────────────────────────────────────────

export async function requireManageRoles(): Promise<{
  callerId: string;
  ctx: { resolvedPermissions: ResolvedPermissions; minRank: number };
}> {
  const callerId = await expectSession();
  const ctx = await getCallerContext(callerId);
  if (!ctx.resolvedPermissions.canManageRoles) {
    throw new Error("Not authorized: canManageRoles required");
  }
  return { callerId, ctx };
}

export async function requirePermissionGuard(
  requested: Partial<
    Record<keyof ResolvedPermissions, boolean | null | undefined>
  >,
  callerPerms: ResolvedPermissions,
): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    if (requested[key] === true && !callerPerms[key]) {
      throw new Error(
        `Not authorized: you do not hold the "${key}" permission`,
      );
    }
  }
}

// ── Role CRUD ─────────────────────────────────────────────────────────────────

export type CreateRoleInput = {
  title: string;
  description?: string;
  rank: number;
  color?: string;
  showOnProfile?: boolean;
  isLeadership?: boolean;
  canModerate?: boolean | null;
  canManageRoles?: boolean | null;
  canManageSuspensions?: boolean | null;
  canViewAuditLog?: boolean | null;
  canManageFeedback?: boolean | null;
  canCreateCredentials?: boolean | null;
  canManageVerification?: boolean | null;
};

export async function createRole(
  data: CreateRoleInput,
): Promise<{ id: string }> {
  const { ctx } = await requireManageRoles();
  requireRankGuard(data.rank, ctx.minRank);
  await requirePermissionGuard(data, ctx.resolvedPermissions);

  const [row] = await db
    .insert(roles)
    .values({
      title: data.title.trim(),
      description: data.description?.trim() ?? "",
      rank: data.rank,
      color: data.color ?? null,
      ...(data.showOnProfile !== undefined && {
        showOnProfile: data.showOnProfile,
      }),
      ...(data.isLeadership !== undefined && {
        isLeadership: data.isLeadership,
      }),
      canModerate: data.canModerate ?? null,
      canManageRoles: data.canManageRoles ?? null,
      canManageSuspensions: data.canManageSuspensions ?? null,
      canViewAuditLog: data.canViewAuditLog ?? null,
      canManageFeedback: data.canManageFeedback ?? null,
      canCreateCredentials: data.canCreateCredentials ?? null,
      canManageVerification: data.canManageVerification ?? null,
    })
    .returning({ id: roles.id });

  if (!row) throw new Error("Failed to create role");
  return { id: row.id };
}

export async function updateRole(
  roleId: string,
  data: Partial<CreateRoleInput>,
): Promise<void> {
  const { ctx } = await requireManageRoles();

  const [target] = await db
    .select({
      rank: roles.rank,
      roleType: roles.roleType,
      title: roles.title,
      color: roles.color,
      discordRoleId: roles.discordRoleId,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");

  requireRankGuard(requireCustomRole(target), ctx.minRank);
  if (data.rank !== undefined) requireRankGuard(data.rank, ctx.minRank);
  await requirePermissionGuard(data, ctx.resolvedPermissions);

  await db
    .update(roles)
    .set({
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && {
        description: data.description.trim(),
      }),
      ...(data.rank !== undefined && { rank: data.rank }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.showOnProfile !== undefined && {
        showOnProfile: data.showOnProfile,
      }),
      ...(data.isLeadership !== undefined && {
        isLeadership: data.isLeadership,
      }),
      ...(data.canModerate !== undefined && { canModerate: data.canModerate }),
      ...(data.canManageRoles !== undefined && {
        canManageRoles: data.canManageRoles,
      }),
      ...(data.canManageSuspensions !== undefined && {
        canManageSuspensions: data.canManageSuspensions,
      }),
      ...(data.canViewAuditLog !== undefined && {
        canViewAuditLog: data.canViewAuditLog,
      }),
      ...(data.canManageFeedback !== undefined && {
        canManageFeedback: data.canManageFeedback,
      }),
      ...(data.canCreateCredentials !== undefined && {
        canCreateCredentials: data.canCreateCredentials,
      }),
      ...(data.canManageVerification !== undefined && {
        canManageVerification: data.canManageVerification,
      }),
    })
    .where(eq(roles.id, roleId));

  await refreshUserPermissions();

  if (
    target.discordRoleId !== null &&
    (data.title !== undefined || data.color !== undefined)
  ) {
    try {
      await pushRoleToDiscord({
        id: roleId,
        title: data.title !== undefined ? data.title.trim() : target.title,
        color: data.color !== undefined ? data.color : target.color,
        discordRoleId: target.discordRoleId,
      });
    } catch (err) {
      throw new Error(
        `Role updated, but Discord sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export async function deleteRole(roleId: string): Promise<void> {
  const { ctx } = await requireManageRoles();

  const [target] = await db
    .select({ rank: roles.rank, roleType: roles.roleType })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");

  requireRankGuard(requireCustomRole(target), ctx.minRank);
  await db.delete(roles).where(eq(roles.id, roleId));
  await refreshUserPermissions();
}

/**
 * Reorders a role to a new rank position using the bisection value passed
 * from the client (same pattern as profileLinks sortOrder).
 */
export async function reorderRole(
  roleId: string,
  newRank: number,
): Promise<void> {
  const { ctx } = await requireManageRoles();

  const [target] = await db
    .select({ rank: roles.rank, roleType: roles.roleType })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");

  requireRankGuard(requireCustomRole(target), ctx.minRank);
  requireRankGuard(newRank, ctx.minRank);

  await db.update(roles).set({ rank: newRank }).where(eq(roles.id, roleId));
  await refreshUserPermissions();
}

// ── User role assignment ───────────────────────────────────────────────────────

export async function assignRoleToUser(
  targetUserId: string,
  roleId: string,
): Promise<void> {
  const { callerId, ctx } = await requireManageRoles();

  const [target] = await db
    .select({
      rank: roles.rank,
      roleType: roles.roleType,
      discordRoleId: roles.discordRoleId,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");

  requireRankGuard(requireCustomRole(target), ctx.minRank);

  if (target.discordRoleId !== null) {
    const discordUserId = await getDiscordUserId(targetUserId);
    if (!discordUserId) {
      throw new Error(
        "This role is synced with Discord — the user must link their Discord account first.",
      );
    }

    const guildRoles = await fetchGuildRoles();
    const discordRole = guildRoles.find((r) => r.id === target.discordRoleId);
    const targetPosition = discordRole?.position ?? Infinity;
    const capability = await getDiscordSyncCapability(callerId, guildRoles);
    if (!canManageDiscordRolePosition(capability, targetPosition)) {
      throw new Error(
        "Your Discord account doesn't have permission to manage this role.",
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(userRoles)
        .values({ userId: targetUserId, roleId })
        .onConflictDoNothing();
      await pushMemberRoleChange(discordUserId, target.discordRoleId!, "add");
    });
    await refreshUserPermissions();
    return;
  }

  await db
    .insert(userRoles)
    .values({ userId: targetUserId, roleId })
    .onConflictDoNothing();
  await refreshUserPermissions();
}

export async function removeRoleFromUser(
  targetUserId: string,
  roleId: string,
): Promise<void> {
  const { callerId, ctx } = await requireManageRoles();

  const [target] = await db
    .select({
      rank: roles.rank,
      roleType: roles.roleType,
      discordRoleId: roles.discordRoleId,
    })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  if (!target) throw new Error("Role not found");

  requireRankGuard(requireCustomRole(target), ctx.minRank);

  if (target.discordRoleId !== null) {
    const guildRoles = await fetchGuildRoles();
    const discordRole = guildRoles.find((r) => r.id === target.discordRoleId);
    const targetPosition = discordRole?.position ?? Infinity;
    const capability = await getDiscordSyncCapability(callerId, guildRoles);
    if (!canManageDiscordRolePosition(capability, targetPosition)) {
      throw new Error(
        "Your Discord account doesn't have permission to manage this role.",
      );
    }
  }

  await db
    .delete(userRoles)
    .where(
      and(eq(userRoles.userId, targetUserId), eq(userRoles.roleId, roleId)),
    );
  await refreshUserPermissions();

  if (target.discordRoleId !== null) {
    const discordUserId = await getDiscordUserId(targetUserId);
    if (discordUserId) {
      try {
        await pushMemberRoleChange(
          discordUserId,
          target.discordRoleId,
          "remove",
        );
      } catch (err) {
        throw new Error(
          `Role removed, but Discord sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

// ── User search ───────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  await expectSession();

  const trimmed = query.trim();
  if (!trimmed) return [];

  // Search profiles by preferred name; get auth email via supabaseAdmin
  const profileRows = await db
    .select({
      userId: profiles.userId,
      preferredName: profiles.preferredName,
    })
    .from(profiles)
    .where(ilike(profiles.preferredName, `%${trimmed}%`))
    .limit(20);

  if (profileRows.length === 0) return [];

  const userIds = profileRows.map((r) => r.userId);

  // Fetch emails from auth.users via supabaseAdmin
  const emailMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data.user?.email) emailMap.set(id, data.user.email);
    }),
  );

  // Fetch assigned roles for these users (custom roles only — Member has no
  // assignments and Root is shown separately via RootAccessCard)
  const roleRows = await db
    .select({
      userId: userRoles.userId,
      roleId: roles.id,
      title: roles.title,
      color: roles.color,
      rank: roles.rank,
      discordRoleId: roles.discordRoleId,
    })
    .from(userRoles)
    .innerJoin(
      roles,
      and(eq(roles.id, userRoles.roleId), eq(roles.roleType, "custom")),
    )
    .where(
      userIds.length === 1
        ? eq(userRoles.userId, userIds[0]!)
        : or(...userIds.map((id) => eq(userRoles.userId, id)))!,
    )
    .orderBy(asc(roles.rank));

  const rolesByUser = new Map<string, RoleSummary[]>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push({
      id: row.roleId,
      title: row.title,
      color: row.color,
      rank: row.rank ?? 0,
      discordRoleId: row.discordRoleId,
    });
    rolesByUser.set(row.userId, list);
  }

  // Batch-check which of these users have a linked Discord account
  const discordLinkedRows = await db
    .select({ userId: identitiesInAuth.userId })
    .from(identitiesInAuth)
    .where(
      and(
        eq(identitiesInAuth.provider, "discord"),
        inArray(identitiesInAuth.userId, userIds),
      ),
    );
  const discordLinkedSet = new Set(discordLinkedRows.map((r) => r.userId));

  return profileRows.map((p) => ({
    id: p.userId,
    preferredName: p.preferredName,
    email: emailMap.get(p.userId) ?? "",
    roles: rolesByUser.get(p.userId) ?? [],
    hasDiscordLinked: discordLinkedSet.has(p.userId),
  }));
}

// ── Permission inspection ─────────────────────────────────────────────────────

export async function getUserResolvedPermissions(userId: string): Promise<{
  roles: RoleSummary[];
  resolved: ResolvedPermissions;
}> {
  await expectSession();

  const [assignedRoles, resolved] = await Promise.all([
    db
      .select({
        id: roles.id,
        title: roles.title,
        color: roles.color,
        rank: roles.rank,
        discordRoleId: roles.discordRoleId,
      })
      .from(userRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, userRoles.roleId), eq(roles.roleType, "custom")),
      )
      .where(eq(userRoles.userId, userId))
      .orderBy(asc(roles.rank)),
    resolveUserPermissions(userId),
  ]);

  return {
    roles: assignedRoles.map((r) => ({ ...r, rank: r.rank ?? 0 })),
    resolved,
  };
}

// ── Highest-ranking role ─────────────────────────────────────────────────────

export type HighestRankingRole = { title: string; color: string | null };

/**
 * Returns the title/color of the user's highest-ranking role, for display
 * next to their name (sidebar, profile popover). The Root holder always
 * shows the Root role; everyone else shows their min-rank `custom` role, or
 * falls back to the implicit "Member" role if they hold none.
 */
export async function getHighestRankingRole(
  userId: string,
): Promise<HighestRankingRole> {
  const [row] = await db
    .select({ title: roles.title, color: roles.color })
    .from(userRoles)
    .innerJoin(
      roles,
      and(
        eq(roles.id, userRoles.roleId),
        eq(roles.roleType, "custom"),
        eq(roles.showOnProfile, true),
      ),
    )
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(roles.rank))
    .limit(1);

  return row ?? { title: "Member", color: null };
}

// ── Root transfer ─────────────────────────────────────────────────────────────

/**
 * Transfers the singleton Root role to another user. Only the current Root
 * holder may call this — there is no other path to assigning Root.
 */
export async function transferRootRole(targetUserId: string): Promise<void> {
  const callerId = await expectSession();

  const currentRootId = await getRootHolderId();
  if (currentRootId !== callerId) {
    throw new Error(
      "Not authorized: only the current Root holder can transfer this role",
    );
  }
  if (targetUserId === callerId) {
    throw new Error("You already hold the Root role");
  }

  const [targetProfile] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, targetUserId))
    .limit(1);
  if (!targetProfile) throw new Error("Target user not found");

  await db
    .update(userRoles)
    .set({ userId: targetUserId })
    .where(eq(userRoles.roleId, ROOT_ROLE_ID));
  await refreshUserPermissions();
}
