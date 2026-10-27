export interface AttendanceCount {
  total: number;
  officers: number;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "12 attended · 9 members + 3 officers" (Q13). An officer is anyone who holds
 * a leadership role when the count is read, so the split moves as roles do.
 */
export function formatAttendanceCount({
  total,
  officers,
}: AttendanceCount): string {
  const members = Math.max(0, total - officers);
  if (total === 0) return "0 attended";
  return `${total} attended · ${plural(members, "member", "members")} + ${plural(officers, "officer", "officers")}`;
}
