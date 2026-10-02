"use server";

import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "~/server/db";
import {
  profiles,
  resolvedUserPermissions,
  discordRoleMemberships,
  officerDiscordIds,
  roles,
  userRoles,
} from "~/server/db/schema";
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
import { revalidateOfficers } from "~/server/loaders/officers";
import { requireCustomRole, requireRankGuard } from "./permissionGuards";

// ── Types ─────────────────────────────────────────────────────────────────────

type RoleRow = typeof roles.$inferSelect;

/**
 * Every nullable-boolean column on `roles` is a rank-inherited permission
 * flag. `isLeadership`/`showOnProfile` are `notNull`, so this excludes them
 * automatically. See the comment above the `roles` table definition.
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
  "canManageVerification",
  "canManageAttendance",
  "canExportStars",
  "canPreviewDocs",
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
  canManageVerification: false,
  canManageAttendance: false,
  canExportStars: false,
  canPreviewDocs: false,
};

/**
 * Resolves every permission flag for a user from the
 * `resolvedUserPermissions` materialized view, which already applies rank
 * inheritance. Users with no role assignments don't appear in the view and get
 * all-false.
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
      canManageVerification: resolvedUserPermissions.canManageVerification,
      canManageAttendance: resolvedUserPermissions.canManageAttendance,
      canExportStars: resolvedUserPermissions.canExportStars,
      canPreviewDocs: resolvedUserPermissions.canPreviewDocs,
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
      canManageVerification: row.canManageVerification,
      canManageAttendance: row.canManageAttendance,
      canExportStars: row.canExportStars,
      canPreviewDocs: row.canPreviewDocs,
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
export async function canUserManageVerification(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageVerification);
}
export async function canUserManageAttendance(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageAttendance);
}
export async function canUserExportStars(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canExportStars);
}
export async function canUserPreviewDocs(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canPreviewDocs);
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
//
// None of the mutations below refresh `resolvedUserPermissions` by hand.
// Triggers on `roles` and `userRoles` (migration 20260728000000) maintain the
// view, so every writer gets it, including writers that never go through this
// file such as a dashboard edit or a restored dump.

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
  canManageVerification?: boolean | null;
  canManageAttendance?: boolean | null;
  canExportStars?: boolean | null;
  canPreviewDocs?: boolean | null;
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
      canManageVerification: data.canManageVerification ?? null,
      canManageAttendance: data.canManageAttendance ?? null,
      canExportStars: data.canExportStars ?? null,
      canPreviewDocs: data.canPreviewDocs ?? null,
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
      ...(data.canManageVerification !== undefined && {
        canManageVerification: data.canManageVerification,
      }),
      ...(data.canManageAttendance !== undefined && {
        canManageAttendance: data.canManageAttendance,
      }),
      ...(data.canExportStars !== undefined && {
        canExportStars: data.canExportStars,
      }),
      ...(data.canPreviewDocs !== undefined && {
        canPreviewDocs: data.canPreviewDocs,
      }),
    })
    .where(eq(roles.id, roleId));
  revalidateOfficers();

  if (
    target.discordRoleId !== null &&
    (data.title !== undefined || data.color !== undefined)
  ) {
    try {
      await pushRoleToDiscord({
        id: roleId,
        title: data.title !== undefined ? data.title.trim() : target.title,
        color: data.color ?? target.color,
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
  revalidateOfficers();
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
  revalidateOfficers();
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
    const guildRoles = await fetchGuildRoles();
    const discordRole = guildRoles.find((r) => r.id === target.discordRoleId);
    const targetPosition = discordRole?.position ?? Infinity;
    const capability = await getDiscordSyncCapability(callerId, guildRoles);
    if (!canManageDiscordRolePosition(capability, targetPosition)) {
      throw new Error(
        "Your Discord account doesn't have permission to manage this role.",
      );
    }

    // The grant is recorded either way. With no known Discord account it is
    // pending: the membership cron pushes it once the user links (or an
    // officer's Discord id is stored). A failed push is retried the same way.
    await db
      .insert(userRoles)
      .values({ userId: targetUserId, roleId })
      .onConflictDoNothing();
    const discordUserId = await getDiscordUserId(targetUserId);
    if (discordUserId) {
      try {
        await pushMemberRoleChange(discordUserId, target.discordRoleId, "add");
        await db
          .insert(discordRoleMemberships)
          .values({ userId: targetUserId, roleId })
          .onConflictDoNothing();
      } catch (err) {
        console.error(
          `Failed to add Discord role ${target.discordRoleId} to member ${discordUserId}; the cron will retry:`,
          err,
        );
      }
    }
    revalidateOfficers();
    return;
  }

  await db
    .insert(userRoles)
    .values({ userId: targetUserId, roleId })
    .onConflictDoNothing();
  revalidateOfficers();
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
  revalidateOfficers();

  if (target.discordRoleId !== null) {
    const discordUserId = await getDiscordUserId(targetUserId);
    if (discordUserId) {
      try {
        await pushMemberRoleChange(
          discordUserId,
          target.discordRoleId,
          "remove",
        );
        await db
          .delete(discordRoleMemberships)
          .where(
            and(
              eq(discordRoleMemberships.userId, targetUserId),
              eq(discordRoleMemberships.roleId, roleId),
            ),
          );
      } catch (err) {
        // The snapshot row stays, so the cron retries the Discord removal
        // rather than pulling the role back onto the platform.
        throw new Error(
          `Role removed, but Discord sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

/**
 * Stores (or clears, with `null`) a Discord user id for an officer who hasn't
 * linked Discord yet, so the membership cron can sync their roles right away.
 * The id is entered without OAuth proof, so it is only accepted for users who
 * hold a leadership role, and a linked Discord account overrides it.
 */
export async function setOfficerDiscordId(
  targetUserId: string,
  discordUserId: string | null,
): Promise<void> {
  await requireManageRoles();

  if (discordUserId === null) {
    await db
      .delete(officerDiscordIds)
      .where(eq(officerDiscordIds.userId, targetUserId));
    revalidateOfficers();
    return;
  }

  const id = discordUserId.trim();
  if (!/^[0-9]{15,25}$/.test(id)) {
    throw new Error("A Discord user id is a string of 15 to 25 digits.");
  }

  const [leadership] = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(eq(userRoles.userId, targetUserId), eq(roles.isLeadership, true)),
    )
    .limit(1);
  if (!leadership) {
    throw new Error("Discord ids can only be stored for officers.");
  }

  await db
    .insert(officerDiscordIds)
    .values({ userId: targetUserId, discordUserId: id })
    .onConflictDoUpdate({
      target: officerDiscordIds.userId,
      set: { discordUserId: id },
    });
  revalidateOfficers();
}

// ── User search ───────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  await expectSession();

  const trimmed = query.trim();
  if (!trimmed) return [];

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

  // Emails live in auth.users, not `profiles`, so they need supabaseAdmin.
  const emailMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data.user?.email) emailMap.set(id, data.user.email);
    }),
  );

  // Custom roles only: Member has no assignments.
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

  // "Linked" here means a Discord id is known, from OAuth or an officer's
  // stored id; grants of synced roles to anyone else wait for the link.
  const [discordLinkedRows, officerIdRows] = await Promise.all([
    db
      .select({ userId: identitiesInAuth.userId })
      .from(identitiesInAuth)
      .where(
        and(
          eq(identitiesInAuth.provider, "discord"),
          inArray(identitiesInAuth.userId, userIds),
        ),
      ),
    db
      .select({ userId: officerDiscordIds.userId })
      .from(officerDiscordIds)
      .where(inArray(officerDiscordIds.userId, userIds)),
  ]);
  const discordLinkedSet = new Set([
    ...discordLinkedRows.map((r) => r.userId),
    ...officerIdRows.map((r) => r.userId),
  ]);

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
 * next to their name (sidebar, profile popover): their min-rank `custom` role,
 * or the implicit "Member" role if they hold none.
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
