import "server-only";

import { asc, and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { resolvedUserPermissions, roles, userRoles } from "~/server/db/schema";
import { expectSession } from "~/server/auth";

/**
 * Permission reads and guards for server code: loaders, route handlers, pages,
 * and the server actions themselves.
 *
 * Not in `actions/permissions.ts`: that file is `"use server"`, which publishes
 * every async export as an endpoint the browser can call with any arguments.
 * Everything here takes an arbitrary `userId` (or trusts the caller to have
 * authorized one), so as a server action it would let any signed-in member
 * probe anyone's permissions. `import "server-only"` also fails the build if a
 * client component ever imports a value from this file (type imports are
 * erased and fine).
 */

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
  "canManageAttendance",
  "canPreviewDocs",
  "canManageOAuthApps",
  "canDeleteAccounts",
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

// ── Permission resolution ──────────────────────────────────────────────────────

const ALL_PERMISSIONS_FALSE: ResolvedPermissions = {
  canModerate: false,
  canManageRoles: false,
  canManageSuspensions: false,
  canViewAuditLog: false,
  canManageAttendance: false,
  canPreviewDocs: false,
  canManageOAuthApps: false,
  canDeleteAccounts: false,
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
      canManageAttendance: resolvedUserPermissions.canManageAttendance,
      canPreviewDocs: resolvedUserPermissions.canPreviewDocs,
      canManageOAuthApps: resolvedUserPermissions.canManageOAuthApps,
      canDeleteAccounts: resolvedUserPermissions.canDeleteAccounts,
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
      canManageAttendance: row.canManageAttendance,
      canPreviewDocs: row.canPreviewDocs,
      canManageOAuthApps: row.canManageOAuthApps,
      canDeleteAccounts: row.canDeleteAccounts,
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
export async function canUserManageAttendance(
  userId: string,
): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageAttendance);
}
export async function canUserPreviewDocs(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canPreviewDocs);
}
export async function canUserManageOAuthApps(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canManageOAuthApps);
}
export async function canUserDeleteAccounts(userId: string): Promise<boolean> {
  return resolveUserPermissions(userId).then((p) => p.canDeleteAccounts);
}

/**
 * Whether the user is an officer: holds a role marked `isLeadership`. Gates
 * the badge console. Not a `ResolvedPermissions` flag (those are inherited
 * per-capability booleans), so it reads the `isLeader` trait directly.
 */
export async function isOfficer(userId: string): Promise<boolean> {
  return getCallerContext(userId).then((ctx) => ctx.isLeader);
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

// ── Rank and role guards ──────────────────────────────────────────────────────

export function requireRankGuard(targetRank: number, callerMinRank: number) {
  if (targetRank <= callerMinRank) {
    throw new Error(
      "Not authorized: cannot manage a role with equal or higher authority than your own",
    );
  }
}

/**
 * Throws unless `target` is a `custom` role, narrowing `rank` to `number` on
 * success. The "default" (Member) role is not directly editable, deletable,
 * reorderable, or assignable/removable: Member is never assigned at all.
 */
export function requireCustomRole(target: {
  rank: number | null;
  roleType: string;
}): number {
  if (target.roleType !== "custom" || target.rank === null) {
    throw new Error("Not authorized: this role cannot be modified directly");
  }
  return target.rank;
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
