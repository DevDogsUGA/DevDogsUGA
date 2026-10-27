import { describe, expect, it } from "vitest";
import { syncTodos, type AttendanceChange } from "./attendanceSync";

const exportAt = new Date("2026-10-26T20:00:00Z");
const at = (minutes: number) => new Date(exportAt.getTime() + minutes * 60_000);
const change = (
  kind: AttendanceChange["kind"],
  userId: string,
  minutes: number,
): AttendanceChange => ({ kind, userId, at: at(minutes) });

describe("syncTodos", () => {
  it("lists nothing when the meeting was never exported", () => {
    expect(syncTodos([change("added", "a", 5)], null)).toEqual([]);
  });

  it("ignores changes made before or at the export", () => {
    expect(
      syncTodos(
        [change("added", "a", -5), change("removed", "b", 0)],
        exportAt,
      ),
    ).toEqual([]);
  });

  it("lists an add and a removal made after the export", () => {
    expect(
      syncTodos(
        [change("removed", "b", 20), change("added", "a", 10)],
        exportAt,
      ),
    ).toEqual([
      { kind: "add", userId: "a", at: at(10) },
      { kind: "remove", userId: "b", at: at(20) },
    ]);
  });

  it("nets an add then a removal, and a removal then a re-add, to nothing", () => {
    expect(
      syncTodos(
        [
          change("added", "a", 1),
          change("removed", "a", 2),
          change("removed", "b", 3),
          change("added", "b", 4),
        ],
        exportAt,
      ),
    ).toEqual([]);
  });

  it("keeps one to-do per person across repeated flips", () => {
    expect(
      syncTodos(
        [
          change("added", "a", 1),
          change("removed", "a", 2),
          change("added", "a", 3),
        ],
        exportAt,
      ),
    ).toEqual([{ kind: "add", userId: "a", at: at(3) }]);
  });
});
