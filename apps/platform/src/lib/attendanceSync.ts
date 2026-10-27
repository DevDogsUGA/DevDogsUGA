/**
 * The "fix by hand in Bevy and Engage" to-dos (console meeting detail, Q12).
 *
 * Nothing propagates automatically: Bevy's bulk upload only adds and Engage
 * rows can only be set to NA. So the meeting page lists what changed after the
 * meeting's last attendance export. An attendee added and then removed (or the
 * reverse) since the export nets to nothing, because the outside systems still
 * match.
 */

export interface AttendanceChange {
  kind: "added" | "removed";
  userId: string;
  at: Date;
}

export interface SyncTodo {
  kind: "add" | "remove";
  userId: string;
  /** When the change that makes this a to-do was made. */
  at: Date;
}

/**
 * Collapses the changes made since the last export into one to-do per person.
 * The first change tells whether they were in the room's record at export time
 * (a first `removed` means present, a first `added` means absent) and the last
 * one tells where they stand now; equal means nothing to fix.
 */
export function syncTodos(
  changes: readonly AttendanceChange[],
  lastExportAt: Date | null,
): SyncTodo[] {
  if (lastExportAt === null) return [];
  const byUser = new Map<string, AttendanceChange[]>();
  for (const change of changes) {
    if (change.at <= lastExportAt) continue;
    const list = byUser.get(change.userId) ?? [];
    list.push(change);
    byUser.set(change.userId, list);
  }

  const todos: SyncTodo[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const presentAtExport = first.kind === "removed";
    const presentNow = last.kind === "added";
    if (presentAtExport === presentNow) continue;
    todos.push({ kind: presentNow ? "add" : "remove", userId, at: last.at });
  }
  return todos.sort((a, b) => a.at.getTime() - b.at.getTime());
}
