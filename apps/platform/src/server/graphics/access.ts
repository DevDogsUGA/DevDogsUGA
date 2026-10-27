import { mayUseGraphics } from "~/lib/graphicsAccess";
import { getCallerContext } from "~/server/actions/permissions";

/**
 * Who may use the console's graphics: meeting graphics and the brand assets.
 *
 * Any officer (a role marked `isLeadership`), so a designer on the leadership
 * team does not need attendance powers to export a poster. Attendance tools
 * keep their own `canManageAttendance` gate; this is deliberately a separate
 * predicate rather than a widening of that one.
 *
 * `canManageAttendance` also passes. Anyone who may run the projector display
 * could already open the meeting page the graphics hang off, and locking them
 * out of it would be a regression for no product reason.
 *
 * Not in `actions/permissions.ts`: that file is `"use server"`, which would
 * publish every export as a callable server action.
 */
export async function canUserUseGraphics(userId: string): Promise<boolean> {
  const { isLeader, resolvedPermissions } = await getCallerContext(userId);

  return mayUseGraphics({
    isLeader,
    canManageAttendance: resolvedPermissions.canManageAttendance,
  });
}
