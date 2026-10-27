/**
 * Who may use the console's graphics, as a pure function of two facts about a
 * caller, so the server gate and the nav agree and neither restates the rule.
 *
 * Any officer (`isLeader`: a role marked `isLeadership`). Attendance managers
 * also pass, since they could already open the meeting pages these hang off.
 * Attendance tools themselves keep `canManageAttendance` alone.
 */
export function mayUseGraphics({
  isLeader,
  canManageAttendance,
}: {
  isLeader: boolean;
  canManageAttendance: boolean;
}): boolean {
  return isLeader || canManageAttendance;
}
