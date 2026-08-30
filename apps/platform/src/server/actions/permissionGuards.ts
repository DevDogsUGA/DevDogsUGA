/**
 * Shared synchronous rank/role guards used by `permissions.ts` and
 * `discordRoleSync.ts`. They sit in their own module because "use server"
 * files may only export async functions, so they cannot be exported alongside
 * the server actions that use them.
 */

export function requireRankGuard(targetRank: number, callerMinRank: number) {
  if (targetRank <= callerMinRank) {
    throw new Error(
      "Not authorized: cannot manage a role with equal or higher authority than your own",
    );
  }
}

/**
 * Throws unless `target` is a `custom` role, narrowing `rank` to `number` on
 * success. The "default" (Member) and "root" (Root) roles are not directly
 * editable, deletable, reorderable, or assignable/removable: Root changes
 * hands only via `transferRootRole`, and Member is never assigned at all.
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
