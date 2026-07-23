/**
 * Shared synchronous rank/role guards used by `permissions.ts` and
 * `discordRoleSync.ts`. Pulled into their own module because "use server"
 * files may only export async functions — these can't live (as exports)
 * alongside the server actions that use them.
 */

export function requireRankGuard(targetRank: number, callerMinRank: number) {
  if (targetRank <= callerMinRank) {
    throw new Error(
      "Not authorized: cannot manage a role with equal or higher authority than your own",
    );
  }
}

/**
 * The "default" (Member) and "root" (Root) roles are not directly editable,
 * deletable, reorderable, or assignable/removable — Root changes hands only
 * via `transferRootRole`, and Member is never assigned at all. Throws unless
 * `target` is a `custom` role, narrowing `rank` to `number` on success.
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
